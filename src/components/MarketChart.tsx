import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { ChartCandle, LiquidityZone, HistorisedTrade } from '../types';

interface MarketChartProps {
  data: ChartCandle[];
  zones: LiquidityZone[];
  timeframe: string;
  setTimeframe: (tf: string) => void;
  trades?: HistorisedTrade[];
}

export function MarketChart({ data, zones, timeframe, setTimeframe, trades = [] }: MarketChartProps) {
  const [hoveredZone, setHoveredZone] = useState<{ cx: number; cy: number; zone: LiquidityZone } | null>(null);

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

  // Helper to parse time string like "HH:MM:SS" or "HH:MM" into seconds from midnight
  const timeToSeconds = (tStr: string): number => {
    if (!tStr) return 0;
    const clean = tStr.replace(/[^\d:]/g, '');
    const parts = clean.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 3600 + parts[1] * 60;
    }
    return 0;
  };

  // Find the closest candlestick of the chart data for each trade timestamp so they can be plotted accurately on the XAxis time points
  const resolvedTrades = (trades || [])
    .map(trade => {
      if (!data || data.length === 0) return null;
      
      let closestCandle = data[0];
      
      if (timeframe === '1d') {
        closestCandle = data[data.length - 1];
      } else {
        const tradeSecs = timeToSeconds(trade.timestamp);
        let minDiff = Infinity;
        
        for (const candle of data) {
          const candleSecs = timeToSeconds(candle.time);
          const diff = Math.abs(candleSecs - tradeSecs);
          if (diff < minDiff) {
            minDiff = diff;
            closestCandle = candle;
          }
        }
      }
      
      return {
        ...trade,
        candleTime: closestCandle ? closestCandle.time : null
      };
    })
    .filter((t): t is (HistorisedTrade & { candleTime: string }) => t !== null && t.candleTime !== null);

  // Custom component for the left-side hoverable validation trigger dot
  const CustomZoneDot = (props: any) => {
    const { cx, cy, zone } = props;
    if (cx === undefined || cy === undefined) return null;
    
    // We render the dot slightly shifted to the left edge of the chart (cx is the chart area's coordinate)
    return (
      <g
        onMouseEnter={() => setHoveredZone({ cx, cy, zone })}
        onMouseLeave={() => setHoveredZone(null)}
        className="cursor-pointer font-sans"
      >
        <circle
          cx={cx}
          cy={cy}
          r={7}
          fill={zone.color}
          fillOpacity={0.25}
          className="animate-pulse"
        />
        <circle
          cx={cx}
          cy={cy}
          r={3.5}
          fill={zone.color}
          stroke="#050608"
          strokeWidth={1}
        />
      </g>
    );
  };

  const leftEdgeX = data.length > 0 ? data[1]?.time || data[0].time : undefined;

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
      
      {/* Absolute Validation Hover Card */}
      {hoveredZone && (
        <div 
          className="absolute z-50 bg-[#070b14]/95 border border-[#1a2233] p-3 rounded shadow-2xl w-72 text-[10px] pointer-events-none transition-all duration-150 backdrop-blur-md"
          style={{ 
            left: `${hoveredZone.cx + 20}px`, 
            top: `${Math.max(10, hoveredZone.cy - 50)}px` 
          }}
        >
          {/* Header */}
          <div className="flex justify-between items-center pb-1.5 border-b border-[#1a2233] mb-2 gap-2">
            <span className="font-bold text-[#e0e0e0] uppercase leading-none">{hoveredZone.zone.type}</span>
            <span className="text-[9px] text-[#64748b] bg-[#1a2233]/40 px-1 rounded font-mono shrink-0">
              {hoveredZone.zone.timeframe?.toUpperCase()}
            </span>
          </div>
          
          {/* Price & Updated Time */}
          <div className="flex justify-between text-[10px] mb-2 font-mono items-center">
            <span className="text-[#38bdf8] font-bold">${hoveredZone.zone.price.toFixed(1)}</span>
            <span className="text-[#64748b] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] inline-block animate-ping"></span>
              Обновлено: {hoveredZone.zone.updatedAt || 'н/д'}
            </span>
          </div>

          {/* Criteria List */}
          <div className="space-y-1.5">
            <p className="text-[#38bdf8]/80 uppercase text-[8px] tracking-wider font-bold mb-1">Критерии валидации:</p>
            {hoveredZone.zone.validationCriteria && hoveredZone.zone.validationCriteria.map((c, idx) => (
              <div key={idx} className="flex gap-1 items-start text-gray-300 leading-normal">
                <span className="text-[#38bdf8] shrink-0 mt-0.5">•</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: 15, bottom: 0 }}>
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

            {/* Left side interactive level-validation entry triggers */}
            {leftEdgeX && resolvedZones.map((z, i) => (
              <ReferenceDot
                key={`trigger-dot-${i}`}
                x={leftEdgeX}
                y={z.price}
                shape={<CustomZoneDot zone={z} />}
                isFront={true}
              />
            ))}

            {/* Historical Entry and Exit Trade point overlays */}
            {resolvedTrades.map((trade, idx) => {
              const isEntry = trade.type.includes('ENTRY') || trade.type.includes('MANUAL ENTRY');
              const isBuy = trade.side === 'BUY';
              const color = isBuy ? '#10b981' : '#f43f5e';
              
              return (
                <ReferenceDot
                  key={`trade-dot-${trade.id || idx}`}
                  x={trade.candleTime}
                  y={trade.price}
                  r={isEntry ? 6 : 4.5}
                  fill={isEntry ? color : '#050608'}
                  stroke={color}
                  strokeWidth={2}
                  isFront={true}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
