import { TradePosition, HistorisedTrade } from '../types';
import { ArrowUpRight, ArrowDownRight, TrendingUp, ShieldAlert, Zap, History, DollarSign } from 'lucide-react';

interface PortfolioComponentProps {
  position: TradePosition | null;
  trades: HistorisedTrade[];
  accountEquity: number;
  realizedPnL: number;
  currentPrice: number;
  onClosePosition: () => void;
  feesPaid: number;
  tradedVolumeBtc: number;
  tradedVolumeUsd: number;
  completedTradesCount: number;
}

export function PortfolioComponent({
  position,
  trades,
  accountEquity,
  realizedPnL,
  currentPrice,
  onClosePosition,
  feesPaid,
  tradedVolumeBtc,
  tradedVolumeUsd,
  completedTradesCount
}: PortfolioComponentProps) {
  // Compute absolute TP & SL levels with dynamic or static presets
  let tpPrice = position?.tpPrice;
  let slPrice = position?.slPrice;

  if (position && (!tpPrice || !slPrice)) {
    const tf = position.timeframe || '1m';
    const strat = position.strategyType || 'BREAKOUT';
    const TF_TARGETS_STATIC: Record<string, Record<string, { tp: number; sl: number }>> = {
      '1m': { BREAKOUT: { tp: 120.0, sl: 40.0 }, ABSORPTION_FADE: { tp: 80.0, sl: 50.0 } },
      '5m': { BREAKOUT: { tp: 250.0, sl: 80.0 }, ABSORPTION_FADE: { tp: 160.0, sl: 100.0 } },
      '15m': { BREAKOUT: { tp: 450.0, sl: 150.0 }, ABSORPTION_FADE: { tp: 300.0, sl: 180.0 } },
      '1h': { BREAKOUT: { tp: 900.0, sl: 300.0 }, ABSORPTION_FADE: { tp: 600.0, sl: 350.0 } },
      '4h': { BREAKOUT: { tp: 1800.0, sl: 600.0 }, ABSORPTION_FADE: { tp: 1200.0, sl: 700.0 } },
      '1d': { BREAKOUT: { tp: 4000.0, sl: 1500.0 }, ABSORPTION_FADE: { tp: 2500.0, sl: 1800.0 } }
    };
    const target = TF_TARGETS_STATIC[tf]?.[strat] || TF_TARGETS_STATIC['1m']['BREAKOUT'];
    if (position.side === 'BUY') {
      tpPrice = position.entryPrice + target.tp;
      slPrice = position.entryPrice - target.sl;
    } else {
      tpPrice = position.entryPrice - target.tp;
      slPrice = position.entryPrice + target.sl;
    }
  }
  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 w-full z-10">
      
      {/* 1. Account Balance & Stats Widget */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0a0f1d]/85 border border-[#1a2233] p-4 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider">Account Equity (Paper)</p>
            <p className="text-xl font-mono font-bold text-[#e0e0e0] mt-1">${accountEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded border border-blue-500/20 text-[#38bdf8]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#0a0f1d]/85 border border-[#1a2233] p-4 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider">Realized profit/loss</p>
            <p className={`text-xl font-mono font-bold mt-1 ${realizedPnL >= 0 ? 'text-[#00ff41]' : 'text-red-500'}`}>
              {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className={`p-2.5 rounded border text-sm font-bold ${realizedPnL >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-[#00ff41]' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#0a0f1d]/85 border border-[#1a2233] p-4 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider">Unrealized P&L</p>
            <p className={`text-xl font-mono font-bold mt-1 ${position ? (position.unrealizedPnL >= 0 ? 'text-[#00ff41]' : 'text-red-500') : 'text-[#64748b]'}`}>
              {position ? (position.unrealizedPnL >= 0 ? `+$${position.unrealizedPnL.toFixed(2)}` : `-$${Math.abs(position.unrealizedPnL).toFixed(2)}`) : '$0.00'}
            </p>
          </div>
          <div className="text-[10px] font-mono text-right flex flex-col items-end">
            {position ? (
              <span className={`px-2 py-0.5 rounded border ${position.unrealizedPnL >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-[#00ff41]' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnLPct.toFixed(2)}%
              </span>
            ) : (
              <span className="text-[#64748b]">-</span>
            )}
          </div>
        </div>

        <div className="bg-[#0a0f1d]/85 border border-[#1a2233] p-4 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider">Current Mark Price</p>
            <p className="text-xl font-mono font-bold text-[#fafafa] mt-1">${currentPrice.toFixed(2)}</p>
          </div>
          <div className="text-right text-[10px] text-[#64748b]">
            <span className="inline-block w-2 h-2 bg-[#00ff41] rounded-full animate-ping mr-1"></span>
            BTCUSDT Live
          </div>
        </div>
      </div>

      {/* 2. Middle Row: Terminal (Manual Trading Interface) & Active Position info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Trading Statistics & Commissions */}
        <div className="bg-[#0a0f1d]/85 border border-[#1a2233] rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[#00ff41]" />
              <h3 className="text-xs font-bold text-[#e0e0e0] uppercase tracking-wider">Статистика сделок и комиссий</h3>
            </div>
            <p className="text-[10px] text-[#64748b] mb-4 uppercase tracking-wider">
              Базовые системные показатели проторгованного объема и торговых издержек за сессию
            </p>

            <div className="space-y-2 font-mono">
              <div className="flex justify-between items-center p-2.5 bg-black/20 rounded border border-[#1a2233]">
                <span className="text-[10px] text-[#64748b] uppercase">Количество сделок (Completed Trades)</span>
                <span className="text-xs font-bold text-[#00ff41]">{completedTradesCount}</span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-black/20 rounded border border-[#1a2233]">
                <span className="text-[10px] text-[#64748b] uppercase">Проторгованный объем BTC</span>
                <span className="text-xs font-bold text-[#38bdf8]">{tradedVolumeBtc.toFixed(4)} BTC</span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-black/20 rounded border border-[#1a2233]">
                <span className="text-[10px] text-[#64748b] uppercase">Проторгованный объем USD</span>
                <span className="text-xs font-bold text-[#e0e0e0]">${tradedVolumeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-black/20 rounded border border-[#1a2233]">
                <span className="text-[10px] text-[#64748b] uppercase">Уплаченные комиссии (Fees Paid)</span>
                <span className="text-xs font-bold text-red-400">${feesPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
              </div>
            </div>
          </div>

          <div className="bg-black/30 p-3 rounded border border-[#1a2233] mt-4">
             <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#64748b]">Leverage Config</span>
                <span className="text-[#38bdf8] font-mono">Isolated 10x</span>
             </div>
             <div className="flex justify-between items-center text-[10px] mt-1">
                <span className="text-[#64748b]">Simulated Order Fee</span>
                <span className="text-gray-400 font-mono">0.02% Maker / 0.04% Taker</span>
             </div>
          </div>
        </div>

        {/* Position Manager */}
        <div className="bg-[#0a0f1d]/85 border border-[#1a2233] rounded-lg p-5 flex flex-col">
          <h3 className="text-xs font-bold text-[#e0e0e0] uppercase tracking-wider mb-4 flex items-center gap-2">
             <span className={`w-2 h-2 rounded-full ${position ? 'bg-[#00ff41] animate-pulse' : 'bg-[#64748b]'}`}></span>
             Текущая Активная Позиция
          </h3>

          {position ? (
            <div className="flex-1 flex flex-col">
               <div className="grid grid-cols-2 gap-4 pb-3 border-b border-[#1a2233]">
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase">Контракт / Сторона</p>
                     <p className="text-sm font-bold flex items-center gap-1 mt-0.5">
                       BTCUSDT Perpetual 
                       <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${position.side === 'BUY' ? 'bg-emerald-500/10 border border-emerald-500/20 text-[#00ff41]' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                         {position.side === 'BUY' ? 'LONG' : 'SHORT'}
                       </span>
                     </p>
                  </div>
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase">Размер Позиции</p>
                     <p className="text-sm font-mono font-bold text-[#e0e0e0] mt-0.5">{position.size} BTC (${(position.size * currentPrice).toLocaleString('en-US', {maximumFractionDigits: 0})})</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 pt-3 pb-3">
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase">Цена Входа (Avg Entry)</p>
                     <p className="text-sm font-mono font-bold text-[#e0e0e0] mt-0.5">${position.entryPrice.toFixed(2)}</p>
                  </div>
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase">Маржа (10x Leverage)</p>
                     <p className="text-sm font-mono font-bold text-[#e0e0e0] mt-0.5">${((position.entryPrice * position.size) / 10).toFixed(2)}</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 pt-3 pb-3 border-t border-[#1a2233]">
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41]"></span>
                        Тейк-Профит (Take Profit)
                     </p>
                     <p className="text-sm font-mono font-bold text-[#00ff41] mt-0.5">${tpPrice?.toFixed(2)}</p>
                  </div>
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        Стоп-Лосс (Stop Loss)
                     </p>
                     <p className="text-sm font-mono font-bold text-red-400 mt-0.5">${slPrice?.toFixed(2)}</p>
                  </div>
               </div>

               <div className="bg-black/40 p-3 rounded border border-[#1a2233] mb-4 flex justify-between items-center mt-auto">
                 <div>
                   <p className="text-[9px] text-[#64748b] uppercase tracking-wider">Нереализованный P&L (Floating PnL)</p>
                   <p className={`text-lg font-mono font-bold ${position.unrealizedPnL >= 0 ? 'text-[#00ff41]' : 'text-red-500'}`}>
                     {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                   </p>
                 </div>
                 <span className={`text-xs font-mono font-bold px-2 py-1 rounded border ${position.unrealizedPnL >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-[#00ff41]' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                   {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnLPct.toFixed(2)}%
                 </span>
               </div>

               <button
                 onClick={onClosePosition}
                 className="w-full py-2 bg-red-600/25 hover:bg-red-600/40 border border-red-500/60 text-red-200 hover:text-white rounded text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95"
               >
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Рыночное Закрытие (Market Emergency Close)
               </button>
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-[#1a2233] rounded-lg flex flex-col items-center justify-center p-6 text-center mt-2">
               <p className="text-xs font-bold text-[#64748b] uppercase tracking-wide">Нет открытых позиций</p>
               <p className="text-[10px] text-gray-500 max-w-[280px] mt-1">
                 Бот FSM еще не вошел в сделку у зоны ликвидности, либо вы можете открыть позицию вручную кнопками слева.
               </p>
            </div>
          )}
        </div>
        
      </div>

      {/* 3. History Component: List of completed fills */}
      <div className="bg-[#0a0f1d]/85 border border-[#1a2233] rounded-lg p-5 flex-1 flex flex-col min-h-[220px]">
         <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-[#38bdf8]" />
            <h3 className="text-xs font-bold text-[#e0e0e0] uppercase tracking-wider">История исполненных сделок (Real-time Trade History)</h3>
         </div>

         <div className="flex-1 overflow-y-auto pr-1">
            {trades.length > 0 ? (
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[#1a2233] text-[#64748b] bg-black/10">
                    <th className="py-2 px-3">ВРЕМЯ</th>
                    <th className="py-2 px-3">ТИП ОРДЕРА</th>
                    <th className="py-2 px-3">НАПРАВЛЕНИЕ</th>
                    <th className="py-2 px-3">ЦЕНА ИСПОЛНЕНИЯ</th>
                    <th className="py-2 px-3">ОБЪЕМ</th>
                    <th className="py-2 px-3 text-right">РЕАЛИЗОВАННЫЙ PNL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2233]">
                  {trades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="py-2.5 px-3 text-[#64748b]">{t.timestamp}</td>
                      <td className="py-2.5 px-3 font-semibold text-sky-400">{t.type}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${t.side === 'BUY' ? 'bg-emerald-500/10 text-[#00ff41]' : 'bg-red-500/10 text-red-400'}`}>
                           {t.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-white">${t.price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 uppercase text-[#64748b]">{t.size} BTC</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${t.pnl !== undefined ? (t.pnl >= 0 ? 'text-[#00ff41]' : 'text-red-500') : 'text-[#64748b]'}`}>
                         {t.pnl !== undefined ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : 'Entry Fill'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[140px] text-center border border-dashed border-[#1a2233] rounded">
                 <p className="text-xs text-[#64748b] uppercase">Нет исполненных ордеров в текущей сессии</p>
                 <p className="text-[10px] text-gray-500 mt-1">Сделки появятся здесь при триггере пробоя или ручном входе.</p>
              </div>
            )}
         </div>
      </div>

    </div>
  );
}
