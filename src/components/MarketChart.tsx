import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartCandle, LiquidityZone } from '../types';

interface MarketChartProps {
  data: ChartCandle[];
  zones: LiquidityZone[];
  timeframe: string;
  setTimeframe: (tf: string) => void;
}

export function MarketChart({ data, zones, timeframe, setTimeframe }: MarketChartProps) {
  // Use slightly larger domain window to see zones above/below current price
  const dataMin = data.length > 0 ? Math.min(...data.map(d => d.low)) : 64000;
  const dataMax = data.length > 0 ? Math.max(...data.map(d => d.high)) : 65000;
  
  // Dynamic Y-axis margins (padding) based on total scale of the active chart timeframe to prevent
  // lines and labels at the absolute top/bottom extremes from clashing with borders or time axis/ticks.
  const rangeY = dataMax - dataMin;
  const bufferY = Math.max(80, rangeY * 0.08);
  const minDomain = dataMin - bufferY;
  const maxDomain = dataMax + bufferY;

  // Filter zones that are relevant to the selected timeframe.
  // We want to see zones of the current active timeframe or structural levels from higher/senior timeframes.
  const tfWeights: { [key: string]: number } = {
    '1m': 1,
    '5m': 2,
    '15m': 3,
    '1h': 4,
    '4h': 5,
    '1d': 6
  };
  const activeWeight = tfWeights[timeframe] || 1;

  const relevantZones = zones.filter(z => {
    const zoneTf = z.timeframe || '1d';
    const zoneWeight = tfWeights[zoneTf] || 6;
    return zoneWeight >= activeWeight;
  });

  // Filter zones to current viewable scope and stagger overlapping labels
  const visibleZones = relevantZones.filter(z => z.price >= minDomain && z.price <= maxDomain);
  const sortedZones = [...visibleZones].sort((a, b) => a.price - b.price);
  
  const resolvedZones = sortedZones.map((z, index) => {
    let position: 'insideTopLeft' | 'insideBottomLeft' = 'insideTopLeft';
    
    // If this zone is practically touching the previous zone's label, swap its alignment to spread them apart
    if (index > 0) {
      const prevZone = sortedZones[index - 1];
      const priceDiff = z.price - prevZone.price;
      if (priceDiff < (maxDomain - minDomain) * 0.045) {
        position = 'insideBottomLeft';
      }
    }
    return { ...z, position };
  });

  return (
    <div className="flex-1 bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 flex flex-col z-10 w-full min-h-0 relative">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <div className="w-32 h-32 bg-[#38bdf8] rounded-full blur-[80px]"></div>
      </div>

      <div className="flex justify-between items-center mb-4 border-b border-[#1a2233]/50 pb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[11px] font-bold text-[#64748b] uppercase mb-0.5 tracking-wider">
            Карта Ликвидности (Real-time {timeframe.toUpperCase()} BTCUSDT)
          </h2>
          <p className="text-[9px] text-[#38bdf8] opacity-80 uppercase tracking-widest">
            Live Binance Futures Feed + HTF Key Pivot Level Mapping
          </p>
        </div>

        {/* Timeframe Button Group */}
        <div className="flex bg-[#1a2233]/40 p-0.5 rounded border border-[#1a2233] z-20">
          {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold leading-none cursor-pointer transition-all select-none ${
                timeframe === tf
                  ? 'bg-[#38bdf8] text-[#050608] shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                  : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/50'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#0a0f1d" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              stroke="#1a2233" 
              tick={{fill: '#64748b', fontSize: 10}} 
              tickLine={false} 
              axisLine={{stroke: '#1a2233'}}
              minTickGap={30}
            />
            <YAxis 
              domain={[minDomain, maxDomain]} 
              stroke="#1a2233" 
              tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} 
              orientation="right" 
              tickFormatter={(val) => val.toFixed(1)} 
              tickLine={false}
              axisLine={{stroke: '#1a2233'}}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#050608', borderColor: '#1a2233', fontSize: '11px', fontFamily: 'monospace' }} 
              itemStyle={{ color: '#00ff41' }} 
              labelStyle={{ color: '#64748b', marginBottom: '4px' }}
            />
            <Area 
              type="stepAfter" 
              dataKey="close" 
              stroke="#38bdf8" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorClose)" 
              isAnimationActive={false} 
            />

             {/* Pivot support/resistance and daily swing levels visual reference lines */}
            {resolvedZones.map((z, i) => {
              const isLtf = z.levelStrength === 'LTF';
              return (
                <ReferenceLine 
                  key={`line-${i}`} 
                  y={z.price} 
                  stroke={z.color} 
                  strokeOpacity={isLtf ? 0.35 : 0.75} 
                  strokeWidth={isLtf ? 1 : 1.5} 
                  strokeDasharray={isLtf ? "2 3" : "5 2"}
                >
                  <span className="fill-current text-[#1a2233] hidden"></span>
                </ReferenceLine>
              );
            })}

            {resolvedZones.map((z, i) => {
              const isLtf = z.levelStrength === 'LTF';
              const marker = isLtf ? 'LTF - Risk -50%' : 'HTF - Strong';
              return (
                <ReferenceLine 
                  key={`lbl-${i}`} 
                  y={z.price} 
                  stroke="none" 
                  label={{ 
                    position: z.position, 
                    value: `[${z.type}] ${z.price.toFixed(1)} (${marker})`, 
                    fill: z.color, 
                    fontSize: isLtf ? 9 : 10, 
                    fontFamily: 'monospace', 
                    fontWeight: isLtf ? 'normal' : 'bold',
                    opacity: isLtf ? 0.65 : 1
                  }} 
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
