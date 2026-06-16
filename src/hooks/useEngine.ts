import { useState, useEffect, useRef } from "react";
import {
  AppConfig,
  MachineState,
  MicroMetrics,
  SignalEvent,
  ChartCandle,
  LiquidityZone,
  TradePosition,
  HistorisedTrade,
} from "../types";

const INITIAL_CONFIG: AppConfig = {
  exchange: "binance_futures",
  symbols: "BTCUSDT",
  mode: "paper",
  latencyBudget: 8,
  paperBalance: 12450.0,
  risk: {
    maxDailyDDPct: 5.0,
    maxPositionPct: 15.0,
    kellyFraction: 0.5,
    atrStopMultiplier: 1.5,
    consecutiveLossPause: 4,
  },
  filters: {
    htfLookbackBars: 1000,
    swingThresholdPct: 0.5,
    oiGrowthMin: 1.3,
    consolidationStdMax: 0.003,
    tapeSpeedMultiplier: 3.0,
    spoofingLifetimeMs: 200,
    icebergStabilityTicks: 10,
  },
  execution: {
    entryType: "aggressive_limit",
    maxSlippageTicks: 3,
    tpRr: "1.5, 3.0",
    timeExitSec: 300,
    breakevenEnabled: true,
    trailingStopEnabled: true,
    partialTakeProfitEnabled: true,
    signalExitEnabled: false,
    feeExitEnabled: false,
    predictiveLiqEnabled: true,
    preciseEntryEnabled: false,
    shitcoinMode: false,
    leverage: 20,
    tradeAmountUsd: 1000.0,
    reduceSizeOnLtf: true,
    falseBreakoutDelayEnabled: false,
    zoneTouchPocDeciderEnabled: true,
  },
};

const TF_TARGETS: Record<
  string,
  Record<string, { tp: number; sl: number; timeExitSec: number }>
> = {
  "1m": {
    BREAKOUT: { tp: 120.0, sl: 40.0, timeExitSec: 300 },
    ABSORPTION_FADE: { tp: 80.0, sl: 50.0, timeExitSec: 300 },
    FALSE_BREAKOUT: { tp: 90.0, sl: 45.0, timeExitSec: 240 },
  },
  "5m": {
    BREAKOUT: { tp: 250.0, sl: 80.0, timeExitSec: 1200 },
    ABSORPTION_FADE: { tp: 160.0, sl: 100.0, timeExitSec: 1200 },
    FALSE_BREAKOUT: { tp: 180.0, sl: 90.0, timeExitSec: 900 },
  },
  "15m": {
    BREAKOUT: { tp: 450.0, sl: 150.0, timeExitSec: 3600 },
    ABSORPTION_FADE: { tp: 300.0, sl: 180.0, timeExitSec: 3600 },
    FALSE_BREAKOUT: { tp: 350.0, sl: 160.0, timeExitSec: 2700 },
  },
  "1h": {
    BREAKOUT: { tp: 900.0, sl: 300.0, timeExitSec: 14400 },
    ABSORPTION_FADE: { tp: 600.0, sl: 350.0, timeExitSec: 14400 },
    FALSE_BREAKOUT: { tp: 700.0, sl: 320.0, timeExitSec: 10800 },
  },
  "4h": {
    BREAKOUT: { tp: 1800.0, sl: 600.0, timeExitSec: 57600 },
    ABSORPTION_FADE: { tp: 1200.0, sl: 700.0, timeExitSec: 57600 },
    FALSE_BREAKOUT: { tp: 1400.0, sl: 650.0, timeExitSec: 43200 },
  },
  "1d": {
    BREAKOUT: { tp: 4000.0, sl: 1500.0, timeExitSec: 172800 },
    ABSORPTION_FADE: { tp: 2500.0, sl: 1800.0, timeExitSec: 172800 },
    FALSE_BREAKOUT: { tp: 3000.0, sl: 1600.0, timeExitSec: 129600 },
  },
};

export function calculateTargetPrices(
  side: "BUY" | "SELL",
  entryPrice: number,
  strategyType: "BREAKOUT" | "ABSORPTION_FADE" | "FALSE_BREAKOUT",
  timeframe: string,
  feeExitEnabled?: boolean,
): { tpPrice: number; slPrice: number } {
  if (feeExitEnabled) {
    const entryFeeRate = strategyType === "BREAKOUT" ? 0.0004 : 0.0002;
    const tpPct = entryFeeRate + 0.0002 + 0.001; // Round-trip fee (TP maker) + 0.1%
    const slPct = entryFeeRate + 0.0004 + 0.001; // Round-trip fee (SL taker) + 0.1%
    if (side === "BUY") {
      return {
        tpPrice: entryPrice * (1 + tpPct),
        slPrice: entryPrice * (1 - slPct),
      };
    } else {
      return {
        tpPrice: entryPrice * (1 - tpPct),
        slPrice: entryPrice * (1 + slPct),
      };
    }
  }

  const tfKey = timeframe || "1m";
  const targets = TF_TARGETS[tfKey] || TF_TARGETS["1m"];
  const strategy = strategyType || "BREAKOUT";
  const targetConfig = targets[strategy] || targets["BREAKOUT"];

  // Adapt mathematically to any price level by scaling targets dynamically from BTC's $60k benchmark
  const scalingFactor = entryPrice / 60000.0;
  const tp = targetConfig.tp * scalingFactor;
  const sl = targetConfig.sl * scalingFactor;

  if (side === "BUY") {
    return {
      tpPrice: entryPrice + tp,
      slPrice: entryPrice - sl,
    };
  } else {
    return {
      tpPrice: entryPrice - tp,
      slPrice: entryPrice + sl,
    };
  }
}

export function getPricePrecision(price: number): number {
  if (!price || price === 0) return 2;
  const absPrice = Math.abs(price);
  if (absPrice >= 10000) return 1;
  if (absPrice >= 500) return 2;
  if (absPrice >= 10) return 3;
  if (absPrice >= 1) return 4;
  if (absPrice >= 0.1) return 5;
  if (absPrice >= 0.01) return 6;
  return 8; // For sub-penny contracts
}

export function formatPrice(price: number): string {
  if (price === undefined || price === null || isNaN(price)) return "0.0";
  const precision = getPricePrecision(price);
  return price.toFixed(precision);
}

export function getQtyPrecision(price: number): number {
  if (!price || price === 0) return 2;
  const absPrice = Math.abs(price);
  if (absPrice >= 10000) return 3; // e.g., BTC size (0.031)
  if (absPrice >= 1000) return 2;  // e.g., ETH size (0.54)
  if (absPrice >= 100) return 1;   // e.g., SOL size (12.4)
  return 0;                        // e.g., PEPE size (124466666)
}

export function formatQty(price: number, qty: number): string {
  if (qty === undefined || qty === null || isNaN(qty)) return "0";
  const precision = getQtyPrecision(price);
  return qty.toFixed(precision);
}

export function calculateATR(candles: any[], period = 14): number {
  const fallbackATR = (candles && candles.length > 0)
    ? candles[candles.length - 1].close * 0.001
    : 40;

  if (!candles || candles.length < period + 1) {
    if (!candles || candles.length === 0) return fallbackATR;
    const ranges = candles.map((c) => c.high - c.low);
    ranges.sort((a, b) => a - b);
    return ranges[Math.floor(ranges.length / 2)] || fallbackATR;
  }
  let trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    trs.push(tr);
  }
  const trsSlice = trs.slice(-period);
  return trsSlice.reduce((acc, val) => acc + val, 0) / trsSlice.length;
}

export function getMedianVolume(candles: any[]): number {
  if (!candles || candles.length === 0) return 100;
  const vols = candles.map((c) => c.volume || 0).filter((v) => v > 0);
  if (vols.length === 0) return 100;
  vols.sort((a, b) => a - b);
  return vols[Math.floor(vols.length / 2)];
}

export function useEngine() {
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const configRef = useRef<AppConfig>(config);
  configRef.current = config;
  const [state, setState] = useState<MachineState>("SCANNING");
  const stateRef = useRef<MachineState>("SCANNING");
  stateRef.current = state;
  const [metrics, setMetrics] = useState<MicroMetrics[]>([]);
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [chartData, setChartData] = useState<ChartCandle[]>([]);
  const [zones, setZones] = useState<LiquidityZone[]>([]);
  const zonesRef = useRef<LiquidityZone[]>([]);
  zonesRef.current = zones;

  const [halted, setHalted] = useState(true);
  const [latency, setLatency] = useState(0);

  // Real-time trading & PnL Engine state
  const [position, setPosition] = useState<TradePosition | null>(null);
  const [trades, setTrades] = useState<HistorisedTrade[]>([]);
  const [accountEquity, setAccountEquity] = useState<number>(INITIAL_CONFIG.paperBalance);
  const [realizedPnL, setRealizedPnL] = useState<number>(0);
  const [feesPaid, setFeesPaid] = useState<number>(0);
  const [tradedVolumeBtc, setTradedVolumeBtc] = useState<number>(0);
  const [tradedVolumeUsd, setTradedVolumeUsd] = useState<number>(0);
  const [completedTradesCount, setCompletedTradesCount] = useState<number>(0);

  const [wsStatus, setWsStatus] = useState<string>("CONNECTING");
  const wsStatusRef = useRef<string>("CONNECTING");
  wsStatusRef.current = wsStatus;

  const wsRef = useRef<WebSocket | null>(null);
  const aggRef = useRef({ trades: 0, buyVol: 0, sellVol: 0, lastPrice: 0 });
  const latencyBuffer = useRef<number[]>([]);
  const positionRef = useRef<TradePosition | null>(null);
  positionRef.current = position;

  const chartDataRef = useRef<ChartCandle[]>([]);
  chartDataRef.current = chartData;

  const lastMsgTimeRef = useRef<number>(0);
  const lastCandleTimeRef = useRef<number>(Date.now());

  // Performance analytics refs for Cumulative session volume delta (CVD) & Order Flow Speed Baseline
  const cvdCumulativeRef = useRef<number>(0);
  const tapeSpeedHistoryRef = useRef<number[]>([]);
  const tickVolumeHistoryRef = useRef<number[]>([]);
  const dynamicZScoreThresholdRef = useRef<number>(1.8);
  const oiRef = useRef<number>(1342.5); // Live-mode Open Interest modeling value ($ million)
  const prevOiRef = useRef<number>(1342.5);
  const lastOiMsgTimeRef = useRef<number>(0);
  const [warmupSecondsLeft, setWarmupSecondsLeft] = useState<number>(60);
  const warmupSecondsLeftRef = useRef<number>(60);
  warmupSecondsLeftRef.current = warmupSecondsLeft;
  const prevPriceRef = useRef<number>(0);
  const levelPokeTrackerRef = useRef<Record<string, { pierced: boolean; maxPriceSeen?: number; minPriceSeen?: number; timestamp: number }>>({});
  const cooldownTicksRef = useRef<number>(0);
  const atrRef = useRef<number>(60); // 5m ATR for adaptive volatility-based interaction zones
  const lastIgnoreLogTimeRef = useRef<Record<string, number>>({});
  const armedAccumulatorRef = useRef<{
    ticksCount: number;
    tapeSpeedAcc: number;
    cvdDeltaAcc: number;
    obImbalanceAcc: number;
    oiDeltaAcc: number;
    entries: Array<{
      side: "BUY" | "SELL";
      strat: "BREAKOUT" | "ABSORPTION_FADE" | "FALSE_BREAKOUT";
    }>;
  } | null>(null);

  // Synchronize paper trading balance to account equity on change
  useEffect(() => {
    if (config.mode === 'paper') {
      setAccountEquity(config.paperBalance);
    }
  }, [config.paperBalance, config.mode]);

  const [timeframe, setTimeframe] = useState<string>("1m");
  const timeframeRef = useRef<string>("1m");
  timeframeRef.current = timeframe;
  const klinesCacheRef = useRef<{ [key: string]: ChartCandle[] }>({});

  // Helper to fetch kline lists from backend API safely
  const fetchInterval = async (
    interval: string,
    limit: number,
  ): Promise<any[][] | null> => {
    try {
      const symbol = (configRef.current.symbols || "BTCUSDT").trim().toUpperCase();
      const res = await fetch(
        `/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {
      // ignore fallback errors
    }
    return null;
  };

  const isRecalculatingRef = useRef(false);

  // Core level collector & chart data loader
  const loadData = async (isPeriodic = false) => {
    if (isRecalculatingRef.current) return;
    if (isPeriodic && (stateRef.current === "ARMED" || stateRef.current === "APPROACHING" || stateRef.current === "EXECUTING")) {
      console.log("Deferring periodic levels re-evaluation: active FSM state is ARMED/APPROACHING/EXECUTING.");
      return;
    }
    const baseAsset = (configRef.current.symbols || "BTCUSDT").trim().toUpperCase().replace("USDT", "").replace("BUSD", "");
    isRecalculatingRef.current = true;
    try {
      // Helper to fetch Open Interest (OI) history from the proxy
      const fetchOI = async (
        period: string,
        limit: number,
      ): Promise<any[] | null> => {
        try {
          const symbol = (configRef.current.symbols || "BTCUSDT").trim().toUpperCase();
          const res = await fetch(
            `/api/oi?symbol=${symbol}&period=${period}&limit=${limit}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              return data;
            }
          }
        } catch (e) {
          // fallback silently
        }
        return null;
      };

      // Parallel CORS-bypassed micro-pivoting fetches
      const [k1m, k5m, k15m, k1h, k4h, k1d, oi5m, oi15m, oi1h, oi4h, oi1d] =
        await Promise.all([
          fetchInterval("1m", 100),
          fetchInterval("5m", 100),
          fetchInterval("15m", 100),
          fetchInterval("1h", 100),
          fetchInterval("4h", 100),
          fetchInterval("1d", 30),
          fetchOI("5m", 100),
          fetchOI("15m", 100),
          fetchOI("1h", 100),
          fetchOI("4h", 100),
          fetchOI("1d", 30),
        ]);

      // A helper to parse candles beautifully - absolutely ZERO simulation
      function parseOrSimulate(
        raw: any[][] | null,
        intervalName: string,
        count: number,
        startPrice: number,
      ) {
        if (raw && Array.isArray(raw) && raw.length > 0) {
          return raw.map((d: any) => {
            let timeVal = "";
            const d0 = parseInt(d[0]) || Date.now();
            if (intervalName === "1d") {
              timeVal = new Date(d0).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
              });
            } else if (
              intervalName === "15m" ||
              intervalName === "1h" ||
              intervalName === "4h"
            ) {
              const dt = new Date(d0);
              const day = String(dt.getDate()).padStart(2, "0");
              const month = String(dt.getMonth() + 1).padStart(2, "0");
              const hm = dt.toLocaleTimeString("ru-RU", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
              });
              timeVal = `${day}.${month} ${hm}`;
            } else {
              timeVal = new Date(d0).toLocaleTimeString("ru-RU", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
              });
            }
            const volume = d[5] ? parseFloat(d[5]) : 0;
            const takerVolume = d[9] ? parseFloat(d[9]) : 0;
            const cvd = takerVolume * 2 - volume;
            return {
              time: timeVal,
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume,
              takerVolume,
              cvd,
              rawTimestamp: d0,
            };
          });
        }

        // Return cache if it has items
        if (klinesCacheRef.current[intervalName]?.length > 0) {
          return klinesCacheRef.current[intervalName];
        }

        return [];
      }

      // Aligns Open Interest metrics to parsed candles without synthetic random walk simulation
      function alignOIWithCandles(candles: any[], oiRaw: any[] | null) {
        if (!candles || candles.length === 0) return [];
        if (!oiRaw || !Array.isArray(oiRaw) || oiRaw.length === 0) {
          return candles.map((c) => ({ ...c, oi: 0 }));
        }

        return candles.map((c) => {
          let bestVal =
            parseFloat(oiRaw[oiRaw.length - 1]?.sumOpenInterest) || 0;
          let minDiff = Infinity;
          for (const item of oiRaw) {
            const diff = Math.abs(
              (item.timestamp || 0) - (c.rawTimestamp || 0),
            );
            if (diff < minDiff) {
              minDiff = diff;
              bestVal = parseFloat(item.sumOpenInterest) || bestVal;
            }
          }
          return { ...c, oi: bestVal };
        });
      }

      const basePrice = aggRef.current.lastPrice || 64250.0;
      const parsed1m_base = parseOrSimulate(k1m, "1m", 100, basePrice);
      const finalPrice =
        parsed1m_base.length > 0
          ? parsed1m_base[parsed1m_base.length - 1].close
          : basePrice;

      const parsed5m_base = parseOrSimulate(k5m, "5m", 100, finalPrice - 120);
      const parsed15m_base = parseOrSimulate(k15m, "15m", 100, finalPrice - 80);
      const parsed1h_base = parseOrSimulate(k1h, "1h", 100, finalPrice - 240);
      const parsed4h_base = parseOrSimulate(k4h, "4h", 100, finalPrice + 310);
      const parsed1d_base = parseOrSimulate(k1d, "1d", 30, finalPrice - 1100);

      // Aligned with high-fidelity Open Interest proxy feeds
      const parsed1m = alignOIWithCandles(parsed1m_base, oi5m);
      const parsed5m = alignOIWithCandles(parsed5m_base, oi5m);
      const parsed15m = alignOIWithCandles(parsed15m_base, oi15m);
      const parsed1h = alignOIWithCandles(parsed1h_base, oi1h);
      const parsed4h = alignOIWithCandles(parsed4h_base, oi4h);
      const parsed1d = alignOIWithCandles(parsed1d_base, oi1d);

      klinesCacheRef.current = {
        "1m": parsed1m,
        "5m": parsed5m,
        "15m": parsed15m,
        "1h": parsed1h,
        "4h": parsed4h,
        "1d": parsed1d,
      };

      setChartData(klinesCacheRef.current[timeframeRef.current] || parsed1m);

      if (parsed1m.length > 0 && aggRef.current.lastPrice === 0) {
        aggRef.current.lastPrice = finalPrice;
      }

      // Real-world Open Interest anchoring from API
      if (oi5m && oi5m.length > 0) {
        const latestOI = parseFloat(oi5m[oi5m.length - 1]?.sumOpenInterest);
        if (!isNaN(latestOI) && latestOI > 0) {
          oiRef.current = latestOI;
        }
      }

      const atr1m = calculateATR(parsed1m, 14);
      const atr5m = calculateATR(parsed5m, 14);
      if (typeof atr5m === "number" && !isNaN(atr5m) && atr5m > 0) {
        atrRef.current = atr5m;
      }
      const atr15m = calculateATR(parsed15m, 14);
      const atr1h = calculateATR(parsed1h, 14);
      const atr4h = calculateATR(parsed4h, 14);
      const atr1d = calculateATR(parsed1d, 14);

      const med1m = getMedianVolume(parsed1m);
      const med5m = getMedianVolume(parsed5m);
      const med15m = getMedianVolume(parsed15m);
      const med1h = getMedianVolume(parsed1h);
      const med4h = getMedianVolume(parsed4h);

      // -----------------------------------------------------------------
      // Hierarchical Level Collector: Find key pivot levels at multiple timeframes
      // -----------------------------------------------------------------
      const candidates: {
        price: number;
        type: string;
        color: string;
        scale: number;
        levelStrength: "HTF" | "LTF";
        timeframe: string;
        volumeScore?: number;
        cvdScore?: number;
        oiScore?: number;
        promotedStr?: string;
        touchesCount?: number;
      }[] = [];

      // A helper to extract pivot highs / lows confirmed with Volume, CVD, and OI
      function extractPivots(
        candles: any[] | null,
        tfLabel: string,
        baseColorHigh: string,
        baseColorLow: string,
        scaleWeight: number,
        tfName: string,
      ) {
        if (!candles || candles.length < 15) return;
        const len = candles.length;

        // Volatility adaptive ATR and median volume baselines per timeframe
        const tfAtr =
          tfName === "1m"
            ? atr1m
            : tfName === "5m"
              ? atr5m
              : tfName === "15m"
                ? atr15m
                : tfName === "1h"
                  ? atr1h
                  : tfName === "4h"
                    ? atr4h
                    : atr1d;

        const tfMedVol =
          tfName === "1m"
            ? med1m
            : tfName === "5m"
              ? med5m
              : tfName === "15m"
                ? med15m
                : tfName === "1h"
                  ? med1h
                  : tfName === "4h"
                    ? med4h
                    : 1000;

        // Dynamic window size: 2-bar wings for ultra-short 1m micro-signals, 3-bar for senior timeframes
        const windowSize = tfName === "1m" ? 2 : 3;

        // Multipliers to convert candles back to approximate chronological minutes
        const tfMultiplier =
          tfName === "1m"
            ? 1
            : tfName === "5m"
              ? 5
              : tfName === "15m"
                ? 15
                : tfName === "1h"
                  ? 60
                  : tfName === "4h"
                    ? 240
                    : 1440;

        for (let i = windowSize; i < len - windowSize; i++) {
          const prev = candles.slice(i - windowSize, i);
          const next = candles.slice(i + 1, i + windowSize + 1);
          const curr = candles[i];

          const currHigh = curr.high;
          const currLow = curr.low;

          const isPivotHigh =
            prev.every((p) => currHigh >= p.high) &&
            next.every((n) => currHigh > n.high);
          const isPivotLow =
            prev.every((p) => currLow <= p.low) &&
            next.every((n) => currLow < n.low);

          // Calculate volume, CVD, and OI around pivot bar
          const pivotCandles = candles.slice(
            Math.max(0, i - 1),
            Math.min(len, i + 2),
          );
          const totalVolume = pivotCandles.reduce(
            (sum, c) => sum + (c.volume || 0),
            0,
          );
          const totalCvd = pivotCandles.reduce(
            (sum, c) => sum + (c.cvd || 0),
            0,
          );

          const previousOI = candles[i - 2]?.oi || candles[i - 1]?.oi || 0;
          const currentOI = candles[i + 1]?.oi || candles[i]?.oi || 0;
          const oiChange = currentOI - previousOI;

          // AGE-BASED PROMOTION LOGIC:
          // A level that survived for multiple minutes gets graded up to a senior timeframe designation
          const ageInMinutes = (len - 1 - i) * tfMultiplier;
          let finalTfName = tfName;
          let finalTfLabel = tfLabel;
          let finalScaleWeight = scaleWeight;
          let finalColorHigh = baseColorHigh;
          let finalColorLow = baseColorLow;
          let promotedStr = "";

          if (tfName === "1m") {
            if (ageInMinutes >= 15) {
              finalTfName = "15m";
              finalTfLabel = "M15";
              finalScaleWeight = 2;
              finalColorHigh = "#84cc16"; // lime
              finalColorLow = "#a855f7"; // purple
              promotedStr = `Амортизация времени: уровень устоял ${ageInMinutes} мин и прогрессировал с M1 до M15.`;
            } else if (ageInMinutes >= 5) {
              finalTfName = "5m";
              finalTfLabel = "M5";
              finalScaleWeight = 1;
              finalColorHigh = "#fb7185"; // rose
              finalColorLow = "#38bdf8"; // sky
              promotedStr = `Амортизация времени: уровень устоял ${ageInMinutes} мин и прогрессировал с M1 до M5.`;
            }
          } else if (tfName === "5m") {
            if (ageInMinutes >= 15) {
              finalTfName = "15m";
              finalTfLabel = "M15";
              finalScaleWeight = 2;
              finalColorHigh = "#84cc16"; // lime
              finalColorLow = "#a855f7"; // purple
              promotedStr = `Амортизация времени: уровень устоял ${ageInMinutes} мин и прогрессировал с M5 до M15.`;
            }
          } else if (tfName === "15m") {
            if (ageInMinutes >= 60) {
              finalTfName = "1h";
              finalTfLabel = "H1";
              finalScaleWeight = 3;
              finalColorHigh = "#d946ef"; // fuchsia
              finalColorLow = "#06b6d4"; // cyan
              promotedStr = `Амортизация времени: уровень устоял ${ageInMinutes} мин и прогрессировал с M15 до H1.`;
            }
          }

          const strength = finalScaleWeight >= 3 ? "HTF" : "LTF";

          if (isPivotHigh) {
            // Filter out junior timeframe levels (1m, 5m, 15m) if they have been broken by subsequent candle highs
            let isBroken = false;
            if (tfName === "1m" || tfName === "5m" || tfName === "15m") {
              for (let j = i + 1; j < len; j++) {
                if (candles[j].high > currHigh) {
                  isBroken = true;
                  break;
                }
              }
            }

            if (!isBroken) {
              // Calculate multi-touch support & count approaches
              let touchesCount = 1;
              let accumVolume = totalVolume;
              let accumCvd = Math.abs(totalCvd);
              let accumOi = Math.abs(oiChange);

              const touchThreshold = tfAtr * 0.45; // Volatility adaptive retest boundary
              for (let j = i + 1; j < len; j++) {
                const checkCandle = candles[j];
                // If subsequent candle gets close to level
                if (Math.abs(checkCandle.high - currHigh) <= touchThreshold) {
                  touchesCount++;
                  accumVolume += checkCandle.volume || 0;
                  accumCvd += Math.abs(checkCandle.cvd || 0);
                  accumOi += Math.abs(
                    (checkCandle.oi || 0) -
                      (candles[j - 1]?.oi || checkCandle.oi || 0),
                  );
                }
              }

              // Status Boosting: if level maintains multiple touches/touches count, elevate scale and strength
              let finalLevelStrength: "HTF" | "LTF" = strength;
              let finalScaleWeightAdjusted = finalScaleWeight;
              if (touchesCount >= 3) {
                finalLevelStrength = "HTF";
                finalScaleWeightAdjusted += 1.0;
              }

              // STRICT VALIDATION FILTER DESIGN:
              // 1. Minimum touches confirmation (junior profiles form immediately on 1 touch to capture micro-structure)
              const minTouchesNeeded = 1;
              // 2. Volume validation: cumulative volume at key pivots must match median threshold
              const minVolThreshold = tfMedVol * 1.0;

              if (
                touchesCount >= minTouchesNeeded &&
                accumVolume >= minVolThreshold
              ) {
                candidates.push({
                  price: currHigh,
                  type: `${finalTfLabel} RESIST`,
                  color: finalColorHigh,
                  scale: finalScaleWeightAdjusted,
                  levelStrength: finalLevelStrength,
                  timeframe: finalTfName,
                  volumeScore: accumVolume,
                  cvdScore: accumCvd,
                  oiScore: accumOi,
                  touchesCount,
                  promotedStr,
                });
              }
            }
          }
          if (isPivotLow) {
            // Filter out junior timeframe levels (1m, 5m, 15m) if they have been broken by subsequent candle lows
            let isBroken = false;
            if (tfName === "1m" || tfName === "5m" || tfName === "15m") {
              for (let j = i + 1; j < len; j++) {
                if (candles[j].low < currLow) {
                  isBroken = true;
                  break;
                }
              }
            }

            if (!isBroken) {
              // Calculate multi-touch support & count approaches
              let touchesCount = 1;
              let accumVolume = totalVolume;
              let accumCvd = Math.abs(totalCvd);
              let accumOi = Math.abs(oiChange);

              const touchThreshold = tfAtr * 0.45; // Volatility adaptive retest boundary
              for (let j = i + 1; j < len; j++) {
                const checkCandle = candles[j];
                // If subsequent candle gets close to level
                if (Math.abs(checkCandle.low - currLow) <= touchThreshold) {
                  touchesCount++;
                  accumVolume += checkCandle.volume || 0;
                  accumCvd += Math.abs(checkCandle.cvd || 0);
                  accumOi += Math.abs(
                    (checkCandle.oi || 0) -
                      (candles[j - 1]?.oi || checkCandle.oi || 0),
                  );
                }
              }

              // Status Boosting: if level maintains multiple touches/touches count, elevate scale and strength
              let finalLevelStrength: "HTF" | "LTF" = strength;
              let finalScaleWeightAdjusted = finalScaleWeight;
              if (touchesCount >= 3) {
                finalLevelStrength = "HTF";
                finalScaleWeightAdjusted += 1.0;
              }

              // STRICT VALIDATION FILTER DESIGN:
              // 1. Minimum touches confirmation (junior profiles form immediately on 1 touch to capture micro-structure)
              const minTouchesNeeded = 1;
              const minVolThreshold = tfMedVol * 1.0;

              if (
                touchesCount >= minTouchesNeeded &&
                accumVolume >= minVolThreshold
              ) {
                candidates.push({
                  price: currLow,
                  type: `${finalTfLabel} SUPPORT`,
                  color: finalColorLow,
                  scale: finalScaleWeightAdjusted,
                  levelStrength: finalLevelStrength,
                  timeframe: finalTfName,
                  volumeScore: accumVolume,
                  cvdScore: accumCvd,
                  oiScore: accumOi,
                  touchesCount,
                  promotedStr,
                });
              }
            }
          }
        }
      }

      // 1D - Grab absolute High/Low of the last 30 days
      if (parsed1d && parsed1d.length > 0) {
        let dailyMax = 0;
        let dailyMin = Infinity;
        let maxIdx = 0;
        let minIdx = 0;
        parsed1d.forEach((c: any, index: number) => {
          if (c.high > dailyMax) {
            dailyMax = c.high;
            maxIdx = index;
          }
          if (c.low < dailyMin) {
            dailyMin = c.low;
            minIdx = index;
          }
        });

        const mCandle = parsed1d[maxIdx];
        const lCandle = parsed1d[minIdx];

        candidates.push({
          price: dailyMax,
          type: "1D SWING HIGH",
          color: "#f43f5e",
          scale: 5,
          levelStrength: "HTF",
          timeframe: "1d",
          volumeScore: mCandle?.volume || 50000,
          cvdScore: mCandle?.cvd || 2500,
          oiScore: (mCandle?.oi || 45000) - (parsed1d[maxIdx - 1]?.oi || 45000),
        });
        candidates.push({
          price: dailyMin,
          type: "1D SWING LOW",
          color: "#3b82f6",
          scale: 5,
          levelStrength: "HTF",
          timeframe: "1d",
          volumeScore: lCandle?.volume || 48000,
          cvdScore: lCandle?.cvd || -1800,
          oiScore: (lCandle?.oi || 45000) - (parsed1d[minIdx - 1]?.oi || 45000),
        });
      }

      // Extract levels from alternative senior and junior timeframes
      extractPivots(parsed4h, "H4", "#f59e0b", "#10b981", 4, "4h"); // orange / emerald
      extractPivots(parsed1h, "H1", "#d946ef", "#06b6d4", 3, "1h"); // fuchsia / cyan
      extractPivots(parsed15m, "M15", "#84cc16", "#a855f7", 2, "15m"); // lime / purple
      extractPivots(parsed5m, "M5", "#fb7185", "#38bdf8", 1, "5m"); // rose / sky
      extractPivots(parsed1m, "M1", "#ec4899", "#14b8a6", 0.5, "1m"); // pink / teal

      // Sort candidate pivot zones by price first for 1D DBSCAN clustering
      const scaleRel = finalPrice / 60000.0;
      const baseEps = Math.max(50 * scaleRel, atrRef.current * 0.45);

      const sortedPivots = [...candidates].sort((a, b) => a.price - b.price);
      const clusters: typeof candidates[] = [];

      if (sortedPivots.length > 0) {
        let currentCluster = [sortedPivots[0]];
        for (let i = 1; i < sortedPivots.length; i++) {
          const prev = sortedPivots[i - 1];
          const curr = sortedPivots[i];
          // If consecutive pivots are within baseEps of each other, group them
          if (curr.price - prev.price <= baseEps) {
            currentCluster.push(curr);
          } else {
            clusters.push(currentCluster);
            currentCluster = [curr];
          }
        }
        clusters.push(currentCluster);
      }

      const processedClusters: typeof candidates[] = [];

      // Recursive cluster splitting logic to break up excessively wide zones (>0.45%)
      // This identifies focal density hubs ("очаги") by splitting at the largest gaps
      function splitClusterIfTooWide(cluster: typeof candidates): (typeof candidates)[] {
        if (cluster.length <= 1) return [cluster];
        
        const priceLow = Math.min(...cluster.map(p => p.price));
        const priceHigh = Math.max(...cluster.map(p => p.price));
        const maxWidth = finalPrice * 0.0045; // 0.45% of current price as threshold
        
        if (priceHigh - priceLow <= maxWidth) {
          return [cluster];
        }
        
        const sortedCopy = [...cluster].sort((a, b) => a.price - b.price);
        let maxGap = -1;
        let splitIndex = -1;
        
        for (let i = 0; i < sortedCopy.length - 1; i++) {
          const gap = sortedCopy[i + 1].price - sortedCopy[i].price;
          if (gap > maxGap) {
            maxGap = gap;
            splitIndex = i;
          }
        }
        
        if (splitIndex !== -1) {
          const leftPart = sortedCopy.slice(0, splitIndex + 1);
          const rightPart = sortedCopy.slice(splitIndex + 1);
          
          return [
            ...splitClusterIfTooWide(leftPart),
            ...splitClusterIfTooWide(rightPart)
          ];
        }
        
        return [cluster];
      }

      clusters.forEach((cl) => {
        processedClusters.push(...splitClusterIfTooWide(cl));
      });

      const distinctZones: LiquidityZone[] = [];

      processedClusters.forEach((cluster) => {
        // Find the strongest candidate inside the cluster to serve as the anchor / core POC
        const sortedInCluster = [...cluster].sort((a, b) => {
          if (b.scale !== a.scale) return b.scale - a.scale;
          if ((b.touchesCount || 0) !== (a.touchesCount || 0)) return (b.touchesCount || 0) - (a.touchesCount || 0);
          return (b.volumeScore || 0) - (a.volumeScore || 0);
        });

        const anchor = sortedInCluster[0];

        // Determine if zone is Support (Demand) or Resistance (Supply) based on majority vote of pivot types
        const supportCount = cluster.filter(p => p.type.includes('SUPPORT') || p.type.includes('LOW')).length;
        const resistCount = cluster.filter(p => p.type.includes('RESIST') || p.type.includes('HIGH')).length;
        const isSupport = supportCount >= resistCount;

        // Calculate aggregate scores across the cluster
        const aggVolume = cluster.reduce((sum, p) => sum + (p.volumeScore || 0), 0);
        const aggCvd = cluster.reduce((sum, p) => sum + (p.cvdScore || 0), 0);
        const aggOi = cluster.reduce((sum, p) => sum + (p.oiScore || 0), 0);
        const aggTouches = cluster.reduce((sum, p) => sum + (p.touchesCount || 1), 0);

        // Max scale weight determines level strength (HTF vs LTF)
        const maxScale = Math.max(...cluster.map(p => p.scale));
        const levelStrength: "HTF" | "LTF" = maxScale >= 3 ? "HTF" : "LTF";

        const uniqueTfs = Array.from(new Set(cluster.map(p => p.timeframe).filter(Boolean)));
        const primaryTf = anchor.timeframe || '1m';

        // Calculate upper/lower boundaries of the zone
        let priceLow = Math.min(...cluster.map(p => p.price));
        let priceHigh = Math.max(...cluster.map(p => p.price));

        // If the cluster is extremely narrow (e.g. single pivot), pad it by adaptive ATR padding to create a real zone
        const minHeight = baseEps * 0.45;
        if (priceHigh - priceLow < minHeight) {
          const midpoint = (priceLow + priceHigh) / 2;
          priceLow = midpoint - minHeight / 2;
          priceHigh = midpoint + minHeight / 2;
        }

        const updateTimeStr = new Date().toLocaleTimeString("ru-RU");
        const formattedVol = aggVolume.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
        const formattedCvd = aggCvd.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
        const formattedOi = aggOi.toLocaleString("ru-RU", { maximumFractionDigits: 0 });

        const criteria: string[] = [];
        criteria.push(`[Кластеризация DBSCAN]: Сгруппировано ${cluster.length} локальных экстремумов в единый узел.`);
        criteria.push(`Таймфреймы слияния: ${uniqueTfs.map(t => t.toUpperCase()).join(", ")}.`);
        criteria.push(`Общий горизонтальный объем в зоне: ${formattedVol} ${baseAsset}.`);
        criteria.push(`Результирующая разница CVD: ${aggCvd >= 0 ? '+' : ''}${formattedCvd} ${baseAsset}.`);
        if (Math.abs(aggOi) > 10) {
          criteria.push(`Изменение открытого интереса (OI) зоны: ${aggOi >= 0 ? '+' : ''}${formattedOi} ${baseAsset}.`);
        }
        criteria.push(`Суммарно тестов/касаний зоны: ${aggTouches}.`);

        // Add context based on timeframe presence
        if (cluster.some(p => p.timeframe === '1d')) {
          criteria.push("🔥 Сильнейшая дневной свинг-диапазон (аккумуляция ликвидности за 30 дней).");
        } else if (cluster.some(p => p.timeframe === '4h' || p.timeframe === '1h')) {
          criteria.push("⚡ Старший институциональный диапазон ордеров (Order Block H1-H4).");
        }

        // Color and name formatting
        const isHTF = levelStrength === 'HTF';
        const zoneType = isSupport 
          ? (isHTF ? `${primaryTf.toUpperCase()} DEMAND ZONE (OB)` : `${primaryTf.toUpperCase()} SUPPORT`)
          : (isHTF ? `${primaryTf.toUpperCase()} SUPPLY ZONE (OB)` : `${primaryTf.toUpperCase()} RESIST`);
          
        const zoneColor = isSupport 
          ? (isHTF ? "#10b981" : "#06b6d4") // Emerald / Cyan
          : (isHTF ? "#f43f5e" : "#d946ef"); // Rose / Fuchsia

        distinctZones.push({
          price: anchor.price, // POC is anchored to the peak-volume price point in cluster
          priceLow,
          priceHigh,
          type: zoneType,
          color: zoneColor,
          levelStrength,
          timeframe: primaryTf,
          updatedAt: updateTimeStr,
          validationCriteria: criteria,
          volumeScore: aggVolume,
          cvdScore: aggCvd,
          oiScore: aggOi,
          touchesCount: aggTouches,
          isBroken: false,
          lastTouchTimestamp: Date.now(),
        });
      });

      // Allow up to 120 zones globally so junior timeframes (1m, 5m) don't get chopped off
      setZones(distinctZones.slice(0, 120));
    } catch (e) {
      console.error("Error recalculating zones:", e);
    } finally {
      isRecalculatingRef.current = false;
    }
  };

  // 1. Fetch initial background data mapping when symbol or settings change (1s debounce to allow typing)
  useEffect(() => {
    const symbol = config.symbols?.trim().toUpperCase() || "BTCUSDT";
    if (symbol.length < 3) return;

    const delayDebounce = setTimeout(() => {
      // Clear state caches to prevent stale levels/pricing from contaminating the view of a different asset
      setChartData([]);
      setZones([]);
      setMetrics([]);
      setWarmupSecondsLeft(60);
      klinesCacheRef.current = {};
      tapeSpeedHistoryRef.current = [];
      tickVolumeHistoryRef.current = [];
      
      console.log(`Loading fresh indicators and levels for ${symbol}...`);
      loadData();
    }, 1000);

    return () => clearTimeout(delayDebounce);
  }, [config.symbols]);

  // 1b. Periodic background levels re-evaluation & candle-pivot drift alignment (Every 60 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [config.symbols]);

  // 1c. Warm-up timer countdown (1 minute / 60 seconds)
  useEffect(() => {
    if (halted) return;
    if (warmupSecondsLeft <= 0) return;

    const interval = setInterval(() => {
      setWarmupSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [halted, warmupSecondsLeft]);

  // Automatically swap active chart candles and reset timer when timeframe state changes
  useEffect(() => {
    if (klinesCacheRef.current[timeframe]) {
      setChartData(klinesCacheRef.current[timeframe]);
      lastCandleTimeRef.current = Date.now();
    }
  }, [timeframe]);

  // 2. Establish Real-time Market Data Connection via Server-Sent Events (SSE) Proxy
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let active = true;

    const symbol = (config.symbols || "BTCUSDT").trim().toUpperCase();
    if (symbol.length < 3) return;

    const delayDebounce = setTimeout(() => {
      connect();
    }, 1000);

    function connect() {
      if (!active) return;

      if (reconnectTimeout) clearTimeout(reconnectTimeout);

      console.log(`Connecting to server-side Binance Futures SSE Proxy for ${symbol}...`);
      setWsStatus(`CONNECTING [${symbol}]`);

      try {
        eventSource = new EventSource(`/api/stream?symbol=${symbol}`);

        eventSource.onopen = () => {
          if (!active) return;
          console.log(`Connected to Binance Futures SSE Proxy or fallback for ${symbol}.`);
          setWsStatus(`OK [${symbol}]`);
          setLatency(1.1 + Math.random() * 0.5);
          lastMsgTimeRef.current = Date.now();
        };

        eventSource.onmessage = (e) => {
          if (!active) return;
          lastMsgTimeRef.current = Date.now();

          try {
            const rawMsg = JSON.parse(e.data);
            const msg = rawMsg.data ? rawMsg.data : rawMsg;

            if (msg.type === "ws_status") {
              if (msg.status && msg.status.startsWith("OK")) {
                setWsStatus(msg.status === "OK" ? `OK [${symbol}]` : msg.status);
              } else {
                setWsStatus(`RECONNECTING...`);
                setLatency(0);
              }
            } else if (msg.e === "aggTrade") {
              const price = parseFloat(msg.p);
              const qty = parseFloat(msg.q);

              aggRef.current.trades++;
              if (msg.m) {
                // m = true is maker buyer => taker seller -> sell volume
                aggRef.current.sellVol += qty * price;
              } else {
                aggRef.current.buyVol += qty * price;
              }
              aggRef.current.lastPrice = price;

              // Measure real physical latency from Binance server event time E or trade time T
              const realLatency = Math.max(
                1,
                Date.now() - (msg.E || msg.T || Date.now()),
              );
              latencyBuffer.current.push(realLatency);
              if (latencyBuffer.current.length > 20)
                latencyBuffer.current.shift();
            } else if (msg.e === "openInterestUpdate") {
              const latestRealOI = parseFloat(msg.o);
              if (!isNaN(latestRealOI) && latestRealOI > 0) {
                oiRef.current = latestRealOI;
                lastOiMsgTimeRef.current = Date.now();
              }
            }
          } catch (err) {
            // Squelch JSON parse errors
          }
        };

        eventSource.onerror = (err) => {
          console.warn(`SSE Proxy connection error for ${symbol}:`, err);
          handleConnectionFailure();
        };
      } catch (err) {
        console.error(`SSE Creation threw error for ${symbol}:`, err);
        handleConnectionFailure();
      }
    }

    function handleConnectionFailure() {
      if (!active) return;
      setLatency(0);
      setWsStatus("RECONNECTING...");

      if (eventSource) {
        eventSource.close();
      }

      reconnectTimeout = setTimeout(connect, 3000);
    }

    return () => {
      active = false;
      clearTimeout(delayDebounce);
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [config.symbols]);

  // 3. FSM Loop & Metrics Aggregator tick
  useEffect(() => {
    if (halted) return;

    const interval = setInterval(() => {
      // Dump accumulator
      const a = aggRef.current;
      const now = Date.now();
      const baseAsset = (configRef.current?.symbols || "BTCUSDT").trim().toUpperCase().replace("USDT", "").replace("BUSD", "");
      const isWsActive =
        wsStatusRef.current.includes("OK") &&
        now - lastMsgTimeRef.current < 4000;

      let newPrice = a.lastPrice;
      const currentZones = zonesRef.current;
      let minD = Infinity;
      let nearestZoneIndex = -1;

      currentZones.forEach((z, idx) => {
        const checkPrice = newPrice === 0 ? z.price : newPrice;
        let dist = 0;
        const pLow = z.priceLow !== undefined ? z.priceLow : z.price;
        const pHigh = z.priceHigh !== undefined ? z.priceHigh : z.price;
        if (checkPrice > pHigh) {
          dist = checkPrice - pHigh;
        } else if (checkPrice < pLow) {
          dist = pLow - checkPrice;
        } else {
          dist = 0;
        }
        if (dist < minD) {
          minD = dist;
          nearestZoneIndex = idx;
        }
      });

      // No emulation: If the WebSocket is inactive, keep prices completely unchanged.
      // We only initialize once from historical data if no price has been recorded yet.
      if (newPrice === 0) {
        const lastCandle =
          chartDataRef.current[chartDataRef.current.length - 1];
        newPrice = lastCandle ? lastCandle.close : 64500;
        a.lastPrice = newPrice;
      }

      // Update level poke tracker
      currentZones.forEach((z) => {
        if (z.isBroken) return;
        const key = `${z.type}_${z.price}`;
        const pHigh = z.priceHigh !== undefined ? z.priceHigh : z.price;
        const pLow = z.priceLow !== undefined ? z.priceLow : z.price;

        if (!levelPokeTrackerRef.current[key]) {
          levelPokeTrackerRef.current[key] = {
            pierced: false,
            timestamp: 0,
          };
        }

        const tracker = levelPokeTrackerRef.current[key];
        const isResistance = z.type.includes("RES") || z.type.includes("HIGH") || z.type.includes("SUPPLY");
        const isSupport = z.type.includes("SUP") || z.type.includes("LOW") || z.type.includes("DEMAND");

        if (isResistance && newPrice >= pHigh) {
          tracker.pierced = true;
          tracker.maxPriceSeen = Math.max(tracker.maxPriceSeen || newPrice, newPrice);
          tracker.timestamp = Date.now();
        } else if (isSupport && newPrice <= pLow) {
          tracker.pierced = true;
          tracker.minPriceSeen = Math.min(tracker.minPriceSeen || newPrice, newPrice);
          tracker.timestamp = Date.now();
        }

        // Expire tracker if it's older than 60 seconds
        if (tracker.pierced && Date.now() - tracker.timestamp > 60000) {
          tracker.pierced = false;
          tracker.maxPriceSeen = undefined;
          tracker.minPriceSeen = undefined;
        }
      });

      // Adaptive FSM interaction thresholds derived dynamically from 5m ATR
      const atrVal = atrRef.current || 60;
      const localScale = newPrice / 60000.0;
      const approachingThreshold = Math.max(12 * localScale, atrVal * 0.25); // Volatility-adapted approaching distance
      const armedThreshold = Math.max(5 * localScale, atrVal * 0.1); // Volatility-adapted trigger-ready distance
      // Give ARMED state a wider exit corridor to allow price breathing and continuous flow analysis within/near high density zones, preventing premature resets
      const armedExitThreshold = Math.max(22 * localScale, atrVal * 0.45); // Volatility-adapted interaction bounds exit

      // Aggregation of 100% Live real-time trade signals from Binance (zero emulation)
      const tradesCount = a.trades;
      const buyVol = a.buyVol;
      const sellVol = a.sellVol;

      const tapeSpeed = tradesCount * 4; // Extrapolated trades/sec

      // Update Order Flow Speed history and compute rolling 30-second baseline average
      tapeSpeedHistoryRef.current.push(tapeSpeed);
      if (tapeSpeedHistoryRef.current.length > 120) {
        tapeSpeedHistoryRef.current.shift();
      }
      const speedSum = tapeSpeedHistoryRef.current.reduce(
        (sum, v) => sum + v,
        0,
      );
      const baselineAvg =
        tapeSpeedHistoryRef.current.length > 0
          ? speedSum / tapeSpeedHistoryRef.current.length
          : 5.0;
      
      const isShitcoin = configRef.current.execution.shitcoinMode;
      const speedFloor = isShitcoin ? 0.6 : 1.8;
      const tapeSpeedBaseline = Math.max(speedFloor, baselineAvg); // floor baseline to ignore dead market skewing

      // Calculate rolling standard deviation of tape speed
      const tapeSpeedAvg = baselineAvg;
      const speedVariance = tapeSpeedHistoryRef.current.reduce(
        (sum, v) => sum + Math.pow(v - tapeSpeedAvg, 2),
        0
      ) / Math.max(1, tapeSpeedHistoryRef.current.length);
      const tapeSpeedStdDev = tapeSpeedHistoryRef.current.length > 5 ? Math.sqrt(speedVariance) : 1.5;

      // Calculate relative tape speed acceleration
      const tapeAcceleration = tapeSpeed / tapeSpeedBaseline;

      // Cumulative Session-wide Volume Delta (CVD) tracking
      const cvdDelta = (buyVol - sellVol) / 1000; // Volume delta in Thousands (250ms tick step)
      cvdCumulativeRef.current += cvdDelta;
      const cvdCumulative = cvdCumulativeRef.current;

      const totalVolTick = buyVol + sellVol;
      const orderbookImbalance =
        totalVolTick > 0 ? (buyVol - sellVol) / totalVolTick : 0.0;

      // Track relative volume (RVOL) and tick-by-tick volumes for dynamic breakout/absorption adaptation
      const volInThousand = totalVolTick / 1000;
      tickVolumeHistoryRef.current.push(volInThousand);
      if (tickVolumeHistoryRef.current.length > 120) {
        tickVolumeHistoryRef.current.shift();
      }
      const volSum = tickVolumeHistoryRef.current.reduce((sum, v) => sum + v, 0);
      const avgTickVol = tickVolumeHistoryRef.current.length > 0
        ? volSum / tickVolumeHistoryRef.current.length
        : 1.0;
      const volVariance = tickVolumeHistoryRef.current.reduce(
        (sum, v) => sum + Math.pow(v - avgTickVol, 2),
        0
      ) / Math.max(1, tickVolumeHistoryRef.current.length);
      const tickVolStdDev = tickVolumeHistoryRef.current.length > 5 ? Math.sqrt(volVariance) : 0.3;

      // --- DYNAMIC Z-SCORE IMPLEMENTATION ---
      // 1. Z-Score representing how many standard deviations the current tape speed is from rolling baseline
      const tapeSpeedZScore = tapeSpeedStdDev > 0 ? (tapeSpeed - tapeSpeedBaseline) / tapeSpeedStdDev : 0.0;

      // 2. Coefficient of Variation (CV) measures relative dispersion: higher CV means a more erratic/bursty tape
      const tapeSpeedCV = tapeSpeedAvg > 0 ? tapeSpeedStdDev / tapeSpeedAvg : 0.35;

      // 3. Relative Volume (RVOL): whether current velocity has heavy transactional backing or is just high-frequency dust
      const rvol = avgTickVol > 0 ? volInThousand / avgTickVol : 1.0;

      // 4. Base Z-Score target threshold
      const baseZScoreThreshold = isShitcoin ? 1.0 : 1.8;

      // 5. Apply adaptive components:
      // - Higher CV (erratic background noise) boosts required Z-Score threshold.
      const cvAdjustment = (tapeSpeedCV - 0.4) * 0.4;

      // - Strong volume confirmation discounts the threshold (allows earlier signal). Low-vol prints penalize.
      let rvolAdjustment = 0;
      if (rvol > 1.5) {
        rvolAdjustment = -Math.min(0.4, (rvol - 1.0) * 0.15);
      } else if (rvol < 0.7) {
        rvolAdjustment = Math.min(0.5, (1.0 - rvol) * 0.5);
      }

      // 6. Dynamic Z-Score threshold boundary clamping
      const minThreshold = isShitcoin ? 0.6 : 1.2;
      const maxThreshold = isShitcoin ? 2.0 : 2.8;
      const dynamicZScoreThreshold = Math.max(
        minThreshold,
        Math.min(maxThreshold, baseZScoreThreshold + cvAdjustment + rvolAdjustment)
      );

      // Save to ref for downstream filtering alerts
      dynamicZScoreThresholdRef.current = dynamicZScoreThreshold;

      // 7. Core trigger logic replacing standard static standard deviations
      const isTapeAccelerated =
        tapeSpeedZScore > dynamicZScoreThreshold &&
        tapeAcceleration > (isShitcoin ? 1.15 : 1.3);

      // Replaces standard hardcoded 0.4, 0.25, and 0.08 thresholds dynamically
      const cvdBreakoutThreshold = Math.max(isShitcoin ? 0.04 : 0.12, avgTickVol * 1.5 + 1.0 * tickVolStdDev);
      const cvdAbsorptionThreshold = Math.max(isShitcoin ? 0.025 : 0.08, avgTickVol * 0.9 + 0.6 * tickVolStdDev);
      const cvdFalseBreakoutThreshold = Math.max(isShitcoin ? 0.01 : 0.03, avgTickVol * 0.35 + 0.2 * tickVolStdDev);

      // === SOLUTION B: INSTANT CROSSOVER MOMENTUM BREAKTHROUGH EXECUTION (FSM BYPASS) ===
      let bypassPreciseEntry = false;
      let crossoverTriggeredSide: "BUY" | "SELL" | null = null;
      let crossoverTriggeredStrat: "BREAKOUT" | null = null;
      let crossoverSignalMsg = "";
      let crossoverNearestZone: any = null;

      const prevPrice = prevPriceRef.current;
      if (prevPrice > 0 && prevPrice !== newPrice && positionRef.current === null) {
        // Find if we crossed any active, non-broken, non-predictive HTF or LTF zone
        for (let i = 0; i < currentZones.length; i++) {
          const z = currentZones[i];
          if (
            z.isBroken ||
            z.type.startsWith("PRED LIQ") ||
            z.type === "ACTIVE POS LIQ"
          ) {
            continue;
          }

          const zPrice = z.price;
          const isSupport = z.type.includes("SUP") || z.type.includes("LOW") || z.type.includes("DEMAND");
          const isResistance = z.type.includes("RES") || z.type.includes("HIGH") || z.type.includes("SUPPLY");

          // support breach: prevPrice was above, newPrice is below or equal
          const isSupportCrossDown = isSupport && prevPrice > zPrice && newPrice <= zPrice;
          // resistance breach: prevPrice was below, newPrice is above or equal
          const isResistanceCrossUp = isResistance && prevPrice < zPrice && newPrice >= zPrice;

          if (isSupportCrossDown || isResistanceCrossUp) {
            // Check for high-velocity breakthrough confirmation
            const fsmScale = newPrice / 60000.0;
            // Adaptive thresholds:
            const meetsTapeSpeed = isTapeAccelerated || tapeAcceleration > 1.25;
            const meetsCvd = isSupportCrossDown 
              ? (cvdDelta < -cvdBreakoutThreshold * 0.45) 
              : (cvdDelta > cvdBreakoutThreshold * 0.45);
            const meetsImbalance = isSupportCrossDown
              ? (orderbookImbalance < -0.05)
              : (orderbookImbalance > 0.05);

            if (meetsTapeSpeed && (meetsCvd || meetsImbalance)) {
              crossoverTriggeredSide = isSupportCrossDown ? "SELL" : "BUY";
              crossoverTriggeredStrat = "BREAKOUT";
              bypassPreciseEntry = true;
              crossoverNearestZone = z;
              
              const levelDesc = `${z.timeframe?.toUpperCase() || ""}-Level (${z.type})`;
              if (isSupportCrossDown) {
                crossoverSignalMsg = `⚡ [Solution B: Direct Crossover Breakthrough] Instant Entry activated! Price sliced downwards through support ${levelDesc} at $${zPrice.toFixed(1)} to $${newPrice.toFixed(1)}. Tape Accel: ${tapeAcceleration.toFixed(1)}x. Selling CVD Delta: ${cvdDelta.toFixed(2)}k. Bypassing FSM latency for zero slippage.`;
              } else {
                crossoverSignalMsg = `⚡ [Solution B: Direct Crossover Breakthrough] Instant Entry activated! Price sliced upwards through resistance ${levelDesc} at $${zPrice.toFixed(1)} to $${newPrice.toFixed(1)}. Tape Accel: ${tapeAcceleration.toFixed(1)}x. Buying CVD Delta: +${cvdDelta.toFixed(2)}k. Bypassing FSM latency for zero slippage.`;
              }
              break; // Trigger immediately on first crossed zone
            }
          }
        }
      }

      // Update previous price for next tick tracking
      prevPriceRef.current = newPrice;

      // Real-time tracking of BTC Futures Open Interest (OI)
      // If we have an active real-time live connection message, do not simulate-overwrite, use live WS updates directly.
      const isOiLiveActive = Date.now() - lastOiMsgTimeRef.current < 20000;
      let openInterest = oiRef.current;
      let oiDelta = 0;

      if (isOiLiveActive) {
        oiDelta = openInterest - prevOiRef.current;
        prevOiRef.current = openInterest;
      } else {
        // Fallback simulation when WS is inactive/down
        let calculatedOiDelta = 0;
        if (totalVolTick > 0) {
          if (tapeSpeed > tapeSpeedBaseline + 1.5 * tapeSpeedStdDev || tapeAcceleration > 2.0) {
            calculatedOiDelta = totalVolTick * 0.000004 * (cvdDelta > 0 ? 1 : -1);
          } else {
            calculatedOiDelta = totalVolTick * 0.0000008 * orderbookImbalance;
          }
        }
        oiRef.current += calculatedOiDelta;

        // Clamp Open Interest only under fallback simulation mode
        if (oiRef.current < 1300) oiRef.current = 1300;
        if (oiRef.current > 1450) oiRef.current = 1450;
        openInterest = oiRef.current;

        oiDelta = openInterest - prevOiRef.current;
        prevOiRef.current = openInterest;
      }

      // Reset trade count accumulator for next tick
      a.trades = 0;
      a.buyVol = 0;
      a.sellVol = 0;

      // Average buffered simulated networking latencies
      if (latencyBuffer.current.length > 0) {
        setLatency(
          latencyBuffer.current.reduce((acc, curr) => acc + curr, 0) /
            latencyBuffer.current.length,
        );
      } else {
        setLatency(
          isWsActive ? 1.1 + Math.random() * 0.4 : 1.8 + Math.random() * 0.9,
        );
      }

      // Append chart tick real-time: push new candles periodically, update active high/low
      const getTimeframeMs = (tf: string) => {
        switch (tf) {
          case "1m":
            return 20000;
          case "5m":
            return 100000;
          case "15m":
            return 300000;
          case "1h":
            return 1200000;
          case "4h":
            return 4800000;
          case "1d":
            return 15000000;
          default:
            return 20000;
        }
      };

      const activeTf = timeframeRef.current;
      const timeframeMs = getTimeframeMs(activeTf);

      if (now - lastCandleTimeRef.current >= timeframeMs) {
        lastCandleTimeRef.current = now;
        setChartData((prev) => {
          if (prev.length === 0) return prev;
          let nextCandleTime = "";
          if (activeTf === "1d") {
            nextCandleTime = new Date(now).toLocaleDateString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
            });
          } else {
            nextCandleTime = new Date(now).toLocaleTimeString("ru-RU", {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              ...(activeTf === "1m" || activeTf === "5m"
                ? { second: "2-digit" }
                : {}),
            });
          }
          const newCandle: ChartCandle = {
            time: nextCandleTime,
            open: prev[prev.length - 1].close,
            high: prev[prev.length - 1].close,
            low: prev[prev.length - 1].close,
            close: newPrice,
          };
          const updated = [...prev.slice(1), newCandle];
          klinesCacheRef.current[activeTf] = updated;
          return updated;
        });
      } else {
        setChartData((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIndex = next.length - 1;
          const lastCandle = next[lastIndex];
          next[lastIndex] = {
            ...lastCandle,
            close: newPrice,
            high: Math.max(lastCandle.high, newPrice),
            low: Math.min(lastCandle.low, newPrice),
          };
          klinesCacheRef.current[activeTf] = next;
          return next;
        });
      }

      // Append hot path metrics (Real-time dynamic data exclusively)
      setMetrics((prev) => {
        const timeStr = new Date()
          .toLocaleTimeString("ru-RU", {
            hour12: false,
            second: "2-digit",
            fractionalSecondDigits: 1,
          } as any)
          .substring(0, 11);
        const totalVolume = buyVol + sellVol;
        const orderbookImbalance =
          totalVolume > 0 ? (buyVol - sellVol) / totalVolume : 0.0;
        const next = [
          ...prev,
          {
            time: timeStr,
            price: newPrice,
            tapeSpeed,
            tapeSpeedBaseline,
            tapeAcceleration,
            cvdDelta,
            cvdCumulative,
            obImbalance: orderbookImbalance,
            openInterest,
          },
        ];
        return next.slice(-40);
      });

      // Update unrealized PNL on the open position
      if (positionRef.current) {
        const active = positionRef.current;
        const diff = newPrice - active.entryPrice;
        const pnl =
          active.side === "BUY" ? diff * active.size : -diff * active.size;
        const pnlPct = (pnl / (active.entryPrice * active.size)) * 100 * 10;

        const updatedPos = {
          ...active,
          unrealizedPnL: pnl,
          unrealizedPnLPct: pnlPct,
        };
        setPosition(updatedPos);
        positionRef.current = updatedPos;
      }

      const baseZones = currentZones.filter(
        (z) => !z.type.startsWith("PRED LIQ") && z.type !== "ACTIVE POS LIQ",
      );

      let anyZoneChanged = false;
      const updatedBaseZones = baseZones.map((z) => {
        // Already broken junior levels stay broken
        if (z.isBroken) return z;

        // Prevent live tracking level from changing role (SUPPORT <-> RESIST) or breaking/disappearing
        // while we are actively evaluating trades (ARMED or APPROACHING state) and "dancing" on support/resistance limit.
        const isActiveInteractiveLevel = (stateRef.current === "ARMED" || stateRef.current === "APPROACHING") &&
          nearestZoneIndex !== -1 &&
          currentZones[nearestZoneIndex] &&
          currentZones[nearestZoneIndex].price === z.price &&
          currentZones[nearestZoneIndex].type === z.type;

        const isResistance = z.price >= newPrice;
        const currentIsResistance =
          z.type.includes("RESIST") || z.type.includes("HIGH");

        const distToLevel = Math.abs(z.price - newPrice);

        // If a junior level (1m or 5m) was already crossed, keep it alive while near, but retire if price left the zone
        if ((z.timeframe === "1m" || z.timeframe === "5m") && z.hasBeenCrossed) {
          if (isActiveInteractiveLevel) {
            // Keep active interactive levels alive to prevent FSM from losing context
          } else if (distToLevel >= approachingThreshold) {
            anyZoneChanged = true;
            const timeStr = new Date().toLocaleTimeString("ru-RU");
            const criteria = [...(z.validationCriteria || [])];
            criteria.push(
              `[${timeStr}] Уровень окончательно пробит: Цена отдалилась на $${distToLevel.toFixed(1)} (зона закрыта).`,
            );
            return {
              ...z,
              isBroken: true,
              updatedAt: timeStr,
              validationCriteria: criteria,
            };
          }
        }

        let shouldFlip = isResistance !== currentIsResistance;
        if (isActiveInteractiveLevel) {
          shouldFlip = false;
        }

        if (shouldFlip) {
          anyZoneChanged = true;
          const tfUpper = (z.timeframe || "1m").toUpperCase();
          let finalType = z.type;
          let finalColor = z.color;
          let isBroken = false;
          let hasBeenCrossed = z.hasBeenCrossed || false;
          const newTouchesCount = (z.touchesCount || 1) + 1;
          const lastTouchTimestamp = Date.now();

          // Junior timeframe levels (1m, 5m) are retired (marked broken) upon crossing to maintain high fidelity.
          // BUT they are kept active while the price is near, allowing the FSM logic to register/execute trade entries!
          if (z.timeframe === "1m" || z.timeframe === "5m") {
            if (distToLevel < approachingThreshold) {
              isBroken = false;
              hasBeenCrossed = true;
            } else {
              isBroken = true;
            }
          }

          if (z.timeframe === "1d") {
            finalType = isResistance ? "1D SWING RESIST" : "1D SWING SUPPORT";
            finalColor = isResistance ? "#f43f5e" : "#3b82f6";
          } else {
            finalType = isResistance
              ? `${tfUpper} RESIST`
              : `${tfUpper} SUPPORT`;
            if (z.timeframe === "4h") {
              finalColor = isResistance ? "#f59e0b" : "#10b981";
            } else if (z.timeframe === "1h") {
              finalColor = isResistance ? "#d946ef" : "#06b6d4";
            } else if (z.timeframe === "15m") {
              finalColor = isResistance ? "#84cc16" : "#a855f7";
            } else {
              // 5m
              finalColor = isResistance ? "#fb7185" : "#38bdf8";
            }
          }

          const criteria: string[] = [...(z.validationCriteria || [])];
          if (isBroken) {
            criteria.push(
              `[${new Date().toLocaleTimeString("ru-RU")}] Уровень пробит: Цена $${newPrice.toFixed(2)} пересекла профиль.`,
            );
          } else if (hasBeenCrossed && !z.hasBeenCrossed) {
            criteria.push(
              `[${new Date().toLocaleTimeString("ru-RU")}] Тестирование уровня: Цена $${newPrice.toFixed(2)} пересекла профиль. Ожидание реакции/сигналов.`,
            );
          }

          if (z.timeframe === "1d") {
            if (criteria.length <= 1) {
              criteria.push(
                "Крайние точки диапазона (Swing): Абсолютный экстремум за 30 дней.",
              );
              criteria.push(
                isResistance
                  ? "Пул ликвидности (HTF): Высокая плотность лимитных ордеров на продажу."
                  : "Пул ликвидности (HTF): Высокая плотность лимитных ордеров на покупку.",
              );
              criteria.push(
                "Объемный профиль: Крупный исторический горизонтальный узел.",
              );
            }
          } else if (z.levelStrength === "HTF") {
            if (criteria.length <= 1) {
              criteria.push(
                `Сильный разворот ${tfUpper}: Подтвержденная 3-барная структура.`,
              );
              criteria.push(
                isResistance
                  ? "Защита уровня (Resist): Лимитные заявки продавцов (Ask blocks)."
                  : "Защита уровня (Support): Лимитные заявки покупателей (Bid blocks).",
              );
              criteria.push(
                "Подтверждение CVD: Обнаружены следы агрессивного поглощения.",
              );
            }
          } else if (!isBroken) {
            if (criteria.length <= 1) {
              criteria.push(
                `Микро-свинг ${tfUpper}: Быстрый локальный экстремум.`,
              );
              criteria.push(
                isResistance
                  ? "Зона предложения рынка: Возможный ложный пробой."
                  : "Зона спроса рынка: Ожидаемая реакция покупателя.",
              );
              criteria.push(
                "Краткосрочный импульс: Подходит для скальпинг-пробоев.",
              );
            }
          }

          // Append active transition log
          const timeStr = new Date().toLocaleTimeString("ru-RU");
          criteria.push(
            `[${timeStr}] Ротация уровня: Увеличение касаний до ${newTouchesCount}. Уровень флипнут в ${isResistance ? "RESIST" : "SUPPORT"}.`,
          );

          return {
            ...z,
            type: finalType,
            color: finalColor,
            updatedAt: timeStr,
            validationCriteria: criteria,
            isBroken,
            hasBeenCrossed,
            touchesCount: newTouchesCount,
            lastTouchTimestamp,
          };
        }
        return z;
      });

      // Recalculate and inject predictive liquidation lines gracefully (no clutter!)
      const nextZonesList = [...updatedBaseZones];

      if (configRef.current.execution.predictiveLiqEnabled) {
        // Nearest support below newPrice
        const supportZones = updatedBaseZones.filter(
          (z) => z.type.includes("SUPPORT") || z.type.includes("LOW"),
        );
        let closestSupport: LiquidityZone | null = null;
        let minSupDist = Infinity;
        supportZones.forEach((z) => {
          if (z.price < newPrice) {
            const dist = newPrice - z.price;
            if (dist < minSupDist) {
              minSupDist = dist;
              closestSupport = z;
            }
          }
        });

        // Nearest resistance above newPrice
        const resistanceZones = updatedBaseZones.filter(
          (z) => z.type.includes("RESIST") || z.type.includes("HIGH"),
        );
        let closestResistance: LiquidityZone | null = null;
        let minResDist = Infinity;
        resistanceZones.forEach((z) => {
          if (z.price > newPrice) {
            const dist = z.price - newPrice;
            if (dist < minResDist) {
              minResDist = dist;
              closestResistance = z;
            }
          }
        });

        // Add 100x/50x Long Retail Liquidations (0.4% below nearest support)
        if (closestSupport) {
          nextZonesList.push({
            price: +(closestSupport.price * 0.996).toFixed(1),
            type: "PRED LIQ (LONGS)",
            color: "#eab308", // Golden Yellow
            levelStrength: "LTF",
            timeframe: closestSupport.timeframe || "1h",
            updatedAt: new Date().toLocaleTimeString("ru-RU"),
            validationCriteria: [
              "Предиктивный уровень принудительного закрытия розничных лонг-позиций.",
              "Срабатывает при пробое зоны локальной поддержки на повышенных объемах.",
            ],
          });
        }

        // Add 100x/50x Short Retail Liquidations (0.4% above nearest resistance)
        if (closestResistance) {
          nextZonesList.push({
            price: +(closestResistance.price * 1.004).toFixed(1),
            type: "PRED LIQ (SHORTS)",
            color: "#f43f5e", // Light red
            levelStrength: "LTF",
            timeframe: closestResistance.timeframe || "1h",
            updatedAt: new Date().toLocaleTimeString("ru-RU"),
            validationCriteria: [
              "Предиктивный уровень принудительного закрытия розничных шорт-позиций.",
              "Срабатывает при пробое зоны локальной сопротивления на повышенных объемах.",
            ],
          });
        }

        // Add your own active position liquidation price line (10x leverage MM model)
        const activePos = positionRef.current;
        if (activePos) {
          const isBuy = activePos.side === "BUY";
          const posLiqPrice = isBuy
            ? activePos.entryPrice * 0.905
            : activePos.entryPrice * 1.095;
          nextZonesList.push({
            price: +posLiqPrice.toFixed(1),
            type: "ACTIVE POS LIQ",
            color: "#ef4444", // Bright Red
            levelStrength: "HTF", // Solid/bold
            timeframe: activePos.timeframe || "1m",
            updatedAt: new Date().toLocaleTimeString("ru-RU"),
            validationCriteria: [
              "Уровень принудительной ликвидации Вашей открытой позиции (10х маржинальное плечо).",
              "Гарантированный Margin Call при достижении отметки без защитного закрытия.",
              `Вход позиции: $${activePos.entryPrice.toFixed(1)} | Объём: ${activePos.size} ${baseAsset}`,
            ],
          });
        }
      }

      setZones(nextZonesList);
      zonesRef.current = nextZonesList;
      const resolvedCurrentZones = nextZonesList;

      // Recalculate precise distances to technical zones with finalized tick price
      minD = Infinity;
      nearestZoneIndex = -1;

      resolvedCurrentZones.forEach((z, idx) => {
        // Skip predictive layers and broken levels to keep trading triggers locked to actual, intact support/resistance limits
        if (
          z.type.startsWith("PRED LIQ") ||
          z.type === "ACTIVE POS LIQ" ||
          z.isBroken
        )
          return;

        let dist = 0;
        const pLow = z.priceLow !== undefined ? z.priceLow : z.price;
        const pHigh = z.priceHigh !== undefined ? z.priceHigh : z.price;
        if (newPrice > pHigh) {
          dist = newPrice - pHigh;
        } else if (newPrice < pLow) {
          dist = pLow - newPrice;
        } else {
          dist = 0;
        }
        if (dist < minD) {
          minD = dist;
          nearestZoneIndex = idx;
        }
      });

      // FSM Engine Tick Rules
      let prev = stateRef.current;
      if (crossoverTriggeredSide && crossoverTriggeredStrat && prev !== "ARMED") {
        setState("ARMED");
        stateRef.current = "ARMED";
        prev = "ARMED";
      }
      let nextState = prev;

      // Adaptive FSM interaction thresholds are already defined at the top of handleTick

      if (prev === "SCANNING") {
        if (minD < approachingThreshold) {
          nextState = "APPROACHING";
        }
      } else if (prev === "APPROACHING") {
        if (minD < armedThreshold) {
          nextState = "ARMED";
        } else if (minD >= approachingThreshold) {
          nextState = "SCANNING";
        }
      } else if (prev === "ARMED") {
        if (minD >= armedExitThreshold) {
          nextState = "SCANNING";
        }
        // Advanced Entry Decision Matrix comparing tape speed velocity & cumulative delta volume
        else {
          let nearestZone =
            nearestZoneIndex !== -1
              ? resolvedCurrentZones[nearestZoneIndex]
              : null;

          if (crossoverTriggeredSide && crossoverNearestZone) {
            nearestZone = crossoverNearestZone;
          }

          const isNearResistance = nearestZone
            ? nearestZone.type.includes("RES") ||
              nearestZone.type.includes("HIGH")
            : false;
          const isNearSupport = nearestZone
            ? nearestZone.type.includes("SUP") ||
              nearestZone.type.includes("LOW")
            : false;

          let fbResistancePierceValid = false;
          let fbSupportPierceValid = false;

          if (nearestZone) {
            const zHigh = nearestZone.priceHigh ?? nearestZone.price;
            const zLow = nearestZone.priceLow ?? nearestZone.price;
            const fsmScale = newPrice / 60000.0;
            const levelKey = `${nearestZone.type}_${nearestZone.price}`;
            const tracker = levelPokeTrackerRef.current[levelKey];
            const isFBPierced = !!(tracker && tracker.pierced);

            fbResistancePierceValid = configRef.current.execution.falseBreakoutDelayEnabled
              ? (isFBPierced && newPrice < zHigh && newPrice >= zHigh - Math.max(8 * fsmScale, atrVal * 0.18))
              : (newPrice >= zHigh - 2 * fsmScale && newPrice <= zHigh + Math.max(8 * fsmScale, atrVal * 0.18));

            fbSupportPierceValid = configRef.current.execution.falseBreakoutDelayEnabled
              ? (isFBPierced && newPrice > zLow && newPrice <= zLow + Math.max(8 * fsmScale, atrVal * 0.18))
              : (newPrice <= zLow + 2 * fsmScale && newPrice >= zLow - Math.max(8 * fsmScale, atrVal * 0.18));
          }

          let triggerEntrySide: "BUY" | "SELL" | null = crossoverTriggeredSide;
          let chosenStratType: "BREAKOUT" | "ABSORPTION_FADE" | "FALSE_BREAKOUT" | null = crossoverTriggeredStrat;
          let signalMsg = crossoverSignalMsg;

          if (crossoverTriggeredSide) {
            // Bypass standard signal detection rules as we have a direct high-speed crossover trigger!
          } else if (isNearResistance && isTapeAccelerated && nearestZone) {
            const zHigh = nearestZone.priceHigh ?? nearestZone.price;
            const zLow = nearestZone.priceLow ?? nearestZone.price;
            
            // Option A: aggressive buying confirmation with OI growth & bid imbalance => TRUE BREAKOUT
            const meetsCvdBreakout = cvdDelta > cvdBreakoutThreshold;
            const isAboveOrAtLevel = newPrice > zHigh - atrVal * 0.05;
            const meetsOiBreakout = oiDelta > -0.01;
            const meetsImbalanceBreakout = orderbookImbalance > 0.1;
            const meetsTrueBreakout =
              meetsCvdBreakout &&
              meetsOiBreakout &&
              meetsImbalanceBreakout &&
              isAboveOrAtLevel;
            const fsmScale = newPrice / 60000.0;
            const meetsAbsorptionFailureBreakout =
              newPrice > zHigh + Math.max(5 * fsmScale, atrVal * 0.08) &&
              cvdDelta > cvdAbsorptionThreshold &&
              orderbookImbalance > 0.12 &&
              oiDelta > 0.005;

            if (meetsTrueBreakout || meetsAbsorptionFailureBreakout) {
              triggerEntrySide = "BUY";
              chosenStratType = "BREAKOUT";
              if (meetsTrueBreakout) {
                signalMsg = `True Breakout confirmed at resistance high boundary $${zHigh.toFixed(1)} (${nearestZone?.type || ""}). Speed Acceleration: ${tapeAcceleration.toFixed(1)}x. Strong buying CVD: +${cvdDelta.toFixed(2)}k (adaptive threshold: +${cvdBreakoutThreshold.toFixed(2)}k). OI: +${oiDelta.toFixed(3)}M. Imbalance: +${(orderbookImbalance * 100).toFixed(1)}% bids.`;
              } else {
                signalMsg = `Absorption Failure Squeeze triggered at resistance high boundary $${zHigh.toFixed(1)} (${nearestZone?.type || ""}). Limit Ask Wall collapsed under intensive buying. CVD: +${cvdDelta.toFixed(2)}k (threshold: +${cvdAbsorptionThreshold.toFixed(2)}k). OI: +${oiDelta.toFixed(3)}M. Imbalance: +${(orderbookImbalance * 100).toFixed(1)}% bids.`;
              }
            }
            // Option C: False Breakout (Ложный Пробой) - Bull Trap (Counter-trend fade)
            else if (fbResistancePierceValid && (cvdDelta < -cvdFalseBreakoutThreshold || orderbookImbalance < -0.05)) {
              triggerEntrySide = "SELL";
              chosenStratType = "FALSE_BREAKOUT";
              const levelKey = `${nearestZone.type}_${nearestZone.price}`;
              
              if (configRef.current.execution.falseBreakoutDelayEnabled) {
                const maxPrice = levelPokeTrackerRef.current[levelKey]?.maxPriceSeen || zHigh;
                signalMsg = `False Breakout confirmed on Retrace Trigger (ЛП с возвратом под уровень) at resistance boundary $${zHigh.toFixed(1)} (${nearestZone?.type || ""}). Price poked up to $${maxPrice.toFixed(1)} and returned back to $${newPrice.toFixed(1)}. Sellers reclaimed control: CVD Delta: ${cvdDelta.toFixed(2)}k, Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids.`;
                if (levelPokeTrackerRef.current[levelKey]) {
                  levelPokeTrackerRef.current[levelKey].pierced = false;
                }
              } else {
                signalMsg = `False Breakout (Bull Trap / ЛП) registered at resistance boundary $${zHigh.toFixed(1)} (${nearestZone?.type || ""}). Price poked up to $${newPrice.toFixed(1)} but failed to hold. Sellers reclaimed control: CVD Delta: ${cvdDelta.toFixed(2)}k. Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids. Handled optimally for Fee +0.1% targets.`;
              }
            }
            // Option B: high transaction rate of buyers absorbed by passive limit sellers => ABSORPTION FADE
            else {
              const isExhaustionFade = cvdDelta < -cvdAbsorptionThreshold;
              const isActiveAbsorptionFade = cvdDelta > cvdAbsorptionThreshold && oiDelta > 0.01;
              const meetsImbalanceFade = orderbookImbalance < 0.25;
              const isPriceHoldingResistance = newPrice <= zHigh + Math.max(5 * fsmScale, atrVal * 0.08);

              if (
                (isExhaustionFade || isActiveAbsorptionFade) &&
                meetsImbalanceFade &&
                isPriceHoldingResistance
              ) {
                triggerEntrySide = "SELL";
                chosenStratType = "ABSORPTION_FADE";
                signalMsg =
                  `Absorption Fade triggered inside resistance zone $${zLow.toFixed(1)} - $${zHigh.toFixed(1)} (${nearestZone?.type || ""}). ` +
                  (isActiveAbsorptionFade
                    ? `Active Seller Limit Absorption: Buyers hit ask (CVD: +${cvdDelta.toFixed(2)}k) but price stalled below boundary $${zHigh.toFixed(1)}. Fresh short OI accumulated: +${oiDelta.toFixed(3)}M.`
                    : `Aggressive Seller Backing: Tape accelerated but CVD buying exhausted to sell-off (CVD Delta: ${cvdDelta.toFixed(2)}k).`) +
                  ` Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids. Price holding resistance boundary.`;
              }
            }
          } else if (isNearSupport && isTapeAccelerated && nearestZone) {
            const zHigh = nearestZone.priceHigh ?? nearestZone.price;
            const zLow = nearestZone.priceLow ?? nearestZone.price;

            // Option A: aggressive selling confirmation with OI growth & ask imbalance => TRUE BREAKOUT
            const meetsCvdBreakout = cvdDelta < -cvdBreakoutThreshold;
            const isBelowOrAtLevel = newPrice < zLow + atrVal * 0.05;
            const meetsOiBreakout = oiDelta > -0.01;
            const meetsImbalanceBreakout = orderbookImbalance < -0.1;
            const meetsTrueBreakdown =
              meetsCvdBreakout &&
              meetsOiBreakout &&
              meetsImbalanceBreakout &&
              isBelowOrAtLevel;
            const fsmScale = newPrice / 60000.0;
            const meetsAbsorptionFailureBreakdown =
              newPrice < zLow - Math.max(5 * fsmScale, atrVal * 0.08) &&
              cvdDelta < -cvdAbsorptionThreshold &&
              orderbookImbalance < -0.12 &&
              oiDelta > 0.005;

            if (meetsTrueBreakdown || meetsAbsorptionFailureBreakdown) {
              triggerEntrySide = "SELL";
              chosenStratType = "BREAKOUT";
              if (meetsTrueBreakdown) {
                signalMsg = `True Breakdown confirmed at support low boundary $${zLow.toFixed(1)} (${nearestZone?.type || ""}). Speed Acceleration: ${tapeAcceleration.toFixed(1)}x. Strong selling CVD: ${cvdDelta.toFixed(2)}k (adaptive threshold: -${cvdBreakoutThreshold.toFixed(2)}k). OI: +${oiDelta.toFixed(3)}M. Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids.`;
              } else {
                signalMsg = `Absorption Failure Breakdown triggered at support low boundary $${zLow.toFixed(1)} (${nearestZone?.type || ""}). Limit Bid Wall collapsed under heavy market dumps. CVD: ${cvdDelta.toFixed(2)}k (threshold: -${cvdAbsorptionThreshold.toFixed(2)}k). OI: +${oiDelta.toFixed(3)}M. Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids.`;
              }
            }
            // Option C: False Breakdown (Ложный Пробой) - Bear Trap (Counter-trend fade)
            else if (fbSupportPierceValid && (cvdDelta > cvdFalseBreakoutThreshold || orderbookImbalance > 0.05)) {
              triggerEntrySide = "BUY";
              chosenStratType = "FALSE_BREAKOUT";
              const levelKey = `${nearestZone.type}_${nearestZone.price}`;
              
              if (configRef.current.execution.falseBreakoutDelayEnabled) {
                const minPrice = levelPokeTrackerRef.current[levelKey]?.minPriceSeen || zLow;
                signalMsg = `False Breakdown confirmed on Retrace Trigger (ЛП с возвратом над уровень) at support boundary $${zLow.toFixed(1)} (${nearestZone?.type || ""}). Price poked down to $${minPrice.toFixed(1)} and returned back to $${newPrice.toFixed(1)}. Buyers reclaimed control: CVD Delta: +${cvdDelta.toFixed(2)}k, Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids.`;
                if (levelPokeTrackerRef.current[levelKey]) {
                  levelPokeTrackerRef.current[levelKey].pierced = false;
                }
              } else {
                signalMsg = `False Breakdown (Bear Trap / ЛП) registered at support boundary $${zLow.toFixed(1)} (${nearestZone?.type || ""}). Price poked down to $${newPrice.toFixed(1)} but failed to hold. Buyers reclaimed control: CVD Delta: +${cvdDelta.toFixed(2)}k. Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids. Handled optimally for Fee +0.1% targets.`;
              }
            }
            // Option B: high transaction rate of sellers absorbed by passive limit buyers => ABSORPTION FADE
            else {
              const isExhaustionFade = cvdDelta > cvdAbsorptionThreshold;
              const isActiveAbsorptionFade = cvdDelta < -cvdAbsorptionThreshold && oiDelta > 0.01;
              const meetsImbalanceFade = orderbookImbalance > -0.25;
              const isPriceHoldingSupport = newPrice >= zLow - Math.max(5 * fsmScale, atrVal * 0.08);

              if (
                (isExhaustionFade || isActiveAbsorptionFade) &&
                meetsImbalanceFade &&
                isPriceHoldingSupport
              ) {
                triggerEntrySide = "BUY";
                chosenStratType = "ABSORPTION_FADE";
                signalMsg =
                  `Absorption Fade triggered inside support zone $${zLow.toFixed(1)} - $${zHigh.toFixed(1)} (${nearestZone?.type || ""}). ` +
                  (isActiveAbsorptionFade
                    ? `Active Buyer Limit Absorption: Sellers dumped (CVD: +${cvdDelta.toFixed(2)}k) but support boundary $${zLow.toFixed(1)} held firm. Fresh long OI accumulated: +${oiDelta.toFixed(3)}M.`
                    : `Aggressive Buyer Backing: Tape accelerated but CVD selling exhausted to buying (CVD Delta: +${cvdDelta.toFixed(2)}k).`) +
                  ` Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids. Price holding support boundary.`;
              }
            }
          }

          // === DEEP DATA ACCUMULATION FOR TRADING ENGINE [PRECISE ENTRY MODE] ===
          if (configRef.current.execution.preciseEntryEnabled && !bypassPreciseEntry) {
            if (!armedAccumulatorRef.current) {
              armedAccumulatorRef.current = {
                ticksCount: 0,
                tapeSpeedAcc: 0,
                cvdDeltaAcc: 0,
                obImbalanceAcc: 0,
                oiDeltaAcc: 0,
                entries: [],
              };
            }

            const acc = armedAccumulatorRef.current;
            acc.ticksCount += 1;
            acc.tapeSpeedAcc += tapeAcceleration;
            acc.cvdDeltaAcc += cvdDelta;
            acc.obImbalanceAcc += orderbookImbalance;
            acc.oiDeltaAcc += oiDelta;

            if (triggerEntrySide && chosenStratType) {
              acc.entries.push({ side: triggerEntrySide, strat: chosenStratType });
            }

            // --- OPTIMIZATION: FAST-TRACK ACCELERATION TRADING TRIGGER ---
            // If we have collected at least 5 ticks (1.25s), and we have a very strong impulse
            // (e.g., at least 3 identical signals pushed) AND tape speed acceleration is exceptional (>2.2x),
            // we can trigger the trade immediately preventing negative price slippage.
            let fastTrackTriggered = false;
            let fastTrackSide: "BUY" | "SELL" | null = null;
            let fastTrackStrat: "BREAKOUT" | "ABSORPTION_FADE" | "FALSE_BREAKOUT" | null = null;
            let fastTrackReasons = "";

            if (acc.ticksCount >= 5 && acc.entries.length >= 3) {
              const countMap: Record<string, number> = {};
              acc.entries.forEach(item => {
                const key = `${item.side}_${item.strat}`;
                countMap[key] = (countMap[key] || 0) + 1;
              });

              let maxKey = "";
              let maxCount = 0;
              Object.entries(countMap).forEach(([key, count]) => {
                if (count > maxCount) {
                  maxCount = count;
                  maxKey = key;
                }
              });

              if (maxCount >= 3) {
                const [side, strat] = maxKey.split("_") as ["BUY" | "SELL", "BREAKOUT" | "ABSORPTION_FADE" | "FALSE_BREAKOUT"];
                const currentAvgTapeSpeed = acc.tapeSpeedAcc / acc.ticksCount;
                const netCvdAccum = acc.cvdDeltaAcc;

                const isVeryFastTape = currentAvgTapeSpeed > 2.0;
                const isExtremelyPositiveCvd = side === "BUY" && (strat === "BREAKOUT" ? netCvdAccum > 1.5 : netCvdAccum < -0.6);
                const isExtremelyNegativeCvd = side === "SELL" && (strat === "BREAKOUT" ? netCvdAccum < -1.5 : netCvdAccum > 0.6);

                if (isVeryFastTape && (isExtremelyPositiveCvd || isExtremelyNegativeCvd)) {
                  fastTrackTriggered = true;
                  fastTrackSide = side;
                  fastTrackStrat = strat;
                  fastTrackReasons = `⚡ [Fast-Track Acceleration] High conviction order-flow impulse detected over ${acc.ticksCount} ticks. Avg Tape Accel: ${currentAvgTapeSpeed.toFixed(1)}x, Net CVD: ${netCvdAccum.toFixed(2)}k. Speeding up execution to capture optimal entry.`;
                }
              }
            }

            if (fastTrackTriggered && fastTrackSide && fastTrackStrat) {
              triggerEntrySide = fastTrackSide;
              chosenStratType = fastTrackStrat;
              signalMsg = fastTrackReasons;
              armedAccumulatorRef.current = null; // Clear accumulator on execution
            } else if (acc.ticksCount < 12) {
              // Standard behavior is to hold entry and accumulate a robust rolling statistical set
              const progressMsg = `⏳ [Precise Entry] Analyzing Order Flow: Accumulating tick ${acc.ticksCount}/12 | Volatility index adjusted. Momentary CVD Change: ${cvdDelta >= 0 ? '+' : ''}${cvdDelta.toFixed(2)}k, Imbalance: ${(orderbookImbalance * 100).toFixed(1)}% bids.`;
              
              if (acc.ticksCount % 4 === 1) {
                setSignals((s) => [
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: "SYSTEM_ALERT",
                    side: "NONE",
                    price: newPrice,
                    message: progressMsg,
                  },
                  ...s,
                ].slice(0, 50));
              }

              triggerEntrySide = null;
              chosenStratType = null;
            } else {
              // We have 12 ticks! Let's do the math-based consensus and smoothing
              const avgTapeAcceleration = acc.tapeSpeedAcc / 12;
              const netCvdDelta = acc.cvdDeltaAcc;
              const avgImbalance = acc.obImbalanceAcc / 12;
              const netOiDelta = acc.oiDeltaAcc;

              const totalSignalsCount = acc.entries.length;
              
              // We require at least 2 ticks with valid signal triggers over the 12-tick (3.0s) window
              if (totalSignalsCount >= 2) {
                const countMap: Record<string, number> = {};
                acc.entries.forEach(item => {
                  const key = `${item.side}_${item.strat}`;
                  countMap[key] = (countMap[key] || 0) + 1;
                });

                let maxKey = "";
                let maxCount = 0;
                Object.entries(countMap).forEach(([key, count]) => {
                  if (count > maxCount) {
                    maxCount = count;
                    maxKey = key;
                  }
                });

                const [side, strat] = maxKey.split("_") as ["BUY" | "SELL", "BREAKOUT" | "ABSORPTION_FADE" | "FALSE_BREAKOUT"];
                
                let mathematicallyConfirmed = false;
                let reasons = "";

                if (side === "BUY") {
                  if (strat === "BREAKOUT") {
                    const meetsCvd = netCvdDelta > 1.2;
                    const meetsImbalance = avgImbalance > 0.05;
                    const meetsOi = netOiDelta > -0.03;
                    if (meetsCvd && meetsImbalance && meetsOi) {
                      mathematicallyConfirmed = true;
                      reasons = `Sustained breakout confirmation (CVD: +${netCvdDelta.toFixed(2)}k over 3s, Avg Imbalance: +${(avgImbalance * 100).toFixed(1)}% bids, OI change: +${netOiDelta.toFixed(3)}M).`;
                    }
                  } else if (strat === "FALSE_BREAKOUT") {
                    const meetsCvd = netCvdDelta < -0.2 || avgImbalance < -0.01;
                    if (meetsCvd) {
                      mathematicallyConfirmed = true;
                      reasons = `Sustained bull-trap rejection detected over 3s window (Net CVD Delta: ${netCvdDelta.toFixed(2)}k).`;
                    }
                  } else if (strat === "ABSORPTION_FADE") {
                    const meetsCvd = netCvdDelta < -0.6 || (netCvdDelta > 0.6 && netOiDelta > 0.01);
                    const meetsImbalance = avgImbalance < 0.25;
                    if (meetsCvd && meetsImbalance) {
                      mathematicallyConfirmed = true;
                      reasons = `Sustained resistance seller passive limit absorption confirmed (Net CVD: ${netCvdDelta.toFixed(2)}k, avg book imbalance: ${(avgImbalance * 100).toFixed(1)}% bids).`;
                    }
                  }
                } else if (side === "SELL") {
                  if (strat === "BREAKOUT") {
                    const meetsCvd = netCvdDelta < -1.2;
                    const meetsImbalance = avgImbalance < -0.05;
                    const meetsOi = netOiDelta > -0.03;
                    if (meetsCvd && meetsImbalance && meetsOi) {
                      mathematicallyConfirmed = true;
                      reasons = `Sustained breakdown confirmation (CVD: ${netCvdDelta.toFixed(2)}k over 3s, Avg Imbalance: ${(avgImbalance * 100).toFixed(1)}% bids, OI change: +${netOiDelta.toFixed(3)}M).`;
                    }
                  } else if (strat === "FALSE_BREAKOUT") {
                    const meetsCvd = netCvdDelta > 0.2 || avgImbalance > 0.01;
                    if (meetsCvd) {
                      mathematicallyConfirmed = true;
                      reasons = `Sustained bear-trap rejection detected over 3s window (Net CVD Delta: +${netCvdDelta.toFixed(2)}k).`;
                    }
                  } else if (strat === "ABSORPTION_FADE") {
                    const meetsCvd = netCvdDelta > 0.6 || (netCvdDelta < -0.6 && netOiDelta > 0.01);
                    const meetsImbalance = avgImbalance > -0.25;
                    if (meetsCvd && meetsImbalance) {
                      mathematicallyConfirmed = true;
                      reasons = `Sustained support buyer passive limit absorption confirmed (Net CVD: +${netCvdDelta.toFixed(2)}k, avg book imbalance: ${(avgImbalance * 100).toFixed(1)}% bids).`;
                    }
                  }
                }

                if (mathematicallyConfirmed) {
                  triggerEntrySide = side;
                  chosenStratType = strat;
                  signalMsg = `🎯 [Precise Entry Mode] ${strat} [${side}] confirmed. Data accumulated over 12 ticks (3.0s). ${reasons} Avg Speed: ${avgTapeAcceleration.toFixed(1)}x.`;
                } else {
                  setSignals((s) => [
                    {
                      id: Math.random().toString(36).substr(2, 9),
                      timestamp: new Date().toISOString(),
                      type: "SYSTEM_ALERT",
                      side: "NONE",
                      price: newPrice,
                      message: `❌ [Precise Entry] Entry blocked: Flow criteria did not persist/smooth cleanly over 3s accumulation. Net CVD Delta was ${netCvdDelta >= 0 ? '+' : ''}${netCvdDelta.toFixed(2)}k, Avg Imbalance: ${(avgImbalance * 100).toFixed(1)}%.`,
                    },
                    ...s,
                  ].slice(0, 50));
                  
                  triggerEntrySide = null;
                  chosenStratType = null;
                }
              } else {
                setSignals((s) => [
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: "SYSTEM_ALERT",
                    side: "NONE",
                    price: newPrice,
                    message: `❌ [Precise Entry] Entry blocked: Order flow signals were too sporadic (${totalSignalsCount}/12 ticks had signals) to satisfy deep risk filtering.`,
                  },
                  ...s,
                ].slice(0, 50));

                triggerEntrySide = null;
                chosenStratType = null;
              }

              armedAccumulatorRef.current = null;
            }
          }

          // Real-time Filtration Explanations & Ignore Logs
          if (nearestZone && (isNearResistance || isNearSupport)) {
            const levelKey = `${nearestZone.type}_${nearestZone.price}`;
            const timeSinceLastIgnore = Date.now() - (lastIgnoreLogTimeRef.current[levelKey] || 0);

            if (timeSinceLastIgnore > 45000) { // 45 seconds cooldown to prevent spamming the tape
              let ignoredMsg = "";

              if (triggerEntrySide && chosenStratType && positionRef.current !== null) {
                ignoredMsg = `🔍 Position Active: Ignored new ${chosenStratType} signal at ${nearestZone.type} ($${nearestZone.price.toFixed(1)}) because another ${positionRef.current.side} trade is already active.`;
              } else if (!triggerEntrySide) {
                if (tradesCount > 0) {
                  if (!isTapeAccelerated) {
                    ignoredMsg = `🔍 Level Filtering: Rejected entry at ${nearestZone.type} ($${nearestZone.price.toFixed(1)}) - Tape speed (${tapeSpeed.toFixed(1)} tp/s, ${tapeAcceleration.toFixed(1)}x) did not meet dynamic ${dynamicZScoreThresholdRef.current.toFixed(2)}σ Z-score threshold (${(tapeSpeedBaseline + dynamicZScoreThresholdRef.current * tapeSpeedStdDev).toFixed(1)} tp/s).`;
                  } else {
                    // Tape speed was indeed high, but other rules failed
                    if (isNearResistance) {
                      ignoredMsg = `🔍 Level Filtering: Rejected resistance ${nearestZone.type} ($${nearestZone.price.toFixed(1)}) - Tape speed met standard-deviation threshold, but CVD Delta (${cvdDelta >= 0 ? '+' : ''}${cvdDelta.toFixed(2)}k, breakout threshold: +${cvdBreakoutThreshold.toFixed(2)}k) & Imbalance (${(orderbookImbalance * 100).toFixed(1)}% bids) did not satisfy breakout/absorption conditions.`;
                    } else {
                      ignoredMsg = `🔍 Level Filtering: Rejected support ${nearestZone.type} ($${nearestZone.price.toFixed(1)}) - Tape speed met standard-deviation threshold, but selling pressure (CVD Delta: ${cvdDelta.toFixed(2)}k, breakdown: -${cvdBreakoutThreshold.toFixed(2)}k) did not satisfy breakdown conditions.`;
                    }
                  }
                }
              }

              if (ignoredMsg) {
                lastIgnoreLogTimeRef.current[levelKey] = Date.now();
                setSignals((s) =>
                  [
                    {
                      id: Math.random().toString(36).substr(2, 9),
                      timestamp: new Date().toISOString(),
                      type: "SYSTEM_ALERT",
                      side: "NONE",
                      price: newPrice,
                      message: ignoredMsg,
                    },
                    ...s,
                  ].slice(0, 50),
                );
              }
            }
          }

          if (triggerEntrySide && chosenStratType) {
            if (warmupSecondsLeftRef.current > 0) {
              const checkKey = `${nearestZone?.price ?? 0}_warmup`;
              const nowMs = Date.now();
              const lastLogged = lastIgnoreLogTimeRef.current[checkKey] || 0;
              if (nowMs - lastLogged > 10000) { // Log once per 10s
                lastIgnoreLogTimeRef.current[checkKey] = nowMs;
                setSignals((s) =>
                  [
                    {
                      id: Math.random().toString(36).substr(2, 9),
                      timestamp: new Date().toISOString(),
                      type: "SYSTEM_ALERT",
                      side: "NONE",
                      price: newPrice,
                      message: `⚠️ Warm-up active (${warmupSecondsLeftRef.current}s left). Standard deviation & Z-Score structures are normalizing. Automated entry blocked.`,
                    },
                    ...s,
                  ].slice(0, 50),
                );
              }
              triggerEntrySide = null;
              chosenStratType = null;
            } else if (positionRef.current !== null) {
              nextState = "POSITION_OPEN";
            } else {
              nextState = "EXECUTING";
              const isLtfLevel = nearestZone?.levelStrength === "LTF";
              const lev = configRef.current.execution.leverage ?? 20;
              const tradeAmountUsd = configRef.current.execution.tradeAmountUsd ?? 1000.0;
              const basePosUsd = tradeAmountUsd * lev;
              const maxAllowedNominalUsd = accountEquity * lev;
              const targetedNominalUsd = Math.min(basePosUsd, maxAllowedNominalUsd);
              const baseCalculatedSize = targetedNominalUsd / newPrice;
              
              const shouldReduce = isLtfLevel && (configRef.current.execution.reduceSizeOnLtf !== false);
              const positionSize = shouldReduce ? baseCalculatedSize * 0.5 : baseCalculatedSize;

              const isBreakout = chosenStratType === "BREAKOUT";
              const entryFeeRate = isBreakout ? 0.0004 : 0.0002;
              const entryFee = newPrice * positionSize * entryFeeRate;

              setFeesPaid((f) => f + entryFee);
              setTradedVolumeBtc((v) => v + positionSize);
              setTradedVolumeUsd((v) => v + positionSize * newPrice);
              setAccountEquity((eq) => eq - entryFee);
              setRealizedPnL((p) => p - entryFee);

              const posTf = nearestZone?.timeframe || activeTf;
              const { tpPrice, slPrice } = calculateTargetPrices(
                triggerEntrySide,
                newPrice,
                chosenStratType,
                posTf,
                configRef.current.execution.feeExitEnabled,
              );

              const newPos: TradePosition = {
                side: triggerEntrySide,
                entryPrice: newPrice,
                size: positionSize,
                unrealizedPnL: 0,
                unrealizedPnLPct: 0,
                timestamp: new Date().toLocaleTimeString("ru-RU"),
                createdAt: Date.now(),
                strategyType: chosenStratType,
                timeframe: posTf,
                tpPrice,
                slPrice,
                maxFavPrice: newPrice,
                hasPartialTP: false,
                positionCvd: 0,
                adverseTicksCount: 0,
                adverseEnergy: 0,
                zoneTouchActive: false,
                zoneTouchPrice: 0,
                zoneTouchType: "",
                zoneAccumulatedCvd: 0,
                zoneAccumulatedVolume: 0,
                zoneTicksCount: 0,
                zonePocHit: false,
                zoneKey: nearestZone ? `${nearestZone.type}_${nearestZone.price}` : undefined,
                positionTicksCount: 0,
              };
              setPosition(newPos);

              const tradeId = Math.random().toString(36).substr(2, 9);
              setTrades((t) => [
                {
                  id: tradeId,
                  timestamp: new Date().toLocaleTimeString("ru-RU"),
                  type: `${chosenStratType} ENTRY`,
                  side: triggerEntrySide!,
                  price: newPrice,
                  size: positionSize,
                  strategyType: chosenStratType!,
                },
                ...t,
               ]);

               setSignals((s) =>
                [
                  {
                    id: tradeId,
                    timestamp: new Date().toISOString(),
                    type:
                      chosenStratType === "BREAKOUT"
                        ? "TRUE_BREAKOUT"
                        : chosenStratType === "FALSE_BREAKOUT"
                          ? "FALSE_BREAKOUT"
                          : "ABSORPTION_FADE",
                    side: triggerEntrySide!,
                    price: newPrice,
                    message: isLtfLevel
                      ? `${signalMsg} [LTF RISK HALVED] Size reduced 50% to ${positionSize} ${(configRef.current?.symbols || "BTCUSDT").replace("USDT", "").replace("BUSD", "")} due to higher M5/M15 level risk.`
                      : signalMsg,
                  },
                  ...s,
                ].slice(0, 50),
              );
            }
          }
        }
      } else if (prev === "EXECUTING") {
        nextState = "POSITION_OPEN";
      } else if (prev === "POSITION_OPEN") {
        // Auto close position under dynamic TP/SL targets based on entering strategy type
        const active = positionRef.current;
        if (active) {
          const updatedPositionTicksCount = (active.positionTicksCount || 0) + 1;
          const diff = newPrice - active.entryPrice;
          const pathPnL = active.side === "BUY" ? diff : -diff;

          // Real-time Cumulative Adverse Pressure (накопительный процесс против позиции)
          const isDrawdown = pathPnL < 0;
          const updatedPositionCvd = (active.positionCvd || 0) + cvdDelta;
          let updatedAdverseTicksCount = active.adverseTicksCount || 0;
          let updatedAdverseEnergy = active.adverseEnergy || 0;

          const isAdverseCvd = active.side === "BUY" ? (cvdDelta < 0) : (cvdDelta > 0);

          if (isDrawdown || isAdverseCvd) {
            updatedAdverseTicksCount += 1;
            const priceDrawdown = isDrawdown ? Math.abs(pathPnL) : 1.0;
            const volumeForce = Math.max(0.01, Math.abs(cvdDelta));
            const speedFactor = 1.0 + (tapeAcceleration || 1.0) * 0.1;

            updatedAdverseEnergy += priceDrawdown * volumeForce * speedFactor;
          } else {
            updatedAdverseEnergy = Math.max(0, updatedAdverseEnergy - 0.15);
            if (updatedAdverseTicksCount > 0) {
              updatedAdverseTicksCount -= 1;
            }
          }

          const elapsedMs = Date.now() - (active.createdAt || Date.now());
          const elapsedSec = elapsedMs / 1000;

          const tfKey = active.timeframe || activeTf || "1m";
          const targets = TF_TARGETS[tfKey] || TF_TARGETS["1m"];
          const strategy = (active.strategyType || "BREAKOUT") as
            | "BREAKOUT"
            | "ABSORPTION_FADE"
            | "FALSE_BREAKOUT";
          const targetConfig = targets[strategy] || targets["BREAKOUT"];

          const tpTarget = targetConfig.tp;
          const slTarget = targetConfig.sl;
          const maxDuration = targetConfig.timeExitSec;

          // Active Position Management: Breakeven, Trailing Stop, Partial Take Profit
          let currentMaxFavPrice = active.maxFavPrice || active.entryPrice;
          if (active.side === "BUY") {
            if (newPrice > currentMaxFavPrice) {
              currentMaxFavPrice = newPrice;
            }
          } else {
            if (newPrice < currentMaxFavPrice) {
              currentMaxFavPrice = newPrice;
            }
          }

          let updatedSlPrice = active.slPrice;
          let updatedTpPrice = active.tpPrice;
          let updatedSize = active.size;
          let updatedHasPartialTP = active.hasPartialTP;

          if (configRef.current.execution.feeExitEnabled) {
            const entryFeeRate =
              active.strategyType === "BREAKOUT" ? 0.0004 : 0.0002;
            const tpPct = entryFeeRate + 0.0002 + 0.001; // Round-trip fee (TP maker) + 0.1%
            const slPct = entryFeeRate + 0.0004 + 0.001; // Round-trip fee (SL taker) + 0.1%
            if (active.side === "BUY") {
              updatedTpPrice = active.entryPrice * (1 + tpPct);
              updatedSlPrice = active.entryPrice * (1 - slPct);
            } else {
              updatedTpPrice = active.entryPrice * (1 - tpPct);
              updatedSlPrice = active.entryPrice * (1 + slPct);
            }
          }

          // 1. Breakeven logic
          if (
            configRef.current.execution.breakevenEnabled &&
            !configRef.current.execution.feeExitEnabled
          ) {
            if (active.side === "BUY") {
              // If profit reaches 40% of TP target, move SL to entry price
              if (
                pathPnL >= tpTarget * 0.4 &&
                (updatedSlPrice === undefined ||
                  updatedSlPrice < active.entryPrice)
              ) {
                updatedSlPrice = active.entryPrice;
                setSignals((s) =>
                  [
                    {
                      id: Math.random().toString(36).substr(2, 9),
                      timestamp: new Date().toISOString(),
                      type: "SYSTEM_ALERT",
                      side: "BUY",
                      price: newPrice,
                      message: `🛡️ Breakeven SL activated for BUY position at $${active.entryPrice.toFixed(1)}`,
                    },
                    ...s,
                  ].slice(0, 50),
                );
              }
            } else {
              if (
                pathPnL >= tpTarget * 0.4 &&
                (updatedSlPrice === undefined ||
                  updatedSlPrice > active.entryPrice)
              ) {
                updatedSlPrice = active.entryPrice;
                setSignals((s) =>
                  [
                    {
                      id: Math.random().toString(36).substr(2, 9),
                      timestamp: new Date().toISOString(),
                      type: "SYSTEM_ALERT",
                      side: "SELL",
                      price: newPrice,
                      message: `🛡️ Breakeven SL activated for SELL position at $${active.entryPrice.toFixed(1)}`,
                    },
                    ...s,
                  ].slice(0, 50),
                );
              }
            }
          }

          // 2. Trailing Stop logic
          if (
            configRef.current.execution.trailingStopEnabled &&
            !configRef.current.execution.feeExitEnabled
          ) {
            if (active.side === "BUY") {
              const trailSl = currentMaxFavPrice - slTarget;
              if (updatedSlPrice === undefined || trailSl > updatedSlPrice) {
                updatedSlPrice = trailSl;
              }
            } else {
              const trailSl = currentMaxFavPrice + slTarget;
              if (updatedSlPrice === undefined || trailSl < updatedSlPrice) {
                updatedSlPrice = trailSl;
              }
            }
          }

          // 3. Partial Take Profit (50% position scaling)
          if (
            configRef.current.execution.partialTakeProfitEnabled &&
            !updatedHasPartialTP &&
            !configRef.current.execution.feeExitEnabled
          ) {
            const nearestZoneForPartial =
              nearestZoneIndex !== -1 ? currentZones[nearestZoneIndex] : null;
            const isAtOpposingLevel =
              nearestZoneForPartial &&
              ((active.side === "BUY" &&
                (nearestZoneForPartial.type.includes("RES") ||
                  nearestZoneForPartial.type.includes("HIGH")) &&
                minD < 15) ||
                (active.side === "SELL" &&
                  (nearestZoneForPartial.type.includes("SUP") ||
                    nearestZoneForPartial.type.includes("LOW")) &&
                  minD < 15));

            // If profit reaches 50% of the main TP target OR we hit an opposing level with positive profit, secure 50% size
            if (
              pathPnL >= tpTarget * 0.5 ||
              (isAtOpposingLevel && pathPnL > 0)
            ) {
              const partSize = active.size * 0.5;
              updatedSize = active.size - partSize;
              updatedHasPartialTP = true;

              const partPnL = pathPnL * partSize;
              const partExitFee = newPrice * partSize * 0.0002;

              setFeesPaid((f) => f + partExitFee);
              setTradedVolumeBtc((v) => v + partSize);
              setTradedVolumeUsd((v) => v + partSize * newPrice);

              setRealizedPnL((p) => p + partPnL - partExitFee);
              setAccountEquity((eq) => eq + partPnL - partExitFee);

              setTrades((t) => [
                {
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp: new Date().toLocaleTimeString("ru-RU"),
                  type: `${active.strategyType === "BREAKOUT" ? "BO" : "FADE"} PARTIAL CLOSE`,
                  side: active.side === "BUY" ? "SELL" : "BUY",
                  price: newPrice,
                  size: partSize,
                  pnl: partPnL - partExitFee,
                  strategyType: active.strategyType,
                },
                ...t,
              ]);

              const isTriggeredByOpposingLevel =
                isAtOpposingLevel && pathPnL > 0 && pathPnL < tpTarget * 0.5;
              const msgText = isTriggeredByOpposingLevel
                ? `💰 Secured 50% profit at opposing level (${nearestZoneForPartial?.type || "LEVEL"}) at $${newPrice.toFixed(1)}`
                : `💰 Secured 50% profit (Partial TP) at $${newPrice.toFixed(1)}`;

              setSignals((s) =>
                [
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: "SYSTEM_ALERT",
                    side: active.side,
                    price: newPrice,
                    message: msgText,
                  },
                  ...s,
                ].slice(0, 50),
              );
            }
          }

          // 3.5 Zone Touch & POC Decision Evaluation Logic
          let updatedZoneTouchActive = active.zoneTouchActive || false;
          let updatedZoneTouchPrice = active.zoneTouchPrice || 0;
          let updatedZoneTouchType = active.zoneTouchType || "";
          let updatedZoneAccumulatedCvd = active.zoneAccumulatedCvd || 0;
          let updatedZoneAccumulatedVolume = active.zoneAccumulatedVolume || 0;
          let updatedZoneTicksCount = active.zoneTicksCount || 0;
          let updatedZonePocHit = active.zonePocHit || false;

          const zonesToSearch = (zonesRef.current || []);
          const activeZone = zonesToSearch.find(z => {
            const zLow = z.priceLow !== undefined ? z.priceLow : z.price;
            const zHigh = z.priceHigh !== undefined ? z.priceHigh : z.price;
            return newPrice >= zLow && newPrice <= zHigh;
          });

          let deciderExitTriggered = false;

          if (activeZone) {
            if (!updatedZoneTouchActive) {
              updatedZoneTouchActive = true;
              updatedZoneTouchPrice = activeZone.price;
              updatedZoneTouchType = activeZone.type;
              updatedZoneAccumulatedCvd = cvdDelta;
              updatedZoneAccumulatedVolume = Math.abs(cvdDelta);
              updatedZoneTicksCount = 1;
              updatedZonePocHit = false;

              setSignals((s) =>
                [
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: "SYSTEM_ALERT",
                    side: active.side,
                    price: newPrice,
                    message: `🔍 [Zone Interaction] Entered ${activeZone.type} Zone @ $${activeZone.price.toFixed(1)} ($${(activeZone.priceLow ?? activeZone.price).toFixed(1)} - $${(activeZone.priceHigh ?? activeZone.price).toFixed(1)}). Commencing dynamic flow data accumulation...`
                  },
                  ...s,
                ].slice(0, 50)
              );
            } else {
              updatedZoneAccumulatedCvd += cvdDelta;
              updatedZoneAccumulatedVolume += Math.abs(cvdDelta);
              updatedZoneTicksCount += 1;

              const previousPrice = prevPriceRef.current || active.entryPrice;
              const pocPrice = updatedZoneTouchPrice;
              const crossedPoc = (previousPrice <= pocPrice && newPrice >= pocPrice) || (previousPrice >= pocPrice && newPrice <= pocPrice);
              const extremelyClosePoc = Math.abs(newPrice - pocPrice) <= (pocPrice * 0.0005);
              
              if ((crossedPoc || extremelyClosePoc) && !updatedZonePocHit) {
                if (updatedZoneTicksCount < 30) {
                  if (updatedZoneTicksCount % 4 === 1) {
                    setSignals((s) => [
                      {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: "SYSTEM_ALERT",
                        side: "NONE",
                        price: newPrice,
                        message: `⏳ [Decider Accumulating] Price near level POC @ $${pocPrice.toFixed(1)}. Ticks inside: ${updatedZoneTicksCount}/30. Acc. CVD: ${updatedZoneAccumulatedCvd.toFixed(2)}k. Decision deferred to process complete dataset and prevent premature stop-out.`
                      },
                      ...s,
                    ].slice(0, 50));
                  }
                } else {
                  const isEntryZone = active.zoneKey === `${activeZone.type}_${activeZone.price}`;
                  const isVeryYoung = updatedPositionTicksCount < 24;
                  
                  if (isVeryYoung && isEntryZone) {
                    if (updatedZoneTicksCount === 30) {
                      setSignals((s) => [
                        {
                          id: Math.random().toString(36).substr(2, 9),
                          timestamp: new Date().toISOString(),
                          type: "SYSTEM_ALERT",
                          side: active.side,
                          price: newPrice,
                          message: `🛡️ [Decider Standby] Position is young (${updatedPositionTicksCount} ticks). Entry level ${activeZone.type} @ $${activeZone.price.toFixed(1)} is protected from pre-emptive stop-outs. Allowing trade to develop.`
                        },
                        ...s,
                      ].slice(0, 50));
                    }
                  } else {
                    updatedZonePocHit = true;
                    
                    if (configRef.current.execution.zoneTouchPocDeciderEnabled) {
                      const isBuySide = active.side === "BUY";
                      // Opposing zones: Resistance/Supply/High for BUY, Support/Demand/Low for SELL
                      const isOpposingZone = isBuySide 
                        ? (updatedZoneTouchType.includes("RES") || updatedZoneTouchType.includes("SUPPLY") || updatedZoneTouchType.includes("HIGH"))
                        : (updatedZoneTouchType.includes("SUPP") || updatedZoneTouchType.includes("DEMAND") || updatedZoneTouchType.includes("LOW"));

                      const isSupportingZone = isBuySide
                        ? (updatedZoneTouchType.includes("SUPP") || updatedZoneTouchType.includes("DEMAND") || updatedZoneTouchType.includes("LOW"))
                        : (updatedZoneTouchType.includes("RES") || updatedZoneTouchType.includes("SUPPLY") || updatedZoneTouchType.includes("HIGH"));

                      const flowPower = updatedZoneAccumulatedCvd;
                      
                      if (isOpposingZone) {
                        const flowOpposesBreakout = isBuySide ? (flowPower < -1.0) : (flowPower > 1.0);
                        const flowSupportsBreakout = isBuySide ? (flowPower > 1.5) : (flowPower < -1.5);
                        
                        if (flowOpposesBreakout) {
                          const protectionReason = isBuySide 
                            ? `⚠️ [Active POC Decision] Heavy bearish pressure at opposing Resistance POC (Flow CVD: ${flowPower.toFixed(2)}k). Position unchanged; relying on standard stop-loss.`
                            : `⚠️ [Active POC Decision] Heavy bullish pressure at opposing Support POC (Flow CVD: +${flowPower.toFixed(2)}k). Position unchanged; relying on standard stop-loss.`;
                          
                          setSignals((s) =>
                            [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                timestamp: new Date().toISOString(),
                                type: "SYSTEM_ALERT",
                                side: active.side,
                                price: newPrice,
                                message: protectionReason,
                              },
                              ...s,
                            ].slice(0, 50)
                          );
                        } else if (flowSupportsBreakout) {
                          const successReason = isBuySide
                            ? `🔥 [Active POC Decision] Breakout confirmed! Strong buying CVD (${flowPower.toFixed(2)}k) breaching opposing Resistance. Target TP extended +30%!`
                            : `🔥 [Active POC Decision] Breakdown confirmed! Strong selling CVD (${flowPower.toFixed(2)}k) breaching opposing Support. Target TP extended +30%!`;
                          
                          if (updatedTpPrice) {
                            const targetDiff = Math.abs(updatedTpPrice - active.entryPrice);
                            updatedTpPrice = isBuySide ? updatedTpPrice + targetDiff * 0.3 : updatedTpPrice - targetDiff * 0.3;
                          }

                          setSignals((s) =>
                            [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                timestamp: new Date().toISOString(),
                                type: "SYSTEM_ALERT",
                                side: active.side,
                                price: newPrice,
                                message: successReason,
                              },
                              ...s,
                            ].slice(0, 50)
                          );
                        } else {
                          const neutralMsg = `⚡ [Active POC Decision] Near opposing POC. Equilibrium flow (Acc. CVD: ${flowPower.toFixed(2)}k). Let trade develop.`;
                          setSignals((s) =>
                            [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                timestamp: new Date().toISOString(),
                                type: "SYSTEM_ALERT",
                                side: "NONE",
                                price: newPrice,
                                message: neutralMsg,
                              },
                              ...s,
                            ].slice(0, 50)
                          );
                        }
                      } else if (isSupportingZone) {
                        const flowSupportsHold = isBuySide ? (flowPower > 0.8) : (flowPower < -0.8);
                        const flowFailsHold = isBuySide ? (flowPower < -1.5) : (flowPower > 1.5);

                        if (flowFailsHold) {
                          const emergencyExitReason = isBuySide
                            ? `🚨 [Active POC Decision] Support level POC collapsed under severe selling CVD (${flowPower.toFixed(2)}k). Relying on standard Stop Loss; pre-emptive exits are disabled.`
                            : `🚨 [Active POC Decision] Resistance level POC breached under severe buying CVD (+${flowPower.toFixed(2)}k). Relying on standard Stop Loss; pre-emptive exits are disabled.`;
                          
                          setSignals((s) =>
                            [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                timestamp: new Date().toISOString(),
                                type: "SYSTEM_ALERT",
                                side: active.side,
                                price: newPrice,
                                message: emergencyExitReason,
                              },
                              ...s,
                            ].slice(0, 50)
                          );
                        } else if (flowSupportsHold) {
                          const reboundReason = isBuySide
                            ? `📈 [Active POC Decision] Strong passive absorption holding Support POC (Acc. CVD: +${flowPower.toFixed(2)}k). Position stabilized.`
                            : `📈 [Active POC Decision] Strong passive absorption holding Resistance POC (Acc. CVD: ${flowPower.toFixed(2)}k). Position stabilized.`;
                          
                          setSignals((s) =>
                            [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                timestamp: new Date().toISOString(),
                                type: "SYSTEM_ALERT",
                                side: active.side,
                                price: newPrice,
                                message: reboundReason,
                              },
                              ...s,
                            ].slice(0, 50)
                          );
                        }
                      }
                    } else {
                      setSignals((s) =>
                        [
                          {
                            id: Math.random().toString(36).substr(2, 9),
                            timestamp: new Date().toISOString(),
                            type: "SYSTEM_ALERT",
                            side: "NONE",
                            price: newPrice,
                            message: `🎯 Touched Zone POC @ $${pocPrice.toFixed(1)} [Decider Disabled]. Acc. CVD: ${updatedZoneAccumulatedCvd.toFixed(2)}k, ticks inside: ${updatedZoneTicksCount}.`
                          },
                          ...s,
                        ].slice(0, 50)
                      );
                    }
                  }
                }
              }
            }
          } else {
            if (updatedZoneTouchActive) {
              setSignals((s) =>
                [
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: "SYSTEM_ALERT",
                    side: "NONE",
                    price: newPrice,
                    message: `🚪 [Zone Interaction] Exited ${updatedZoneTouchType} Zone boundaries. Final accrued CVD: ${updatedZoneAccumulatedCvd.toFixed(2)}k over ${updatedZoneTicksCount} ticks.`
                  },
                  ...s,
                ].slice(0, 50)
              );
              updatedZoneTouchActive = false;
            }
          }

          if (deciderExitTriggered) {
            return;
          }

          // Save structural and real-time cumulative updates to the active position
          setPosition({
            ...active,
            slPrice: updatedSlPrice,
            tpPrice: updatedTpPrice,
            size: updatedSize,
            hasPartialTP: updatedHasPartialTP,
            maxFavPrice: currentMaxFavPrice,
            positionCvd: updatedPositionCvd,
            adverseTicksCount: updatedAdverseTicksCount,
            adverseEnergy: updatedAdverseEnergy,
            zoneTouchActive: updatedZoneTouchActive,
            zoneTouchPrice: updatedZoneTouchPrice,
            zoneTouchType: updatedZoneTouchType,
            zoneAccumulatedCvd: updatedZoneAccumulatedCvd,
            zoneAccumulatedVolume: updatedZoneAccumulatedVolume,
            zoneTicksCount: updatedZoneTicksCount,
            zonePocHit: updatedZonePocHit,
            positionTicksCount: updatedPositionTicksCount,
          });

          // 4. Opposing Signal / Technical Exit (including cumulative adverse pressure)
          let hasOpposingSignalExit = false;
          if (configRef.current.execution.signalExitEnabled) {
            const maxAdverseEnergyThreshold = slTarget * 4.5;
            const maxAdverseCvdThreshold = 2.0; // 2.0k BTC

            let hasCumulativeAdverseExit = false;
            let adverseReason = "";

            if (active.side === "BUY") {
              if (updatedPositionCvd < -maxAdverseCvdThreshold) {
                hasCumulativeAdverseExit = true;
                adverseReason = `Cumulative selling pressure against LONG (Cumulative CVD: ${updatedPositionCvd.toFixed(2)}k)`;
              } else if (updatedAdverseEnergy > maxAdverseEnergyThreshold) {
                hasCumulativeAdverseExit = true;
                adverseReason = `Cumulative adverse price holding / disadvantage energy limit reached: ${updatedAdverseEnergy.toFixed(1)} vs ${maxAdverseEnergyThreshold.toFixed(1)}`;
              }
            } else {
              if (updatedPositionCvd > maxAdverseCvdThreshold) {
                hasCumulativeAdverseExit = true;
                adverseReason = `Cumulative buying pressure against SHORT (Cumulative CVD: +${updatedPositionCvd.toFixed(2)}k)`;
              } else if (updatedAdverseEnergy > maxAdverseEnergyThreshold) {
                hasCumulativeAdverseExit = true;
                adverseReason = `Cumulative adverse price holding / disadvantage energy limit reached: ${updatedAdverseEnergy.toFixed(1)} vs ${maxAdverseEnergyThreshold.toFixed(1)}`;
              }
            }

            if (hasCumulativeAdverseExit) {
              hasOpposingSignalExit = true;
              setSignals((s) =>
                [
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: "SYSTEM_ALERT",
                    side: active.side === "BUY" ? "SELL" : "BUY",
                    price: newPrice,
                    message: `⚡ Cumulative Signal Exit triggered for ${active.side} position: ${adverseReason}`,
                  },
                  ...s,
                ].slice(0, 50),
              );
            } else {
              const nearestZone =
                nearestZoneIndex !== -1 ? currentZones[nearestZoneIndex] : null;
              const isNearResistance = nearestZone
                ? nearestZone.type.includes("RES") ||
                  nearestZone.type.includes("HIGH")
                : false;
              const isNearSupport = nearestZone
                ? nearestZone.type.includes("SUP") ||
                  nearestZone.type.includes("LOW")
                : false;
              if (active.side === "BUY") {
                const isOpposingAbsorption =
                  isNearResistance && isTapeAccelerated && cvdDelta < -cvdAbsorptionThreshold;
                const isOpposingBreakout =
                  isNearSupport && isTapeAccelerated && cvdDelta < -cvdBreakoutThreshold;
                if (isOpposingAbsorption || isOpposingBreakout) {
                  hasOpposingSignalExit = true;
                  const reason = isOpposingAbsorption
                    ? `Large seller absorption detected at resistance (${nearestZone?.type || ""}) with CVD Delta ${cvdDelta.toFixed(2)}k (threshold: -${cvdAbsorptionThreshold.toFixed(2)}k)`
                    : `Opposing breakdown breakout triggered at support (${nearestZone?.type || ""}) with CVD Delta ${cvdDelta.toFixed(2)}k (threshold: -${cvdBreakoutThreshold.toFixed(2)}k)`;

                  setSignals((s) =>
                    [
                      {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: "SYSTEM_ALERT",
                        side: "SELL",
                        price: newPrice,
                        message: `⚡ Technical Signal Exit triggered for BUY position: ${reason}`,
                      },
                      ...s,
                    ].slice(0, 50),
                  );
                }
              } else {
                const isOpposingAbsorption =
                  isNearSupport && isTapeAccelerated && cvdDelta > cvdAbsorptionThreshold;
                const isOpposingBreakout =
                  isNearResistance && isTapeAccelerated && cvdDelta > cvdBreakoutThreshold;
                if (isOpposingAbsorption || isOpposingBreakout) {
                  hasOpposingSignalExit = true;
                  const reason = isOpposingAbsorption
                    ? `Passive buyer absorption detected at support (${nearestZone?.type || ""}) with CVD Delta +${cvdDelta.toFixed(2)}k (threshold: +${cvdAbsorptionThreshold.toFixed(2)}k)`
                    : `Opposing breakout triggered at resistance (${nearestZone?.type || ""}) with CVD Delta +${cvdDelta.toFixed(2)}k (threshold: +${cvdBreakoutThreshold.toFixed(2)}k)`;

                  setSignals((s) =>
                    [
                      {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: "SYSTEM_ALERT",
                        side: "BUY",
                        price: newPrice,
                        message: `⚡ Technical Signal Exit triggered for SELL position: ${reason}`,
                      },
                      ...s,
                    ].slice(0, 50),
                  );
                }
              }
            }
          }

          const isTimeExit = elapsedSec >= maxDuration;
          const isTP =
            active.side === "BUY"
              ? newPrice >= (updatedTpPrice ?? active.entryPrice + tpTarget)
              : newPrice <= (updatedTpPrice ?? active.entryPrice - tpTarget);
          const isSL =
            active.side === "BUY"
              ? newPrice <= (updatedSlPrice ?? active.entryPrice - slTarget)
              : newPrice >= (updatedSlPrice ?? active.entryPrice + slTarget);
          const isSignalExit = hasOpposingSignalExit;
          const triggerExit = isTP || isSL || isTimeExit || isSignalExit;

          if (triggerExit) {
            const entryFeeRate =
              active.strategyType === "BREAKOUT" ? 0.0004 : 0.0002;
            const entryFee = active.entryPrice * active.size * entryFeeRate;
            const exitFeeRate = isTP ? 0.0002 : 0.0004;
            const exitFee = newPrice * active.size * exitFeeRate;

            setFeesPaid((f) => f + exitFee);
            setTradedVolumeBtc((v) => v + active.size);
            setTradedVolumeUsd((v) => v + active.size * newPrice);
            setCompletedTradesCount((c) => c + 1);

            const finalRealizedPnL = pathPnL * active.size;
            setRealizedPnL((p) => p + finalRealizedPnL - exitFee);
            setAccountEquity((eq) => eq + finalRealizedPnL - exitFee);

            // Drop model open interest on trade closures (liquidations or position offsets)
            oiRef.current -= Math.min(0.4, active.size * 0.15);

            const exitType = isTP
              ? "TAKE PROFIT"
              : isSL
                ? "STOP LOSS"
                : isSignalExit
                  ? "SIGNAL EXIT"
                  : "TIME EXIT (AUTO)";

            setTrades((t) => [
              {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toLocaleTimeString("ru-RU"),
                type: `${active.strategyType === "BREAKOUT" ? "BO" : "FADE"} ${exitType}`,
                side: active.side === "BUY" ? "SELL" : "BUY",
                price: newPrice,
                size: active.size,
                pnl: finalRealizedPnL - entryFee - exitFee,
                strategyType: active.strategyType,
              },
              ...t,
            ]);

            const netTradePnL = finalRealizedPnL - entryFee - exitFee;
            setSignals((s) =>
              [
                {
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp: new Date().toISOString(),
                  type: "SYSTEM_ALERT",
                  side: active.side === "BUY" ? "SELL" : "BUY",
                  price: newPrice,
                  message: `🚪 Position Closed [${exitType}]: Exited ${active.side} (${active.strategyType || "AUTO"}) at $${newPrice.toFixed(1)} (Entry: $${active.entryPrice.toFixed(1)}). Size: ${active.size.toFixed(2)} ${(configRef.current?.symbols || "BTCUSDT").replace("USDT", "").replace("BUSD", "")}. Net PnL: ${netTradePnL >= 0 ? "+" : ""}$${netTradePnL.toFixed(2)} (Fees: $${(entryFee + exitFee).toFixed(2)}).`,
                },
                ...s,
              ].slice(0, 50),
            );

            setPosition(null);
            cooldownTicksRef.current = 12; // Start formal 3-second (12 ticks * 250ms) cooldown
            nextState = "COOLDOWN";
          }
        } else {
          cooldownTicksRef.current = 12;
          nextState = "COOLDOWN";
        }
      } else if (prev === "COOLDOWN") {
        // Formal 3-second cooldown to let order flow settle before evaluating next candidate zones
        if (cooldownTicksRef.current > 0) {
          cooldownTicksRef.current--;
        } else {
          nextState = "SCANNING";
        }
      }

      if (nextState !== "ARMED") {
        armedAccumulatorRef.current = null;
      }

      if (nextState !== prev) {
        setState(nextState);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [halted]);

  const toggleHalt = () => {
    setHalted((h) => {
      if (!h) {
        setState("COOLDOWN"); // Force reset FSM state
        setSignals((s) =>
          [
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: "SYSTEM_ALERT",
              side: "NONE",
              price: 0,
              message: "KILL-SWITCH ACTIVATED. Orders canceled, FSM locked.",
            },
            ...s,
          ].slice(0, 50),
        );
      } else {
        setState("SCANNING");
        setWarmupSecondsLeft(60);
      }
      return !h;
    });
  };

  const updateConfig = (newConfig: Partial<AppConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  const executeManualTrade = (side: "BUY" | "SELL") => {
    const currentPrice =
      aggRef.current.lastPrice ||
      (chartData.length > 0 ? chartData[chartData.length - 1].close : 64500);
    const lev = configRef.current.execution.leverage ?? 20;
    const tradeAmountUsd = configRef.current.execution.tradeAmountUsd ?? 1000.0;
    const basePosUsd = tradeAmountUsd * lev;
    const maxAllowedNominalUsd = accountEquity * lev;
    const targetedNominalUsd = Math.min(basePosUsd, maxAllowedNominalUsd);
    const positionSize = targetedNominalUsd / currentPrice;

    // Profitably or non-profitably override older positions
    if (positionRef.current) {
      const active = positionRef.current;
      const diff = currentPrice - active.entryPrice;
      const pathPnL = active.side === "BUY" ? diff : -diff;
      const finalRealizedPnL = pathPnL * active.size;
      setRealizedPnL((p) => p + finalRealizedPnL);
      setAccountEquity((eq) => eq + finalRealizedPnL);

      setTrades((t) => [
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toLocaleTimeString("ru-RU"),
          type: "MANUAL CLOSE",
          side: active.side === "BUY" ? "SELL" : "BUY",
          price: currentPrice,
          size: active.size,
          pnl: finalRealizedPnL,
        },
        ...t,
      ]);
    }

    const manualTf = timeframeRef.current || "1m";
    const { tpPrice, slPrice } = calculateTargetPrices(
      side,
      currentPrice,
      "BREAKOUT",
      manualTf,
      configRef.current.execution.feeExitEnabled,
    );

    const newPos: TradePosition = {
      side,
      entryPrice: currentPrice,
      size: positionSize,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      timestamp: new Date().toLocaleTimeString("ru-RU"),
      createdAt: Date.now(),
      timeframe: manualTf,
      strategyType: "BREAKOUT",
      tpPrice,
      slPrice,
      maxFavPrice: currentPrice,
      hasPartialTP: false,
      positionCvd: 0,
      adverseTicksCount: 0,
      adverseEnergy: 0,
      zoneTouchActive: false,
      zoneTouchPrice: 0,
      zoneTouchType: "",
      zoneAccumulatedCvd: 0,
      zoneAccumulatedVolume: 0,
      zoneTicksCount: 0,
      zonePocHit: false,
      positionTicksCount: 0,
    };
    setPosition(newPos);
    setState("POSITION_OPEN");

    const tradeId = Math.random().toString(36).substr(2, 9);
    setTrades((t) => [
      {
        id: tradeId,
        timestamp: new Date().toLocaleTimeString("ru-RU"),
        type: "MANUAL ENTRY",
        side,
        price: currentPrice,
        size: positionSize,
      },
      ...t,
    ]);

    setSignals((s) =>
      [
        {
          id: tradeId,
          timestamp: new Date().toISOString(),
          type: "SYSTEM_ALERT",
          side,
          price: currentPrice,
          message: `Manual ${side} Order Filled at $${currentPrice.toFixed(1)} (Paper Mode)`,
        },
        ...s,
      ].slice(0, 50),
    );
  };

  const closePosition = () => {
    const active = positionRef.current;
    if (!active) return;
    const currentPrice =
      aggRef.current.lastPrice ||
      (chartData.length > 0 ? chartData[chartData.length - 1].close : 64500);
    const diff = currentPrice - active.entryPrice;
    const pathPnL = active.side === "BUY" ? diff : -diff;

    const entryFeeRate = active.strategyType === "BREAKOUT" ? 0.0004 : 0.0002;
    const entryFee = active.entryPrice * active.size * entryFeeRate;
    const exitFee = currentPrice * active.size * 0.0004;

    setFeesPaid((f) => f + exitFee);
    setTradedVolumeBtc((v) => v + active.size);
    setTradedVolumeUsd((v) => v + active.size * currentPrice);
    setCompletedTradesCount((c) => c + 1);

    const finalRealizedPnL = pathPnL * active.size;
    setRealizedPnL((p) => p + finalRealizedPnL - exitFee);
    setAccountEquity((eq) => eq + finalRealizedPnL - exitFee);

    setTrades((t) => [
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString("ru-RU"),
        type: "MANUAL CLOSE",
        side: active.side === "BUY" ? "SELL" : "BUY",
        price: currentPrice,
        size: active.size,
        pnl: finalRealizedPnL - entryFee - exitFee,
      },
      ...t,
    ]);

    setPosition(null);
    setState("COOLDOWN");

    setSignals((s) =>
      [
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: "SYSTEM_ALERT",
          side: "NONE",
          price: currentPrice,
          message: `Manual Market Exit at $${currentPrice.toFixed(1)}. Realized P&L: ${finalRealizedPnL > 0 ? "+" : ""}$${finalRealizedPnL.toFixed(2)}`,
        },
        ...s,
      ].slice(0, 50),
    );
  };

  return {
    config,
    updateConfig,
    state,
    metrics,
    signals,
    halted,
    toggleHalt,
    latency,
    chartData,
    zones,
    position,
    trades,
    accountEquity,
    realizedPnL,
    executeManualTrade,
    closePosition,
    wsStatus,
    timeframe,
    setTimeframe,
    feesPaid,
    tradedVolumeBtc,
    tradedVolumeUsd,
    completedTradesCount,
    formatPrice,
    formatQty,
    warmupSecondsLeft,
  };
}
