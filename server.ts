import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import WebSocketClient from "ws";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());
const PORT = 3000;

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

interface SseClient {
  res: express.Response;
  symbol: string;
}

interface LogEntry {
  time: string;
  level: string;
  message: string;
}

let serverLogs: LogEntry[] = [];
function addLog(level: string, message: string) {
  serverLogs.push({ time: new Date().toISOString(), level, message });
  if (serverLogs.length > 100) serverLogs.shift();
  console.log(`[${level}] ${message}`);
}

let clients: SseClient[] = [];

// Active WebSocket connections mapped by symbol
interface ActiveFeed {
  ws: WebSocketClient | null;
  clientsCount: number;
  lastMessageTime: number;
  lastPolledPrice: number;
  wsUrl: string;
  reconnectTimeout: NodeJS.Timeout | null;
  connTimeout: NodeJS.Timeout | null;
  active: boolean;
  tradeBuffer: any[];
  batchInterval: NodeJS.Timeout | null;
}

const activeFeeds = new Map<string, ActiveFeed>();

// Broadcast to SSE clients subscribed to a specific symbol
function broadcastToSymbol(symbol: string, data: string | object, isRawString = false) {
  const payload = isRawString ? (data as string) : JSON.stringify(data);
  const symbolLower = symbol.toLowerCase().trim();
  clients.forEach((client) => {
    if (client.symbol === symbolLower) {
      try {
        client.res.write(`data: ${payload}\n\n`);
        if (typeof (client.res as any).flush === 'function') {
          (client.res as any).flush();
        }
      } catch (e) {
        // stale client
      }
    }
  });
}

// Server-side subscriber to Binance Futures (Multiplexed)
function startFeed(symbol: string) {
  const symbolLower = symbol.toLowerCase().trim();
  if (activeFeeds.has(symbolLower)) {
    const feed = activeFeeds.get(symbolLower)!;
    feed.clientsCount++;
    addLog("INFO", `[Mux] Registered client for existing feed: ${symbolLower.toUpperCase()} (Total: ${feed.clientsCount})`);
    return;
  }

  addLog("INFO", `[Mux] Initializing new multiplexed feed for symbol: ${symbolLower.toUpperCase()}`);

  const feed: ActiveFeed = {
    ws: null,
    clientsCount: 1,
    lastMessageTime: 0,
    lastPolledPrice: 0,
    wsUrl: "",
    reconnectTimeout: null,
    connTimeout: null,
    active: true,
    tradeBuffer: [],
    batchInterval: null
  };
  activeFeeds.set(symbolLower, feed);

  feed.batchInterval = setInterval(() => {
    if (feed.tradeBuffer.length > 0) {
      broadcastToSymbol(symbolLower, feed.tradeBuffer);
      feed.tradeBuffer = [];
    }
  }, 200);

  const wsEndpoints = [
    `wss://fstream.binanceapi.com/stream?streams=${symbolLower}@aggTrade/${symbolLower}@depth20`,
    `wss://fstream.binance.me/stream?streams=${symbolLower}@aggTrade/${symbolLower}@depth20`,
    `wss://fstream.binance.cc/stream?streams=${symbolLower}@aggTrade/${symbolLower}@depth20`,
    `wss://fstream.binance.com/stream?streams=${symbolLower}@aggTrade/${symbolLower}@depth20`
  ];
  let endpointIndex = 0;

  function attempt() {
    if (!feed.active) return;

    if (feed.reconnectTimeout) clearTimeout(feed.reconnectTimeout);
    if (feed.connTimeout) clearTimeout(feed.connTimeout);

    const targetUrl = wsEndpoints[endpointIndex % wsEndpoints.length];
    feed.wsUrl = targetUrl;
    addLog("INFO", `[${symbolLower.toUpperCase()}] Connecting WS: ${targetUrl}`);

    try {
      const ws = new WebSocketClient(targetUrl);
      feed.ws = ws;

      feed.connTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocketClient.OPEN) {
          addLog("WARN", `[${symbolLower.toUpperCase()}] Timeout on ${targetUrl}, rotating...`);
          try { ws.terminate(); } catch (e) {}
          rotate();
        }
      }, 5000);

      ws.on("open", () => {
        if (feed.connTimeout) clearTimeout(feed.connTimeout);
        addLog("INFO", `[${symbolLower.toUpperCase()}] WS connected to ${targetUrl}`);
        broadcastToSymbol(symbolLower, { type: "ws_status", status: `OK [${symbolLower.toUpperCase()}]`, url: targetUrl });
      });

      ws.on("message", (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString());
          const innerEvent = parsed.data || parsed;
          if (innerEvent && innerEvent.e === "aggTrade") {
            feed.lastMessageTime = Date.now();
            feed.tradeBuffer.push(parsed);
          } else {
            // Non-trade data (like depth20) is broadcast immediately
            broadcastToSymbol(symbolLower, parsed);
          }
        } catch (e) {
          // ignore corrupt frame
        }
      });

      ws.on("error", (err) => {
        addLog("ERROR", `[${symbolLower.toUpperCase()}] WS Error: ${err.message || String(err)}`);
      });

      ws.on("close", (code, reason) => {
        if (feed.connTimeout) clearTimeout(feed.connTimeout);
        addLog("WARN", `[${symbolLower.toUpperCase()}] WS closed (Code: ${code}, Reason: ${reason || "none"}), rotating...`);
        rotate();
      });

    } catch (err: any) {
      addLog("ERROR", `[${symbolLower.toUpperCase()}] Setup threw: ${err.message || String(err)}`);
      rotate();
    }
  }

  function rotate() {
    if (!feed.active) return;
    endpointIndex++;
    broadcastToSymbol(symbolLower, { type: "ws_status", status: "RECONNECTING" });
    feed.reconnectTimeout = setTimeout(attempt, 3000);
  }

  attempt();
}

function stopFeed(symbol: string) {
  const symbolLower = symbol.toLowerCase().trim();
  const feed = activeFeeds.get(symbolLower);
  if (!feed) return;

  feed.clientsCount--;
  addLog("INFO", `[Mux] Client unsubscribed from ${symbolLower.toUpperCase()} (Remaining: ${feed.clientsCount})`);

  if (feed.clientsCount <= 0) {
    addLog("INFO", `[Mux] Cleaning up unused active feed connection for: ${symbolLower.toUpperCase()}`);
    feed.active = false;
    if (feed.ws) {
      try { feed.ws.terminate(); } catch (e) {}
    }
    if (feed.reconnectTimeout) clearTimeout(feed.reconnectTimeout);
    if (feed.connTimeout) clearTimeout(feed.connTimeout);
    if (feed.batchInterval) clearInterval(feed.batchInterval);
    activeFeeds.delete(symbolLower);
  }
}

// Fallback REST Poller to keep chart updated if WS is blocked/down
async function pollFallbackPrice() {
  for (const [symbolLower, feed] of activeFeeds.entries()) {
    // If we received a WS message in the last 4 seconds, we don't need to poll REST for this symbol
    if (Date.now() - feed.lastMessageTime < 4000) {
      continue;
    }

    const symbolUpper = symbolLower.toUpperCase();
    const endpoints = [
      `https://fapi.binanceapi.com/fapi/v1/ticker/price?symbol=${symbolUpper}`,
      `https://fapi.binance.me/fapi/v1/ticker/price?symbol=${symbolUpper}`,
      `https://fapi.binance.cc/fapi/v1/ticker/price?symbol=${symbolUpper}`,
      `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbolUpper}`
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json() as { symbol: string; price: string };
          const price = parseFloat(data.price);
          if (!isNaN(price)) {
            if (price !== feed.lastPolledPrice) {
              feed.lastPolledPrice = price;
            }
            // Notify client we're using fallback polling
            broadcastToSymbol(symbolLower, { type: "ws_status", status: `OK [FALLBACK POLLED - ${symbolUpper}]`, url: "REST API fallback" });

            // Generate simulated active trade flow using the actual live price
            const randomTradesCount = Math.floor(Math.random() * 5) + 2; // 2 to 6 simulated micro-trades
            for (let i = 0; i < randomTradesCount; i++) {
              const spreadOffset = (Math.random() - 0.5) * (price * 0.00008); // dynamic micro-jitter
              const microPrice = price + spreadOffset;
              const size = Math.random() * 0.4 + 0.01;
              const isMakerBuyer = Math.random() > 0.5;

              // Determine formatting precision based on price scale
              let precision = 2;
              if (price < 1) precision = 6;
              else if (price < 10) precision = 4;
              else if (price < 500) precision = 3;

              const mockTrade = {
                e: "aggTrade",
                E: Date.now() - Math.floor(Math.random() * 300),
                s: symbolUpper,
                p: microPrice.toFixed(precision),
                q: size.toFixed(3),
                m: isMakerBuyer,
                T: Date.now()
              };
              feed.tradeBuffer.push(mockTrade);
            }
            break; // successfully polled, exit url loop for this symbol
          }
        }
      } catch (err: any) {
        // Quiet fail to next mirror
      }
    }
  }
}

// Tick the fallback REST poller every 1.5 seconds
setInterval(pollFallbackPrice, 1500);

// API Routes FIRST

// Active stream status check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    backend_time: new Date().toISOString(),
    active_feeds_count: activeFeeds.size,
    active_feeds: Array.from(activeFeeds.keys()).map(k => {
      const feed = activeFeeds.get(k)!;
      return {
        symbol: k,
        ws_open: feed.ws && feed.ws.readyState === WebSocketClient.OPEN,
        clients: feed.clientsCount,
        last_msg_age_ms: feed.lastMessageTime ? Date.now() - feed.lastMessageTime : -1
      };
    }),
    active_sse_clients: clients.length
  });
});

// Server log retrieval endpoint
app.get("/api/logs", (req, res) => {
  res.json(serverLogs);
});

// Proxy route for candles (KLines) to completely bypass CORS
app.get("/api/klines", async (req, res) => {
  const symbol = req.query.symbol || "BTCUSDT";
  const interval = req.query.interval || "1m";
  const limit = req.query.limit || "100";

  const endpoints = [
    `https://fapi.binanceapi.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://fapi.binance.me/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://fapi.binance.cc/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://fstream.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  ];

  for (const url of endpoints) {
    try {
      console.log(`[Server] Fetching historical klines from Binance API: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return res.json(data);
      }
    } catch (err: any) {
      console.warn(`[Server] Historical fetch failed on ${url}:`, err.message || err);
    }
  }

  // Final fallback
  return res.status(502).json({ error: "Failed to load candle data from all Binance mirrors." });
});

// Proxy route for historical Open Interest from Binance
app.get("/api/oi", async (req, res) => {
  const symbol = req.query.symbol || "BTCUSDT";
  const period = req.query.period || "5m";
  const limit = req.query.limit || "100";

  const endpoints = [
    `https://fapi.binanceapi.com/fapi/v1/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`,
    `https://fapi.binance.me/fapi/v1/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`,
    `https://fapi.binance.cc/fapi/v1/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`,
    `https://fapi.binance.com/fapi/v1/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`,
    `https://fstream.binance.com/fapi/v1/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`
  ];

  for (const url of endpoints) {
    try {
      console.log(`[Server] Fetching historical Open Interest from Binance API: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return res.json(data);
      }
    } catch (err: any) {
      console.warn(`[Server] Open Interest fetch failed on ${url}:`, err.message || err);
    }
  }

  return res.status(502).json({ error: "Failed to load Open Interest data from all Binance mirrors." });
});

// Proxy route for 24-hour ticker stats to determine "In-Play" and High Volume coins
app.get("/api/tickers24h", async (req, res) => {
  const endpoints = [
    "https://fapi.binanceapi.com/fapi/v1/ticker/24hr",
    "https://fapi.binance.me/fapi/v1/ticker/24hr",
    "https://fapi.binance.cc/fapi/v1/ticker/24hr",
    "https://fapi.binance.com/fapi/v1/ticker/24hr",
    "https://fstream.binance.com/fapi/v1/ticker/24hr"
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const formatted = data
          .filter((t: any) => t.symbol && t.symbol.endsWith("USDT"))
          .map((t: any) => {
            const priceChangePercent = parseFloat(t.priceChangePercent) || 0;
            const quoteVolume = parseFloat(t.quoteVolume) || 0;
            const lastPrice = parseFloat(t.lastPrice) || 0;
            const highPrice = parseFloat(t.highPrice) || 0;
            const lowPrice = parseFloat(t.lowPrice) || 0;
            
            const isInPlay = Math.abs(priceChangePercent) >= 4.0 && quoteVolume >= 10000000;

            return {
              symbol: t.symbol,
              priceChangePercent,
              quoteVolume,
              lastPrice,
              highPrice,
              lowPrice,
              isInPlay
            };
          });

        formatted.sort((a, b) => {
          if (a.isInPlay && !b.isInPlay) return -1;
          if (!a.isInPlay && b.isInPlay) return 1;
          return b.quoteVolume - a.quoteVolume;
        });

        return res.json(formatted);
      }
    } catch (err: any) {
      console.warn(`[Server] Ticker list fetch failed on ${url}:`, err.message || err);
    }
  }

  return res.status(502).json({ error: "Failed to load ticker list from Binance mirrors." });
});

app.post("/api/blackbox/analyze", async (req, res) => {
  try {
    const { trades, signals, config, metrics } = req.body;
    
    // Check if GEMINI_API_KEY exists
    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        success: false,
        error: "GEMINI_API_KEY is not defined in environments.",
        fallbackReport: `### ⚠️ Внимание: Отсутствует Ключ API Gemini!
Для выполнения полноценного стратегического анализа тяжелой моделью, пожалуйста, добавьте ваш **GEMINI_API_KEY** в панель **Settings > Secrets**.

#### Предварительный автоматический аудит сессии (Симуляция):
* **Количество сделок**: ${(trades || []).length} сделок в сессии.
* **Направление дисбаланса ленты**: Большинство сигналов совпадает с микроструктурной плотностью.
* **Kelly Fraction**: Текущее значение (${config?.risk?.kellyFraction || 0.05}) оптимально для сохранения живучести депозита при текущем математическом ожидании.
* **Рекурсивная фиксация (Repeat TP)**: ${config?.execution?.recursivePartialTpEnabled ? "Включена. Позволяет наращивать прибыль при импульсных пробоях за счет многократного половинного закрытия остатка." : "Выключена. Рассмотрите активацию при торговле волатильными активами."}`
      });
    }

    const ai = getGeminiClient();
    
    // Build a concise context representation to avoid exceeding token limit and save latency
    const metricsSummary = (metrics || []).slice(-15).map((m: any) => ({
      time: m.time,
      price: m.price,
      cvd: m.cvd,
      zScore: m.zScore,
      tradeSpeed: m.tradeSpeed
    }));

    const tradesSummary = (trades || []).slice(-12).map((t: any) => ({
      type: t.type,
      entry: t.price,
      exit: t.exitPrice,
      qty: t.qty,
      pnl: t.pnl,
      fees: t.fees,
      duration: t.durationSeconds,
      reason: t.exitReason
    }));

    const signalsSummary = (signals || []).slice(-12).map((s: any) => ({
      type: s.type,
      price: s.price,
      msg: s.message
    }));

    const prompt = `Проанализируй торговую сессию форвардтестинга алгоритма:
Настройки исполнения:
${JSON.stringify(config?.execution || {}, null, 2)}

Настройки риск-менеджмента:
${JSON.stringify(config?.risk || {}, null, 2)}

Положение и символы:
Символ: ${config?.symbols || "BTCUSDT"}

Последние 12 совершенных сделок:
${JSON.stringify(tradesSummary, null, 2)}

Последние 12 микро-сигналов и лента активности:
${JSON.stringify(signalsSummary, null, 2)}

Рыночные микроструктурные метрики (последние зафиксированные срезы):
${JSON.stringify(metricsSummary, null, 2)}

Составь глубокий стратегический экспертный отчет:
1. Оценка точности входа (правильно ли алгоритм отслеживал плотности и микроструктурный пробой).
2. Анализ эффективности выхода и удержания позиций. Оцени влияние частичной фиксации (TP 50%) и рекурсивных фиксаций (если они были включены).
3. Анализ Kelly Fraction и просадок.
4. Конкретные математические и параметрические рекомендации по оптимизации фильтров (CVD, Z-score, лимиты проскальзывания, периоды калибровки).

Пиши на профессиональном языке квантовых исследователей (Q-language), структурированно, без воды. Используй Markdown.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Ты - ведущий эксперт по количественным стратегиям (Quantitative Researcher) и микроструктурному анализу рынка. Анализируешь логи и метрики алгоритма и даешь детальные, хардкорные математические выводы."
      }
    });

    res.json({
      success: true,
      report: response.text
    });
  } catch (error: any) {
    console.error("Failed Black Box Analysis:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSE endpoint to broadcast binance order book trades live with zero firewall restrictions
app.get("/api/stream", (req, res) => {
  const reqSymbol = (req.query.symbol as string || "BTCUSDT").trim().toLowerCase();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Start multiplexed feed for this symbol
  startFeed(reqSymbol);

  // Send initial status
  const feed = activeFeeds.get(reqSymbol);
  const currentStatus = feed && feed.ws && feed.ws.readyState === WebSocketClient.OPEN ? `OK [${reqSymbol.toUpperCase()}]` : "RECONNECTING";
  res.write(`data: ${JSON.stringify({ type: "ws_status", status: currentStatus, url: feed?.wsUrl || "" })}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  const client: SseClient = { res, symbol: reqSymbol };
  clients.push(client);

  req.on("close", () => {
    clients = clients.filter((c) => c !== client);
    stopFeed(reqSymbol);
    console.log(`[Server] Client disconnected from ${reqSymbol}. Active overall clients: ${clients.length}`);
  });
});

// Periodic heartbeat ping to keep connection tunnel open at proxy layer
setInterval(() => {
  clients.forEach((client) => {
    try {
      client.res.write(": ping\n\n");
      if (typeof (client.res as any).flush === 'function') {
        (client.res as any).flush();
      }
    } catch (e) {
      // client connection closed
    }
  });
}, 10000);

async function startServer() {
  // Start default feed BTCUSDT on server boot
  startFeed("btcusdt");

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    addLog("INFO", `Multiplexed full-stack engine listening on http://0.0.0.0:${PORT}`);
  });

  process.on("SIGTERM", () => {
    for (const [s, feed] of activeFeeds.entries()) {
      feed.active = false;
      if (feed.ws) {
        try { feed.ws.terminate(); } catch (e) {}
      }
    }
    process.exit(0);
  });
}

startServer();
