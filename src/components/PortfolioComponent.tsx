import { TradePosition, HistorisedTrade, LiquidityZone } from '../types';
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
  symbol?: string;
  formatPrice?: (price: number) => string;
  formatQty?: (price: number, qty: number) => string;
  zones?: LiquidityZone[];
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
  completedTradesCount,
  symbol = "BTCUSDT",
  formatPrice,
  formatQty,
  zones
}: PortfolioComponentProps) {
  const activeSymbolName = symbol.toUpperCase();
  const baseAsset = activeSymbolName.replace("USDT", "").replace("BUSD", "");
  
  const fmtPrice = formatPrice || ((p: number) => (p === undefined || p === null || isNaN(p)) ? "0.0" : p.toFixed(2));
  const fmtQty = formatQty || ((p: number, q: number) => (q === undefined || q === null || isNaN(q)) ? "0.0" : q.toFixed(4));
  // Compute absolute TP & SL levels with dynamic or static presets
  let tpPrice = position?.tpPrice;
  let slPrice = position?.slPrice;

  if (position && (!tpPrice || !slPrice)) {
    const tf = position.timeframe || '1m';
    const strat = position.strategyType || 'BREAKOUT';
    const TF_TARGETS_STATIC: Record<string, Record<string, { tp: number; sl: number }>> = {
      '1m': { BREAKOUT: { tp: 120.0, sl: 40.0 }, ABSORPTION_FADE: { tp: 80.0, sl: 50.0 }, FALSE_BREAKOUT: { tp: 90.0, sl: 45.0 } },
      '5m': { BREAKOUT: { tp: 250.0, sl: 80.0 }, ABSORPTION_FADE: { tp: 160.0, sl: 100.0 }, FALSE_BREAKOUT: { tp: 180.0, sl: 90.0 } },
      '15m': { BREAKOUT: { tp: 450.0, sl: 150.0 }, ABSORPTION_FADE: { tp: 300.0, sl: 180.0 }, FALSE_BREAKOUT: { tp: 350.0, sl: 160.0 } },
      '1h': { BREAKOUT: { tp: 900.0, sl: 300.0 }, ABSORPTION_FADE: { tp: 600.0, sl: 350.0 }, FALSE_BREAKOUT: { tp: 700.0, sl: 320.0 } },
      '4h': { BREAKOUT: { tp: 1800.0, sl: 600.0 }, ABSORPTION_FADE: { tp: 1200.0, sl: 700.0 }, FALSE_BREAKOUT: { tp: 1400.0, sl: 650.0 } },
      '1d': { BREAKOUT: { tp: 4000.0, sl: 1500.0 }, ABSORPTION_FADE: { tp: 2500.0, sl: 1800.0 }, FALSE_BREAKOUT: { tp: 3000.0, sl: 1600.0 } }
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

  // Calculate dynamic Trade Health Index & Case Evaluation
  let tradeHealthIndex = 100;
  let caseEvaluationResult = "STABLE";
  let caseEvaluationColor = "text-[#38bdf8]";
  let caseEvaluationIconColor = "bg-[#38bdf8]/10 border-[#38bdf8]/20";
  let healthBarColor = "bg-[#38bdf8]";
  
  if (position) {
    const tpTarget = tpPrice ? Math.abs(tpPrice - position.entryPrice) : 120.0;
    const slTarget = slPrice ? Math.abs(slPrice - position.entryPrice) : 40.0;
    const currentPriceDiff = currentPrice - position.entryPrice;
    const pathPnL = position.side === 'BUY' ? currentPriceDiff : -currentPriceDiff;
    
    let pnlComponent = 100;
    if (pathPnL < 0) {
      const slProximity = Math.min(1, Math.abs(pathPnL) / slTarget);
      pnlComponent -= slProximity * 60; // Max -60 points close to SL
    } else {
      const tpProximity = Math.min(1, pathPnL / tpTarget);
      pnlComponent += tpProximity * 20; // Max +20 points close to TP
    }

    const positionCvd = position.positionCvd || 0;
    const isSupportingCvd = position.side === 'BUY' ? positionCvd > 0 : positionCvd < 0;
    const cvdMagnitude = Math.abs(positionCvd);
    let cvdComponent = 0;
    if (isSupportingCvd) {
      cvdComponent = Math.min(20, cvdMagnitude * 10);
    } else {
      cvdComponent = -Math.min(30, cvdMagnitude * 15);
    }

    const adverseEnergy = position.adverseEnergy || 0;
    const maxAdverseEnergyThreshold = slTarget * 4.5;
    const adverseEnergyRatio = Math.min(1, adverseEnergy / maxAdverseEnergyThreshold);
    const adverseEnergyComponent = -adverseEnergyRatio * 40;

    tradeHealthIndex = Math.round(Math.max(0, Math.min(100, pnlComponent + cvdComponent + adverseEnergyComponent)));

    if (tradeHealthIndex >= 85) {
      caseEvaluationResult = "Strong Trend / Bull Run";
      caseEvaluationColor = "text-[#00ff41]";
      caseEvaluationIconColor = "bg-[#00ff41]/10 border-[#00ff41]/20";
      healthBarColor = "bg-[#00ff41]";
    } else if (tradeHealthIndex >= 65) {
      caseEvaluationResult = "Stable / Positive Flow";
      caseEvaluationColor = "text-teal-400";
      caseEvaluationIconColor = "bg-teal-500/10 border-teal-500/20";
      healthBarColor = "bg-teal-400";
    } else if (tradeHealthIndex >= 45) {
      caseEvaluationResult = "Chippy Consolidation";
      caseEvaluationColor = "text-amber-400";
      caseEvaluationIconColor = "bg-amber-500/10 border-amber-500/20";
      healthBarColor = "bg-amber-500";
    } else if (tradeHealthIndex >= 25) {
      caseEvaluationResult = "Under Strain / Exit Warning";
      caseEvaluationColor = "text-orange-400";
      caseEvaluationIconColor = "bg-orange-500/10 border-orange-500/20";
      healthBarColor = "bg-orange-500";
    } else {
      caseEvaluationResult = "Extreme Risk / Stop Imminent";
      caseEvaluationColor = "text-red-500 animate-pulse font-extrabold";
      caseEvaluationIconColor = "bg-red-500/20 border-red-500/30";
      healthBarColor = "bg-red-500";
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
            <p className="text-xl font-mono font-bold text-[#fafafa] mt-1">${fmtPrice(currentPrice)}</p>
          </div>
          <div className="text-right text-[10px] text-[#64748b]">
            <span className="inline-block w-2 h-2 bg-[#00ff41] rounded-full animate-ping mr-1"></span>
            {activeSymbolName} Live
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
                <span className="text-[10px] text-[#64748b] uppercase">Проторгованный объем {baseAsset}</span>
                <span className="text-xs font-bold text-[#38bdf8]">{fmtQty(currentPrice, tradedVolumeBtc)} {baseAsset}</span>
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
                       {activeSymbolName} Perpetual 
                       <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${position.side === 'BUY' ? 'bg-emerald-500/10 border border-emerald-500/20 text-[#00ff41]' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                         {position.side === 'BUY' ? 'LONG' : 'SHORT'}
                       </span>
                     </p>
                  </div>
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase">Размер Позиции</p>
                     <p className="text-sm font-mono font-bold text-[#e0e0e0] mt-0.5">{fmtQty(currentPrice, position.size)} {baseAsset} (${(position.size * currentPrice).toLocaleString('en-US', {maximumFractionDigits: 2})})</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 pt-3 pb-3">
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase">Цена Входа (Avg Entry)</p>
                     <p className="text-sm font-mono font-bold text-[#e0e0e0] mt-0.5">${fmtPrice(position.entryPrice)}</p>
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
                     <p className="text-sm font-mono font-bold text-[#00ff41] mt-0.5">${tpPrice ? fmtPrice(tpPrice) : ""}</p>
                  </div>
                  <div>
                     <p className="text-[10px] text-[#64748b] uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        Стоп-Лосс (Stop Loss)
                     </p>
                     <p className="text-sm font-mono font-bold text-red-400 mt-0.5">${slPrice ? fmtPrice(slPrice) : ""}</p>
                  </div>
               </div>

               {/* Dynamic Case Evaluation / Trade Health Index */}
               <div className="mt-2 mb-3 bg-[#0a0f1d]/50 p-3 rounded border border-[#1a2233]/70 font-mono text-[10px]">
                  <div className="flex justify-between items-center text-[#64748b] mb-1.5 uppercase tracking-wider">
                    <span>Оценка ситуации (Case Evaluation)</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${caseEvaluationIconColor}`}>
                      {caseEvaluationResult}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[#64748b] uppercase tracking-wider">
                    <span>Индекс успешности сделки (Health Index)</span>
                    <span className={`font-bold text-xs ${caseEvaluationColor}`}>
                      {tradeHealthIndex}%
                    </span>
                  </div>
                  <div className="w-full bg-[#111827] h-2 rounded-full overflow-hidden mt-2 border border-[#1a2233]">
                     <div 
                       className={`h-full transition-all duration-500 ${healthBarColor}`}
                       style={{ 
                         width: `${tradeHealthIndex}%` 
                        }}
                     />
                  </div>
                  
                  {/* Detailed metrics breakdown */}
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#1a2233]/40 text-[9px] text-[#52647c] uppercase">
                     <div className="flex justify-between">
                       <span>Накопленный CVD:</span>
                       <span className={position.positionCvd >= 0 ? "text-emerald-400" : "text-red-400"}>
                         {position.positionCvd >= 0 ? "+" : ""}{(position.positionCvd || 0).toFixed(2)}k
                       </span>
                     </div>
                     <div className="flex justify-between">
                       <span>Давление против позы:</span>
                       <span className={`font-bold ${(position.unrealizedPnL || 0) < 0 ? "text-red-400" : "text-[#00ff41]"}`}>
                         {(position.adverseEnergy || 0) >= 1000 
                           ? `${((position.adverseEnergy || 0) / 1000).toFixed(2)}k e` 
                           : `${(position.adverseEnergy || 0).toFixed(1)}e`}
                       </span>
                     </div>
                  </div>

                  {/* Zone Accumulator Overlay */}
                  {position.zoneTouchActive ? (
                    <div className="mt-2.5 pt-2 border-t border-dashed border-[#1a2233]/50 text-[9px]">
                      <div className="flex justify-between items-center text-[#14b8a6] uppercase font-bold mb-1 tracking-wider">
                        <span>Аккумуляция в зоне ({position.zoneTouchType})</span>
                        <span className="animate-pulse flex items-center gap-1 text-[8px] bg-[#14b8a6]/10 px-1 py-0.5 rounded border border-[#14b8a6]/20">
                          <span className="inline-block w-1 h-1 rounded-full bg-[#14b8a6]"></span>
                          LIVE REC
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#64748b] font-mono">
                        <div className="flex justify-between">
                          <span>Уровень POC:</span>
                          <span className="text-gray-300 font-bold">${(position.zoneTouchPrice || 0).toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Кол-во замерных тиков:</span>
                          <span className="text-gray-300">{position.zoneTicksCount || 0}t</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Накопл. зона CVD:</span>
                          <span className={`font-bold ${(position.zoneAccumulatedCvd || 0) >= 0 ? "text-[#00ff41]" : "text-red-400"}`}>
                            {(position.zoneAccumulatedCvd || 0) >= 0 ? "+" : ""}{(position.zoneAccumulatedCvd || 0).toFixed(2)}k
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Статус POC:</span>
                          {position.zonePocHit ? (
                             <span className="text-emerald-400 font-bold">🎯 Decision Active</span>
                          ) : (
                             <span className="text-amber-400 font-bold animate-pulse">⏳ Penetrating...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (() => {
                    const activeZones = (zones || []).filter(z => !z.isBroken && z.type !== "ACTIVE POS LIQ" && !z.type.startsWith("PRED LIQ"));
                    let nearestZone: LiquidityZone | null = null;
                    let minDistance = Infinity;

                    activeZones.forEach(z => {
                      const zLow = z.priceLow !== undefined ? z.priceLow : z.price;
                      const zHigh = z.priceHigh !== undefined ? z.priceHigh : z.price;
                      let dist = 0;
                      if (currentPrice > zHigh) {
                        dist = currentPrice - zHigh;
                      } else if (currentPrice < zLow) {
                        dist = zLow - currentPrice;
                      } else {
                        dist = 0;
                      }
                      if (dist < minDistance) {
                        minDistance = dist;
                        nearestZone = z;
                      }
                    });

                    return (
                      <div className="mt-2.5 pt-2 border-t border-dashed border-[#1a2233]/40 text-[9px]">
                        <div className="flex justify-between items-center text-[#64748b] uppercase font-bold mb-1 tracking-wider">
                          <span>Контроль уровней (Decider Standby)</span>
                          <span className="flex items-center gap-1 text-[8px] text-[#38bdf8] bg-[#38bdf8]/10 px-1 py-0.5 rounded border border-[#38bdf8]/20">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse"></span>
                            ACTIVE SCAN
                          </span>
                        </div>
                        {nearestZone ? (
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#52647c] font-mono mt-1">
                            <div className="flex justify-between">
                              <span>Ближайший уровень:</span>
                              <span className="text-gray-400 font-semibold">{nearestZone.type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Цель уровня (POC):</span>
                              <span className="text-gray-400 font-bold">${nearestZone.price.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between col-span-2 border-t border-[#1a2233]/25 pt-1 mt-0.5">
                              <span>Удаленность до границы:</span>
                              <span className="text-[#38bdf8] font-bold">
                                {minDistance === 0 ? "Касание зоны" : `${minDistance.toFixed(1)} USDT`}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 italic font-mono text-[8px] mt-1">Локальные экстремумы поддержки/сопротивления не обнаружены</p>
                        )}
                      </div>
                    );
                  })()}
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

               <div className="w-full mt-4 border-t border-[#1a2233]/40 pt-4 text-left max-w-[320px]">
                  {(() => {
                    const activeZones = (zones || []).filter(z => !z.isBroken && z.type !== "ACTIVE POS LIQ" && !z.type.startsWith("PRED LIQ"));
                    let nearestZone: LiquidityZone | null = null;
                    let minDistance = Infinity;

                    activeZones.forEach(z => {
                      const zLow = z.priceLow !== undefined ? z.priceLow : z.price;
                      const zHigh = z.priceHigh !== undefined ? z.priceHigh : z.price;
                      let dist = 0;
                      if (currentPrice > zHigh) {
                        dist = currentPrice - zHigh;
                      } else if (currentPrice < zLow) {
                        dist = zLow - currentPrice;
                      } else {
                        dist = 0;
                      }
                      if (dist < minDistance) {
                        minDistance = dist;
                        nearestZone = z;
                      }
                    });

                    return (
                      <div className="bg-[#0e1322]/40 p-3 rounded border border-[#1a2233] text-[9px] w-full">
                        <div className="flex justify-between items-center text-[#64748b] uppercase font-bold mb-1.5 tracking-wider">
                          <span>Контроль уровней (Decider Standby)</span>
                          <span className="flex items-center gap-1 text-[8px] text-[#38bdf8] bg-[#38bdf8]/10 px-1 py-0.5 rounded border border-[#38bdf8]/20 animate-pulse">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#38bdf8]"></span>
                            ACTIVE SCAN
                          </span>
                        </div>
                        {nearestZone ? (
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#52647c] font-mono mt-1">
                            <div className="flex justify-between">
                              <span>Ближайший уровень:</span>
                              <span className="text-gray-400 font-semibold">{(nearestZone as LiquidityZone).type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Цель уровня (POC):</span>
                              <span className="text-gray-400 font-bold">${(nearestZone as LiquidityZone).price.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between col-span-2 border-t border-[#1a2233]/25 pt-1.5 mt-1">
                              <span>Удаленность до границы:</span>
                              <span className="text-[#38bdf8] font-bold">
                                {minDistance === 0 ? "Касание зоны" : `${minDistance.toFixed(1)} USDT`}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 italic font-mono text-[8px] mt-1">Локальные экстремумы поддержки/сопротивления не обнаружены</p>
                        )}
                      </div>
                    );
                  })()}
               </div>
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
                      <td className="py-2.5 px-3 text-white">${fmtPrice(t.price)}</td>
                      <td className="py-2.5 px-3 uppercase text-[#64748b]">{fmtQty(t.price, t.size)} {baseAsset}</td>
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
