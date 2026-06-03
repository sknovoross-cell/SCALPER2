import React from 'react';
import { AppConfig } from '../types';

interface SettingsPanelProps {
  config: AppConfig;
  onChange: (c: Partial<AppConfig>) => void;
}

export function SettingsPanel({ config, onChange }: SettingsPanelProps) {
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
            <label className="flex flex-col gap-1">
              <span className="text-[#64748b]">Symbols</span>
              <input type="text" className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0]" value={config.symbols} onChange={e => onChange({symbols: e.target.value})} />
            </label>

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
              </div>
            </div>
         </div>
       </div>

      <div className="bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-3">
        <h3 className="text-[#38bdf8] font-bold mb-3 tracking-wider uppercase opacity-90">Filters [Rust Engine]</h3>
        <div className="space-y-3 relative">
           <label className="flex flex-col gap-1">
             <span className="text-[#64748b]">OI Growth Min (x)</span>
             <input type="number" step="0.1" className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0]" value={config.filters.oiGrowthMin} onChange={e => onChange({filters: {...config.filters, oiGrowthMin: parseFloat(e.target.value)}})} />
           </label>
           <label className="flex flex-col gap-1">
             <span className="text-[#64748b]">Tape Speed Mult (x)</span>
             <input type="number" step="0.1" className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0]" value={config.filters.tapeSpeedMultiplier} onChange={e => onChange({filters: {...config.filters, tapeSpeedMultiplier: parseFloat(e.target.value)}})} />
           </label>
           <label className="flex flex-col gap-1">
             <span className="text-[#64748b]">Spoof Lifetime (ms)</span>
             <input type="number" step="10" className="bg-[#050608] border border-[#1a2233] rounded px-2 py-1 text-[#e0e0e0]" value={config.filters.spoofingLifetimeMs} onChange={e => onChange({filters: {...config.filters, spoofingLifetimeMs: parseInt(e.target.value)}})} />
           </label>
        </div>
      </div>
      
    </div>
  );
}
