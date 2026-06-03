import { MicroMetrics } from '../types';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Bar, Cell } from 'recharts';

interface ChartsProps {
  data: MicroMetrics[];
}

export function Charts({ data }: ChartsProps) {
  const latestMetric = data.length > 0 ? data[data.length - 1] : null;
  const latestSpeed = latestMetric ? latestMetric.tapeSpeed : 0;
  const latestAccel = latestMetric ? latestMetric.tapeAcceleration : 1.0;
  const latestCVD = latestMetric ? latestMetric.cvdCumulative : 0.0;
  const latestOI = latestMetric ? latestMetric.openInterest : 1342.5;

  return (
    <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
      
      {/* Tape Speed & Baseline Chart */}
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-1.5 border-b border-[#1a2233] pb-1">
          <h3 className="text-[#64748b] font-mono text-[9px] uppercase tracking-wider">Скорость ленты & Базовый уровень (TR/S)</h3>
          <div className="flex items-center gap-2">
            <span className="text-[#38bdf8] font-mono font-bold text-[10px]">
              {latestSpeed} trade/s
            </span>
            <span className={`px-1 rounded text-[9px] font-mono font-bold leading-none py-0.5 ${latestAccel > 3.0 ? 'bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444]' : 'bg-[#1e293b] text-gray-400'}`}>
              ACCEL: {latestAccel.toFixed(1)}x
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis domain={[0, 'auto']} hide={true} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#070b14', borderColor: '#1a2233', fontSize: '10px', fontFamily: 'monospace' }} 
                itemStyle={{ color: '#38bdf8', padding: 0 }}
                labelStyle={{ display: 'none' }}
              />
              <Area 
                type="monotone" 
                dataKey="tapeSpeed" 
                name="Скор ленты"
                stroke="#38bdf8" 
                strokeWidth={1.5} 
                fillOpacity={1} 
                fill="url(#colorSpeed)" 
                isAnimationActive={false} 
              />
              <Line 
                type="monotone" 
                dataKey="tapeSpeedBaseline" 
                name="База (30s)"
                stroke="#6366f1" 
                strokeDasharray="3 3"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CVD Cumulative & Delta Histogram Chart */}
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-1.5 border-b border-[#1a2233] pb-1">
          <h3 className="text-[#64748b] font-mono text-[9px] uppercase tracking-wider">Кумулятивный CVD & Дельта (Контракты)</h3>
          <div className="flex items-center gap-2">
            <span className={`font-mono font-bold text-[10px] ${latestCVD >= 0 ? 'text-[#00ff41]' : 'text-[#ef4444]'}`}>
              CVD: {latestCVD >= 0 ? '+' : ''}{latestCVD.toFixed(2)}k
            </span>
            <span className="text-gray-400 font-mono text-[9px] border border-[#1a2233] px-1 bg-black/30 rounded">
              OI: ${latestOI.toFixed(1)}M
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <YAxis domain={['auto', 'auto']} hide={true} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#070b14', borderColor: '#1a2233', fontSize: '10px', fontFamily: 'monospace' }} 
                itemStyle={{ color: '#00ff41', padding: 0 }}
                labelStyle={{ display: 'none' }}
              />
              <Bar dataKey="cvdDelta" name="Интервал дельта" isAnimationActive={false}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.cvdDelta >= 0 ? '#00ff41' : '#ef4444'} opacity={0.3} />
                ))}
              </Bar>
              <Line 
                type="monotone" 
                dataKey="cvdCumulative" 
                name="Итого CVD"
                stroke="#22d3ee" 
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
