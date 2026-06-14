import { SignalEvent } from '../types';

interface SignalLogProps {
  signals: SignalEvent[];
}

export function SignalLog({ signals }: SignalLogProps) {
  return (
    <div className="w-[340px] border-l border-[#1a2233] bg-transparent p-4 shrink-0 flex flex-col font-mono text-[11px] z-10">
      
      <div className="bg-[#0a0f1d]/85 border border-[#1a2233] rounded-lg p-3 flex flex-col h-full">
        <h3 className="text-[#64748b] font-bold mb-3 tracking-wider uppercase">Лента сигналов (Micro-Tape)</h3>
        
        <div className="grid grid-cols-5 text-[#64748b] border-b border-[#1a2233] pb-1 mb-2 text-[10px]">
          <span className="col-span-1">Время</span>
          <span className="col-span-3">Сигнал & Комментарий</span>
          <span className="col-span-1 text-right">Цена</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {signals.length === 0 ? (
            <div className="text-[#64748b] text-center mt-10">Awaiting signals...</div>
          ) : (
            signals.map(s => {
              const isAlert = s.type === 'SYSTEM_ALERT';
              const isFiltered = s.message.includes('Filtration') || s.message.includes('Filtering') || s.message.includes('Active');
              
              let typeColor = 'text-[#00ff41]'; // Buy/Breakout default
              if (s.type === 'FALSE_BREAKOUT') {
                typeColor = 'text-[#38bdf8]'; // Blue
              } else if (s.type === 'ABSORPTION_FADE') {
                typeColor = 'text-[#f59e0b]'; // Amber
              } else if (isAlert) {
                if (isFiltered) {
                  typeColor = 'text-gray-500'; // Ignored/Filtered
                } else if (s.message.includes('Closed') || s.message.includes('Ended') || s.message.includes('Exit')) {
                  typeColor = 'text-red-400'; // Exit
                } else if (s.message.includes('Secured') || s.message.includes('Partial')) {
                  typeColor = 'text-emerald-400'; // Partial TP
                } else {
                  typeColor = 'text-purple-400'; // Normal alert/breakeven
                }
              }

              return (
                <div key={s.id} className="grid grid-cols-5 items-start gap-1 py-1.5 border-b border-[#1a2233]/40 last:border-0 leading-normal">
                  <span className="col-span-1 text-gray-500 text-[10px]">{s.timestamp.substring(11, 19)}</span>
                  <div className="col-span-3 flex flex-col">
                    <span className={`font-bold text-[10px] ${typeColor}`}>
                      {isAlert 
                        ? (isFiltered ? '⚙️ FILTERED' : s.message.includes('Closed') || s.message.includes('Exit') ? '🚪 EXIT' : s.message.includes('Secured') ? '💰 PARTIAL' : '🔔 INFO')
                        : s.type === 'FALSE_BREAKOUT' 
                          ? '⚡ FAKE_BO' 
                          : `🚀 ${s.type} [${s.side}]`
                      }
                    </span>
                    <span className="text-[10px] text-gray-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                      {s.message}
                    </span>
                  </div>
                  <span className="col-span-1 text-right font-semibold text-gray-200">
                    {s.price > 0 ? `$${s.price.toFixed(0)}` : '-'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
