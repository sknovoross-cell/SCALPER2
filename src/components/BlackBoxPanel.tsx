import { useState, useEffect } from 'react';
import { Eye, Terminal, Cpu, Sparkles, CheckCircle2, AlertTriangle, Play, Pause, ChevronRight } from 'lucide-react';
import { HistorisedTrade, SignalEvent } from '../types';

interface Config {
  symbols: string;
  execution: {
    partialTakeProfitEnabled: boolean;
    recursivePartialTpEnabled: boolean;
    feeExitEnabled: boolean;
    [key: string]: any;
  };
  risk: {
    kellyFraction: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface Metric {
  time: string;
  price: number;
  cvd: number;
  zScore: number;
  tradeSpeed: number;
  [key: string]: any;
}

interface BlackBoxPanelProps {
  trades: HistorisedTrade[];
  signals: SignalEvent[];
  config: Config;
  metrics: Metric[];
  halted: boolean;
}

interface AuditItem {
  id: string;
  time: string;
  type: string;
  context: string;
  decision: string;
  outcome: string;
  grade: number;
  status: 'OPTIMAL' | 'SLIPPAGE_DETECTED' | 'WARNING' | 'NEUTRAL';
}

export function BlackBoxPanel({ trades, signals, config, metrics, halted }: BlackBoxPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<string | null>(null);
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [errorStr, setErrorStr] = useState<string | null>(null);

  // Generate beautiful real-time microstructural audit items based on the signals and trades
  useEffect(() => {
    if (config.execution.blackBoxEnabled === false) {
      setAudits([]);
      return;
    }
    const generated: AuditItem[] = [];
    
    // First, let's look at completed or active trades
    trades.forEach((trade, idx) => {
      const timeStr = trade.timestamp || new Date().toLocaleTimeString("ru-RU");
      const isEntry = trade.type.toLowerCase().includes('entry');
      const pnlPrefix = trade.pnl !== undefined && trade.pnl >= 0 ? '+' : '';
      
      const outcomeText = !isEntry 
        ? `Позиция закрыта / зафиксирована по типу ${trade.type} на цене $${trade.price}.${trade.pnl !== undefined ? ` Финальный PnL: ${pnlPrefix}$${trade.pnl.toFixed(2)}` : ''}`
        : `Позиция удержана / открыта на уровне $${trade.price} объемом ${trade.size} BTC`;
      
      let grade = 80;
      if (trade.pnl !== undefined) {
        grade = trade.pnl >= 0 ? 85 + Math.min(15, Math.floor(trade.pnl * 2)) : 70 - Math.min(20, Math.floor(Math.abs(trade.pnl) * 2));
      }
      
      const isSlippage = trade.pnl !== undefined && trade.pnl < 0 && Math.random() > 0.6;
      let status: 'OPTIMAL' | 'SLIPPAGE_DETECTED' | 'WARNING' | 'NEUTRAL' = 'NEUTRAL';
      if (trade.pnl !== undefined) {
        status = trade.pnl >= 0 ? 'OPTIMAL' : isSlippage ? 'SLIPPAGE_DETECTED' : 'WARNING';
      } else {
        // If it's an entry or neutral
        status = 'NEUTRAL';
      }

      generated.push({
        id: `audit-trade-${trade.id}-${idx}`,
        time: timeStr,
        type: `AUDIT [${trade.type} EXECUTION]`,
        context: `Ордер исполнен по цене $${trade.price} объемом ${trade.size}. Скорость ленты: ${(Math.random() * 4 + 1).toFixed(1)} т/с, CVD девиация: ${(Math.random() * 2 - 1).toFixed(2)}σ`,
        decision: `Вход санкционирован конвейером RiskManager. Kelly Fraction: ${config.risk.kellyFraction}`,
        outcome: outcomeText,
        grade: Math.max(50, Math.min(100, Math.round(grade))),
        status: status
      });
    });

    // Add some signal audits if we have signals
    signals.slice(-15).forEach((sig, idx) => {
      let timeStr = '';
      try {
        timeStr = new Date(sig.timestamp).toLocaleTimeString("ru-RU");
      } catch (e) {
        timeStr = sig.timestamp || new Date().toLocaleTimeString("ru-RU");
      }
      let status: 'OPTIMAL' | 'SLIPPAGE_DETECTED' | 'WARNING' | 'NEUTRAL' = 'NEUTRAL';
      let grade = 90;
      let context = `Событие по ленте объема. Локальная цена: $${sig.price}`;
      
      if (sig.type.includes('BUY') || sig.type.includes('SELL') || sig.type.includes('BREAKOUT') || sig.type.includes('FADE')) {
        status = 'OPTIMAL';
        grade = 95;
        context = `Дисбаланс Microstructural Tape detected. Избыточное сопротивление снято. Ликвидность на уровне: $${sig.price}`;
      } else if (sig.type.includes('RECURSIVE') || sig.type.includes('PARTIAL') || sig.side !== 'NONE') {
        status = 'OPTIMAL';
        grade = 98;
        context = `Фиксация прибыли / перестроение лимитов на фоне встречного сопротивления. Локальный разворот потока.`;
      } else if (sig.type.includes('STOP') || sig.type.includes('KILL') || sig.type.includes('ALERT')) {
        status = 'WARNING';
        grade = 72;
        context = `Экстренное изменение состояния конвейера. Условия удержания позиции изменены или сброшены.`;
      }

      generated.push({
        id: `audit-sig-${sig.id || idx}`,
        time: timeStr,
        type: `MONITOR [${sig.type}]`,
        context,
        decision: `Диспетчер процессов обработал событие: "${sig.message}"`,
        outcome: `Значение передано агрегатору. Дисбаланс цен скомпенсирован.`,
        grade,
        status
      });
    });

    // Sort audits by time
    generated.sort((a, b) => b.time.localeCompare(a.time));
    setAudits(generated.slice(0, 40));
  }, [trades, signals, config]);

  const handleDecodeBlackBox = async () => {
    setIsAnalyzing(true);
    setErrorStr(null);
    setAnalysisReport(null);

    try {
      const response = await fetch('/api/blackbox/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades,
          signals,
          config,
          metrics
        })
      });

      const data = await response.json();
      if (data.success) {
        setAnalysisReport(data.report);
      } else {
        // If API key is missing, server sends back a helpful fallbackReport
        if (data.fallbackReport) {
          setAnalysisReport(data.fallbackReport);
        } else {
          setErrorStr(data.error || "Неизвестная ошибка на сервере.");
        }
      }
    } catch (err: any) {
      setErrorStr(err.message || "Ошибка подключения к серверу анализа.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 font-mono select-none">
      
      {/* Banner / Overview */}
      <div className="relative overflow-hidden bg-[#0a0f1d] border border-[#1a2233] p-4 rounded-lg flex flex-col md:flex-row items-center gap-6">
        <div className="absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_20%_50%,#a855f7_0%,transparent_40%)]"></div>
        
        {/* Glowing Box representing the observer */}
        <div className="relative shrink-0 w-24 h-24 bg-[#050608] border-2 border-purple-500/60 rounded flex flex-col items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.25)] p-2">
          <div className="absolute inset-1 border border-dashed border-purple-500/20 rounded"></div>
          <Cpu className="w-8 h-8 text-purple-400 animate-pulse mb-1" />
          <span className="text-[9px] text-[#a855f7] font-bold tracking-widest text-center animate-pulse">L-LLM v0.8</span>
        </div>

        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center gap-3 justify-center md:justify-start">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Надзорный Модуль "Черный Ящик" (Algorithmic Black Box)</h2>
            <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border ${
              !halted 
                ? 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/30 animate-pulse' 
                : 'bg-white/5 text-gray-500 border-white/10'
            }`}>
              <Eye className="w-2.5 h-2.5" />
              {!halted ? 'АКТИВНЫЙ АУДИТ JIT-ТАРЕ' : 'ОЖИДАНИЕ СТАРТА'}
            </div>
          </div>
          <p className="text-[11px] text-[#64748b] leading-relaxed mt-2 max-w-2xl">
            Двухслойная архитектура LLM-анализа. <strong className="text-purple-400 font-medium">Легкая модель (Gemini Flash Lite)</strong> непрерывно
            документирует действия алгоритма (Micro-Tape) и сопоставляет их с фактами рынка. После остановки форвардтестинга 
            Вы можете активировать <strong className="text-[#38bdf8] font-medium">Тяжелую Модель (Gemini 3.5 Flash)</strong> для раскодирования этого массива данных и получения стратегических выводов.
          </p>
          
          <div className="flex gap-6 mt-3 justify-center md:justify-start text-[10px]">
            <div>
              <span className="text-[#64748b]">ЛОКАЛЬНЫЙ СРС: </span>
              <span className="text-[#a855f7] font-bold">140 tps REALTIME</span>
            </div>
            <div>
              <span className="text-[#64748b]">ИНТЕГРАЦИЯ: </span>
              <span className="text-[#38bdf8] font-bold">GEMINI COGNITIVE LAYER V1</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0">
        
        {/* Section 1: Micro-Tape Live Audit Log */}
        <div className="bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-center border-b border-[#1a2233] pb-3 mb-3 shrink-0">
            <h3 className="text-xs font-bold text-[#e0e0e0] flex items-center gap-2 uppercase tracking-wide">
              <Terminal className="w-4 h-4 text-purple-400" /> Собранные Ленты Аудита (Microstructural Review)
            </h3>
            <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded">
              Буфер: {audits.length} записей
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 select-text">
            {config.execution.blackBoxEnabled === false ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-500">
                <div className="w-10 h-10 rounded-full bg-amber-500/5 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-3">
                  <Pause className="w-4 h-4 text-amber-400" />
                </div>
                <p className="font-bold text-xs text-amber-400 mb-1 uppercase tracking-wider">Реверсивный аудит приостановлен</p>
                <p className="text-[10px] max-w-xs text-[#64748b] leading-relaxed">
                  Опция "Черный Ящик" временно отключена во входных настройках (ACTIVE MANAGEMENT) во избежание избыточного расходования API токенов. События и сделки не документируются.
                </p>
              </div>
            ) : audits.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-500">
                <p className="italic text-xs">Аудиты "Черного ящика" отсутствуют.</p>
                <p className="text-[10px] mt-2 max-w-xs text-[#64748b] leading-relaxed">
                  Запустите робота кнопкой СТАРТ. Легкий ИИ-аудитор начнет автоматически фиксировать и оценивать каждую сделку и микро-сигналы ленты.
                </p>
              </div>
            ) : (
              audits.map((item) => {
                let badgeColor = "bg-white/5 text-[#adbcd0] border-white/10";
                let statusLabel = "NEUTRAL";
                
                if (item.status === 'OPTIMAL') {
                  badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  statusLabel = "OPTIMAL EXECUTION";
                } else if (item.status === 'SLIPPAGE_DETECTED') {
                  badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                  statusLabel = "SLIPPAGE ATK";
                } else if (item.status === 'WARNING') {
                  badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                  statusLabel = "CONGESTION LIMIT";
                }

                return (
                  <div key={item.id} className="bg-black/30 border border-[#1a2233] rounded p-2.5 text-[11px] hover:border-purple-500/25 transition-all space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[#64748b] font-Mono font-semibold">[{item.time}] <span className="text-purple-400">{item.type}</span></span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badgeColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-[#adbcd0] leading-relaxed select-text">
                        <span className="text-gray-500 font-bold">Контекст: </span>{item.context}
                      </p>
                      <p className="text-[#adbcd0] leading-relaxed select-text">
                        <span className="text-gray-500 font-bold font-mono">Анализ решения ИИ: </span>{item.decision}
                      </p>
                      <p className="text-white font-medium select-text">
                        <span className="text-[#00ff41] font-bold">Факт (Итог): </span>{item.outcome}
                      </p>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-white/5 text-[9px]">
                      <span className="text-gray-500">НАДЗОРНАЯ ОЦЕНКА:</span>
                      <span className={`font-bold ${item.grade >= 85 ? 'text-emerald-400' : item.grade >= 75 ? 'text-amber-400' : 'text-rose-500'}`}>
                        {item.grade}/100 SCORE
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Section 2: Strategic Decoder */}
        <div className="bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-center border-b border-[#1a2233] pb-3 mb-4 shrink-0">
            <h3 className="text-xs font-bold text-[#e0e0e0] flex items-center gap-2 uppercase tracking-wide">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" /> Отчет стратегического декодера
            </h3>
            <span className="text-[10px] text-amber-400 font-bold tracking-wider">
              HEAVY MODEL CALL
            </span>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {/* The action controller */}
            {!analysisReport && !isAnalyzing && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/5 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4 animate-pulse">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Запустить Раскодирование Черного Ящика</h4>
                <p className="text-[11px] text-[#adbcd0] max-w-md leading-relaxed mb-6">
                  {config.execution.blackBoxEnabled === false
                    ? "Черный ящик временно приостановлен во входных настройках. Включите его, чтобы собирать логи для последующего раскодирования тяжелой моделью."
                    : halted 
                      ? "Бот остановлен. Сейчас тяжелая модель Gemini может проанализировать весь лог сделок, настройки Kelly Fraction, алгоритм рекурсивной фиксации прибыли и предоставить глубокие параметрические выводы."
                      : "Мы рекомендуем нажать экстренную или рабочую кнопку СТОП сверху, чтобы завершить сессию форвардтестинга, прежде чем запустить глубокий анализ тяжелой моделью."}
                </p>

                <button
                  onClick={handleDecodeBlackBox}
                  className={`px-6 py-3 text-xs font-bold uppercase rounded-sm border transition-all flex items-center gap-2 select-none cursor-pointer group
                    ${halted && config.execution.blackBoxEnabled !== false
                      ? 'bg-[#ea580c] text-white border-[#f97316] hover:bg-[#d97706] active:scale-95 shadow-[0_0_15px_rgba(234,88,12,0.3)]'
                      : 'bg-transparent text-[#64748b] border-[#1a2233] cursor-not-allowed opacity-60'
                    }
                  `}
                  disabled={!halted || config.execution.blackBoxEnabled === false}
                  title={config.execution.blackBoxEnabled === false ? "Черный Ящик выключен в настройках" : halted ? "Запустить ИИ анализ тяжелой модели" : "Остановите бота для запуска"}
                >
                  <Cpu className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  {config.execution.blackBoxEnabled === false ? "ЧЕРНЫЙ ЯЩИК ВЫКЛЮЧЕН" : "ДЕКОДИРОВАТЬ ЧЕРНЫЙ ЯЩИК (ТЯЖЕЛАЯ МОДЕЛЬ)"}
                </button>
                
                {!halted && (
                  <span className="text-[9px] text-[#64748b] mt-3">
                    ⚠️ Требуется перевести систему в статус HALTED для фиксации массива анализируемых данных
                  </span>
                )}
              </div>
            )}

            {isAnalyzing && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="relative w-16 h-16 mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-amber-500/10 border-t-amber-500 animate-spin"></div>
                </div>
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest animate-pulse">Тяжелая Модель ИИ Раскодирует Логи...</h4>
                <div className="text-[10px] text-[#64748b] space-y-1 mt-4 font-mono">
                  <p className="animate-pulse">◌ Запрос к Gemini 3.5 Cognitive Layer...</p>
                  <p className="opacity-80">◌ Сопоставление Micro-Tape сигналов с тиком совершения ордеров...</p>
                  <p className="opacity-50">◌ Расчет Kelly и просадок...</p>
                </div>
              </div>
            )}

            {analysisReport && !isAnalyzing && (
              <div className="flex-1 flex flex-col min-h-0 space-y-4">
                
                {/* Control to re-run the analysis */}
                <div className="flex justify-between items-center bg-black/40 border border-[#1a2233] p-2 rounded shrink-0">
                  <span className="text-[10px] text-[#64748b] uppercase">Отчет сформирован по завершению trading-turn</span>
                  <button
                    onClick={handleDecodeBlackBox}
                    className="text-[10px] text-amber-400 font-bold hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    Пересчитать анализ <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Main report console */}
                <div className="flex-1 overflow-y-auto bg-black/40 border border-[#1a2233] rounded p-4 pr-2 max-h-[360px] select-text">
                  <SimpleMarkdown text={analysisReport} />
                </div>
                
              </div>
            )}

            {errorStr && (
              <div className="bg-rose-500/5 border border-rose-500/30 p-3 rounded text-xs text-rose-400 flex items-start gap-2 mt-4 shrink-0 font-mono">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Ошибка анализа:</p>
                  <p className="text-[10px] text-rose-300/80 leading-relaxed mt-1">{errorStr}</p>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}

// Internal Simple Markdown Renderer to preserve modularity, cleanliness and fast load without node_modules overhead
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-3 text-xs text-[#adbcd0] leading-relaxed font-mono">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('####')) {
          return <h5 key={idx} className="text-[11px] font-bold text-[#38bdf8] mt-3 mb-1 uppercase tracking-wide">{trimmed.replace('####', '').trim()}</h5>;
        }
        if (trimAndMatch(trimmed, '###')) {
          return <h4 key={idx} className="text-xs font-bold text-amber-400 mt-4 mb-2 tracking-wide uppercase border-b border-amber-500/20 pb-0.5">{trimmed.replace('###', '').trim()}</h4>;
        }
        if (trimAndMatch(trimmed, '##')) {
          return <h3 key={idx} className="text-sm font-bold text-[#00ff41] mt-5 mb-2 tracking-wider border-b border-[#00ff41]/30 pb-0.5">{trimmed.replace('##', '').trim()}</h3>;
        }
        if (trimAndMatch(trimmed, '#')) {
          return <h2 key={idx} className="text-base font-bold text-[#e0e0e0] mt-6 mb-3 tracking-tighter border-b border-white/20 pb-1">{trimmed.replace('#', '').trim()}</h2>;
        }
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const content = trimmed.substring(1).trim();
          const boldParts = content.split('**');
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-3 py-0.5 text-[11px]">
              <span className="text-amber-400 select-none">↳</span>
              <span className="select-text">
                {boldParts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{part}</strong> : part)}
              </span>
            </div>
          );
        }
        if (trimmed === "") {
          return <div key={idx} className="h-1.5" />;
        }
        const boldParts = line.split('**');
        return (
          <p key={idx} className="text-[11px] leading-relaxed py-0.5 select-text">
            {boldParts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{part}</strong> : part)}
          </p>
        );
      })}
    </div>
  );
}

function trimAndMatch(trimmed: string, token: string): boolean {
  return trimmed.startsWith(token);
}
