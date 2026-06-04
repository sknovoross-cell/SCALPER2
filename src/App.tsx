import { useState, useEffect } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { StateTracker } from './components/StateTracker';
import { Charts } from './components/Charts';
import { SignalLog } from './components/SignalLog';
import { MarketChart } from './components/MarketChart';
import { PortfolioComponent } from './components/PortfolioComponent';
import { useEngine } from './hooks/useEngine';
import { Activity, LayoutDashboard, BarChart2, Briefcase, Terminal, X, Play, Pause } from 'lucide-react';

export default function App() {
  const {
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
    closePosition,
    wsStatus,
    timeframe,
    setTimeframe,
    feesPaid,
    tradedVolumeBtc,
    tradedVolumeUsd,
    completedTradesCount
  } = useEngine();

  const [view, setView] = useState<'dashboard' | 'chart' | 'portfolio'>('dashboard');
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [logs, setLogs] = useState<{ time: string; level: string; message: string }[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const currentPriceRaw = metrics.length > 0 ? metrics[metrics.length - 1].price : 64500;
  const currentPriceStr = currentPriceRaw.toFixed(2);

  useEffect(() => {
    let active = true;
    function pollLogs() {
      fetch('/api/logs')
        .then(res => res.json())
        .then(data => {
          if (active && Array.isArray(data)) {
            setLogs(data);
          }
        })
        .catch(err => console.warn("Failed to fetch backend logs:", err));
    }
    const interval = setInterval(pollLogs, 2000);
    pollLogs();
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#050608] text-[#e0e0e0] overflow-hidden font-mono relative">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_50%_0%,#1e3a8a_0%,transparent_50%)]"></div>

      {/* Topbar */}
      {!chartFullscreen && (
        <header className="flex justify-between items-center border-b border-[#1a2233] p-4 shrink-0 z-10 bg-transparent">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41] animate-pulse"></div>
            <div>
              <h1 className="text-lg font-bold tracking-tighter text-[#00ff41] flex items-center gap-2"><Activity className="w-5 h-5" /> ILBS-v1</h1>
              <p className="text-[10px] text-[#64748b] uppercase tracking-[0.2em]">QuantArchitect-Prime | SOTA 2024-2026</p>
            </div>
          </div>

          <div className="flex gap-8 text-right items-center">
            <div className="flex bg-[#1a2233]/40 p-1 rounded gap-1 mr-2 border border-[#1a2233]">
              <button onClick={() => { setView('dashboard'); setChartFullscreen(false); }} className={`px-3 py-1 rounded text-[10px] font-bold tracking-wider transition-colors hover:text-[#00ff41] ${view === 'dashboard' ? 'bg-[#0a0f1d] text-[#e0e0e0] border border-[#1a2233]' : 'text-[#64748b] border border-transparent'}`}>
                <LayoutDashboard className="w-3 h-3 inline mr-1 -mt-0.5"/> ДАШБОРД
              </button>
              <button onClick={() => setView('chart')} className={`px-3 py-1 rounded text-[10px] font-bold tracking-wider transition-colors hover:text-[#38bdf8] ${view === 'chart' ? 'bg-[#0a0f1d] text-[#e0e0e0] border border-[#1a2233]' : 'text-[#64748b] border border-transparent'}`}>
                <BarChart2 className="w-3 h-3 inline mr-1 -mt-0.5"/> ГРАФИК ЛИКВИДНОСТИ
              </button>
              <button onClick={() => { setView('portfolio'); setChartFullscreen(false); }} className={`px-3 py-1 rounded text-[10px] font-bold tracking-wider transition-colors hover:text-[#f59e0b] ${view === 'portfolio' ? 'bg-[#0a0f1d] text-[#e0e0e0] border border-[#1a2233]' : 'text-[#64748b] border border-transparent'}`}>
                <Briefcase className="w-3 h-3 inline mr-1 -mt-0.5"/> СДЕЛКИ И PNL
              </button>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] text-[#64748b] uppercase">Цена (BTCUSDT)</span>
              <span className="text-sm font-bold text-[#e0e0e0]">${currentPriceStr}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#64748b] uppercase">Задержка (Hot Path)</span>
              <span className="text-sm font-bold text-[#38bdf8]">{latency.toFixed(2)}ms <span className="text-[10px] opacity-50 text-[#38bdf8]">E2E</span></span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#64748b] uppercase">Статус Системы</span>
              <span className={`text-sm font-bold ${halted ? 'text-[#ef4444]' : 'text-emerald-400'}`}>{halted ? 'HALTED' : state}</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleHalt}
                className={`px-4 py-1.5 text-[10px] uppercase font-bold rounded border transition-all select-none flex items-center gap-1
                 ${halted 
                   ? 'bg-[#00ff41] text-[#0a0f1d] border-[#00ff41] hover:bg-[#00dd35] active:scale-95 shadow-[0_0_10px_rgba(0,255,65,0.4)]' 
                   : 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30 hover:bg-[#ef4444]/25 active:scale-95'}
                `}
                title={halted ? "Запустить торгового робота" : "Остановить торгового робота"}
              >
                 {halted ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                 {halted ? 'СТАРТ' : 'СТОП'}
              </button>
              <button 
                onClick={toggleHalt}
                className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-all select-none
                 ${halted 
                   ? 'bg-[#ef4444]/10 text-[#64748b] border-[#1a2233] cursor-not-allowed opacity-40' 
                   : 'bg-transparent text-[#ef4444] border-[#ef4444]/40 hover:bg-[#ef4444]/15 active:scale-95'}
                `}
                disabled={halted}
                title="Экстренная остановка всех процессов робота"
              >
                 KILL SWITCH
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Layout Area */}
      <div className={`flex-1 flex min-h-0 w-full ${chartFullscreen ? 'max-w-none p-0 m-0' : 'container mx-auto max-w-[1400px]'}`}>
        
        {/* Left Sidebar: Controls & Settings */}
        {!chartFullscreen && <SettingsPanel config={config} onChange={updateConfig} />}

        {/* Center Area: Context Switching */}
        <main className={`flex-1 flex flex-col min-w-0 gap-4 z-10 overflow-y-auto ${chartFullscreen ? 'p-0' : 'p-4'}`}>
           
           {view === 'dashboard' && (
             <>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 h-64 font-mono">
                   <h2 className="text-[11px] font-bold text-[#64748b] uppercase mb-4 tracking-wider">Конечный автомат (FSM) Context</h2>
                   <StateTracker currentState={state} halted={halted} />
                 </div>

                 <div className="flex-1 bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 flex flex-col h-64 font-mono">
                    <h2 className="text-[11px] font-bold text-[#64748b] uppercase mb-4">Управление рисками</h2>
                    <div className="grid grid-cols-2 gap-4 text-[11px]">
                      <div className="p-3 bg-black/40 rounded border border-[#1a2233]">
                        <p className="text-[#64748b] mb-1">Account Equity</p>
                        <p className="text-lg font-bold text-white">${accountEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="p-3 bg-black/40 rounded border border-[#1a2233]">
                        <p className="text-[#64748b] mb-1">Realized P&L (Session)</p>
                        <p className={`text-lg font-bold ${realizedPnL >= 0 ? 'text-[#00ff41]' : 'text-red-500'}`}>
                          {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="p-2 border border-[#1a2233] rounded">
                         <p className="text-[9px] text-[#64748b] uppercase">Kelly Fraction</p>
                         <p className="text-sm">{config.risk.kellyFraction} (Adj)</p>
                      </div>
                      <div className="p-2 border border-[#1a2233] rounded">
                         <p className="text-[9px] text-[#64748b] uppercase">Slippage Cap</p>
                         <p className="text-sm">{config.execution.maxSlippageTicks} Ticks</p>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <div className="flex justify-between items-end pb-1 border-b border-[#1a2233] mb-2">
                        <span className="text-[10px] text-[#64748b]">События RiskManager</span>
                        <span className="text-[9px] text-gray-500">Just now</span>
                      </div>
                      <p className="text-[10px] text-[#f59e0b] italic">* Latency stable. Strategy operational.</p>
                    </div>
                 </div>
               </div>

               <div className="flex-1 bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 flex flex-col min-h-0 font-mono">
                 <h2 className="text-[11px] font-bold text-[#64748b] uppercase mb-4 tracking-wider">Микроструктурные метрики (L3 MBO Data)</h2>
                 <Charts data={metrics} />
               </div>
             </>
           )}

           {view === 'chart' && (
             <MarketChart trades={trades} 
               data={chartData} 
               zones={zones} 
               timeframe={timeframe} 
               setTimeframe={setTimeframe} 
               isFullscreen={chartFullscreen}
               onFullscreenChange={setChartFullscreen}
             />
           )}

           {view === 'portfolio' && (
             <PortfolioComponent
               position={position}
               trades={trades}
               accountEquity={accountEquity}
               realizedPnL={realizedPnL}
               currentPrice={currentPriceRaw}
               onClosePosition={closePosition}
               feesPaid={feesPaid}
               tradedVolumeBtc={tradedVolumeBtc}
               tradedVolumeUsd={tradedVolumeUsd}
               completedTradesCount={completedTradesCount}
             />
           )}
           
        </main>

        {/* Right Sidebar: Execution log */}
        {!chartFullscreen && <SignalLog signals={signals} />}

      </div>

      {!chartFullscreen && (
        <footer className="mt-auto h-8 px-4 flex items-center justify-between border-t border-[#1a2233] text-[10px] text-[#64748b] bg-[#050608] shrink-0 z-10 relative">
          <div className="flex gap-4 items-center">
            <span>SYSTEM_UPTIME: 142:22:04</span>
            <span>DB_SYNC: DUCKDB [LOCAL]</span>
            <span>EXCHANGE: BINANCE [FEED: {wsStatus}]</span>
            <button 
              onClick={() => setShowLogs(!showLogs)} 
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] transition-all font-bold ${
                showLogs ? 'bg-[#ef4444]/20 border-[#ef4444] text-[#ef4444]' : 'bg-transparent border-[#1a2233] text-[#e0e0e0] hover:text-[#00ff41]'
              }`}
            >
              <Terminal className="w-2.5 h-2.5" /> СЕРВЕРНЫЕ ЛОГИ ({logs.length})
            </button>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-[#00ff41]">● ENGINE_READY</span>
            <span className="text-[#38bdf8]">● NETWORK_OPTIMIZED</span>
            <span className="bg-white/10 px-2 rounded text-white">v1.0.0-PROD</span>
          </div>
        </footer>
      )}

      {/* Real-time Backend Diagnostic Logs Drawer */}
      {showLogs && (
        <div className="absolute bottom-8 right-4 w-[520px] h-[340px] bg-[#070b14]/95 border border-[#1a2233] shadow-2xl rounded-t-lg z-50 flex flex-col font-mono text-[11px]">
          <div className="flex justify-between items-center bg-[#0a0f1d] border-b border-[#1a2233] p-2 rounded-t-lg shrink-0">
            <span className="text-[#00ff41] font-bold flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> СЕРВЕРНАЯ ДИАГНОСТИКА: FEED LOGS</span>
            <button onClick={() => setShowLogs(false)} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-black/40">
            {logs.length === 0 ? (
              <p className="text-gray-500 italic">Ожидание ответов / событий от сервера...</p>
            ) : (
              [...logs].reverse().map((log, index) => {
                const color = log.level === "ERROR" ? "text-red-500" : log.level === "WARN" ? "text-amber-500" : "text-[#e0e0e0]";
                return (
                  <div key={index} className="leading-tight select-text py-0.5 border-b border-white/5 last:border-0 text-[10px]">
                    <span className="text-gray-500 mr-1">[{log.time ? log.time.split('T')[1].substring(0,8) : ""}]</span>
                    <span className={`font-bold mr-1.5 opacity-85 ${color}`}>[{log.level}]</span>
                    <span className={color}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

    </div>
  );
}
