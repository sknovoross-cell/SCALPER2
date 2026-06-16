import React from 'react';
import { AppConfig } from '../types';
import { Flame } from 'lucide-react';

interface SettingsPanelProps {
  config: AppConfig;
  onChange: (c: Partial<AppConfig>) => void;
  onOpenSelector: () => void;
}

export function SettingsPanel({ config, onChange, onOpenSelector }: SettingsPanelProps) {
  return (
    <div className="w-80 border-r border-[#1a2233] bg-transparent p-4 overflow-y-auto flex flex-col gap-6 font-mono text-[11px] z-10">
      
       <div className="bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-3">
         <h3 className="text-[#64748b] font-bold mb-3 tracking-wider uppercase">Global Params</h3>
         <div className="space-y-3 relative">
            <label className="flex flex-col gap-1">
              <span className="text-[#64748b]">Mode</span>
              <select 
                className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0] outline-none focus:border-[#38bdf8] transition-colors"
                value={config.mode}
                onChange={(e) => onChange({ mode: e.target.value as 'live' | 'paper' })}
              >
                <option value="paper">PAPER</option>
                <option value="live">⚡ LIVE (RISK)</option>
              </select>
            </label>
            <div className="flex flex-col gap-1 cursor-pointer group" onClick={onOpenSelector}>
              <span className="text-[#64748b] flex justify-between items-center select-none">
                <span>Symbols</span>
                <span className="text-[9px] text-[#00ff41] font-bold uppercase tracking-wider group-hover:underline">Выбрать</span>
              </span>
              <div className="flex items-center justify-between bg-[#050608] border border-[#1a2233] group-hover:border-[#00ff41]/50 rounded px-3 py-1.5 text-[#e0e0e0] transition-colors">
                <span className="font-bold flex items-center gap-1 text-[12px]">
                  <Flame className="w-3.5 h-3.5 text-[#00ff41] animate-pulse" />
                  {config.symbols || "BTCUSDT"}
                </span>
                <span className="text-[9px] text-[#475569] group-hover:text-[#38bdf8] font-bold">ОТКРЫТЬ SCANNER</span>
              </div>
            </div>

            <div className="border-t border-[#1a2232]/30 pt-3 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[#64748b]">Paper Balance ($) / Баланс бумажного режима</span>
                <input 
                  type="number" 
                  step="500" 
                  min="100" 
                  className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0] outline-none focus:border-[#38bdf8] transition-colors" 
                  value={config.paperBalance ?? 12450} 
                  onChange={e => onChange({ paperBalance: parseFloat(e.target.value) || 0 })} 
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[#64748b]">Leverage / Плечо (x)</span>
                <input 
                  type="number" 
                  step="1" 
                  min="1" 
                  max="125" 
                  className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0] outline-none focus:border-[#38bdf8] transition-colors" 
                  value={config.execution.leverage ?? 20} 
                  onChange={e => onChange({ execution: { ...config.execution, leverage: parseInt(e.target.value) || 1 } })} 
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[#38bdf8] font-bold">Trade Margin / Сумма в сделку ($)</span>
                <input 
                  type="number" 
                  step="50" 
                  min="10" 
                  className="bg-[#050608] border border-[#38bdf8]/30 hover:border-[#38bdf8]/50 rounded px-2 py-1 text-[#38bdf8] outline-none focus:border-[#38bdf8] transition-colors font-bold" 
                  value={config.execution.tradeAmountUsd ?? 1000} 
                  onChange={e => onChange({ execution: { ...config.execution, tradeAmountUsd: parseFloat(e.target.value) || 10 } })} 
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer select-none py-1 border-b border-[#1a2232]/30 pb-2">
                <span className="text-[#ef4444]/80">Reduce sum by 50% on LTF levels</span>
                <input 
                  type="checkbox" 
                  className="w-3.5 h-3.5 accent-[#ef4444] cursor-pointer" 
                  checked={config.execution.reduceSizeOnLtf !== false} 
                  onChange={e => onChange({ execution: { ...config.execution, reduceSizeOnLtf: e.target.checked } })} 
                />
              </label>
            </div>

            <div className="border-t border-[#1a2232]/50 pt-3 mt-3">
              <span className="text-[#64748b] font-bold block mb-2 tracking-wider">ACTIVE MANAGEMENT</span>
              <div className="space-y-2">
                 <label className="flex items-center justify-between cursor-pointer select-none">
                   <span className="text-[#a0aec0]">Breakeven (Безубыток)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#38bdf8] cursor-pointer" 
                     checked={config.execution.breakevenEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, breakevenEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none">
                   <span className="text-[#a0aec0]">Trailing Stop (Трейлинг)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#38bdf8] cursor-pointer" 
                     checked={config.execution.trailingStopEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, trailingStopEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none">
                   <span className="text-[#a0aec0]">Partial Close (Частичный ТР)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#38bdf8] cursor-pointer" 
                     checked={config.execution.partialTakeProfitEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, partialTakeProfitEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none">
                   <span className="text-[#a0aec0]">Signal Exit (Встречный сигнал)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#38bdf8] cursor-pointer" 
                     checked={config.execution.signalExitEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, signalExitEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none">
                   <span className="text-[#a0aec0]">Fee + 0.1% (Комиссия + 0.1% TP/SL)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#38bdf8] cursor-pointer" 
                     checked={config.execution.feeExitEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, feeExitEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none">
                   <span className="text-[#f59e0b]">Predictive Liquidation (Предикт. Ликвид.)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#f59e0b] cursor-pointer" 
                     checked={config.execution.predictiveLiqEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, predictiveLiqEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none border-t border-[#1a2232]/50 pt-2 mt-1">
                   <span className="text-[#14b8a6] font-semibold"></span><span className="text-rose-500 font-bold hover:text-rose-400 transition-colors">Торговать говно (Low-Liq Mode)</span>
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 accent-rose-500 cursor-pointer" 
                      checked={config.execution.shitcoinMode || false} 
                      onChange={e => onChange({
                        execution: { ...config.execution, shitcoinMode: e.target.checked }
                      })} 
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer select-none border-t border-[#1a2232]/50 pt-2 mt-1">
                    <span className="text-[#38bdf8] font-semibold">Zone POC Decider (Решение на POC)</span>
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 accent-[#38bdf8] cursor-pointer" 
                      checked={config.execution.zoneTouchPocDeciderEnabled !== false} 
                      onChange={e => onChange({
                        execution: { ...config.execution, zoneTouchPocDeciderEnabled: e.target.checked }
                      })} 
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer select-none border-t border-[#1a2232]/50 pt-2 mt-1">
                    <span className="text-[#14b8a6] font-semibold">Precise Entry Mode (Точный вход)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-[#14b8a6] cursor-pointer" 
                     checked={config.execution.preciseEntryEnabled} 
                     onChange={e => onChange({
                       execution: { ...config.execution, preciseEntryEnabled: e.target.checked }
                     })} 
                   />
                 </label>
                 <label className="flex items-center justify-between cursor-pointer select-none border-t border-[#1a2232]/50 pt-2 mt-1">
                   <span className="text-amber-500 font-semibold">ЛП: Вход на возврате (Retrace Filter)</span>
                   <input 
                     type="checkbox" 
                     className="w-3.5 h-3.5 accent-amber-500 cursor-pointer" 
                     checked={config.execution.falseBreakoutDelayEnabled || false} 
                     onChange={e => onChange({
                       execution: { ...config.execution, falseBreakoutDelayEnabled: e.target.checked }
                     })} 
                   />
                 </label>
              </div>
            </div>
         </div>
       </div>

     </div>
   );
 }
