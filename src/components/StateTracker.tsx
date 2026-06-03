import { MachineState } from '../types';

interface StateTrackerProps {
  currentState: MachineState;
  halted: boolean;
}

const STATES: MachineState[] = [
  'SCANNING',
  'APPROACHING',
  'ARMED',
  'EXECUTING',
  'POSITION_OPEN',
  'COOLDOWN'
];

export function StateTracker({ currentState, halted }: StateTrackerProps) {
  return (
    <div className="space-y-2">
      {STATES.map((s, i) => {
        const isActive = currentState === s && !halted;
        const currentIndex = STATES.indexOf(currentState);
        const isPassed = !halted && i < currentIndex;
        
        if (isActive) {
          return (
            <div key={s} className="flex items-center gap-3 text-[11px] bg-[#38bdf8]/10 text-[#38bdf8] p-1 rounded">
              <div className="w-6 h-6 rounded border border-[#38bdf8] flex items-center justify-center font-bold">0{i+1}</div>
              <span className="font-bold uppercase tracking-wider">{s} [ACTIVE]</span>
            </div>
          )
        }

        if (isPassed) {
          return (
             <div key={s} className="flex items-center gap-3 text-[11px] opacity-40">
              <div className="w-6 h-6 rounded border border-[#1a2233] flex items-center justify-center italic text-[#00ff41]">0{i+1}</div>
              <span className="text-[#e0e0e0]">{s} [OK]</span>
            </div>
          )
        }

        return (
          <div key={s} className="flex items-center gap-3 text-[11px] opacity-20">
            <div className="w-6 h-6 rounded border border-gray-600 flex items-center justify-center italic">0{i+1}</div>
            <span>{s}</span>
          </div>
        )
      })}
      
      {halted && (
        <div className="mt-4 p-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-[#ef4444] font-mono text-[11px] flex items-center justify-center animate-pulse">
           ⚠️ ЕРРОР / EMERGENCY HALT. FSM LOCKED.
        </div>
      )}
    </div>
  );
}
