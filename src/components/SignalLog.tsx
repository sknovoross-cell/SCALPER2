import { SignalEvent } from '../types';

interface SignalLogProps {
  signals: SignalEvent[];
}

export function SignalLog({ signals }: SignalLogProps) {
  return (
    <div className="w-[300px] border-l border-[#1a2233] bg-transparent p-4 shrink-0 flex flex-col font-mono text-[11px] z-10">
      
      <div className="bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-3 flex flex-col h-full">
        <h3 className="text-[#64748b] font-bold mb-3 tracking-wider uppercase">Лента сигналов (Micro-Tape)</h3>
        
        <div className="grid grid-cols-4 text-[#64748b] border-b border-[#1a2233] pb-1 mb-2 text-[10px]">
          <span>Время</span><span className="col-span-2">Сигнал</span><span>Цена</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {signals.length === 0 ? (
            <div className="text-[#64748b] text-center mt-10">Awaiting signals...</div>
          ) : (
            signals.map(s => (
              <div key={s.id} className={`grid grid-cols-4 items-start gap-1 py-1 border-b border-[#1a2233]/50 last:border-0 ${
                s.type === 'TRUE_BREAKOUT' ? 'text-[#00ff41]' :
                s.type === 'ABSORPTION_FADE' ? 'text-[#f59e0b]' :
                'text-[#ef4444]'
              }`}>
                <span>{s.timestamp.substring(11, 19)}</span>
                <div className="col-span-2 flex flex-col">
                  <span className="font-bold">[{s.type === 'SYSTEM_ALERT' ? 'ALERT' : s.side}]</span>
                  <span className="text-[10px] opacity-80 leading-tight mt-0.5" title={s.message}>{s.message.length > 25 ? s.message.substring(0, 25) + "..." : s.message}</span>
                </div>
                <span>{s.price > 0 ? s.price.toFixed(1) : '-'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
