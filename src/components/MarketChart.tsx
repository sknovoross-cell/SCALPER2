import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid } from 'recharts';
import { ChartCandle, LiquidityZone, HistorisedTrade } from '../types';
import { 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  Grid, 
  Eye, 
  EyeOff, 
  RotateCcw,
  TrendingUp,
  Activity
} from 'lucide-react';

interface MarketChartProps {
  data: ChartCandle[];
  zones: LiquidityZone[];
  timeframe: string;
  setTimeframe: (tf: string) => void;
  trades?: HistorisedTrade[];
  isFullscreen?: boolean;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export function MarketChart({ 
  data, 
  zones, 
  timeframe, 
  setTimeframe, 
  trades = [],
  isFullscreen: controlledIsFullscreen,
  onFullscreenChange
}: MarketChartProps) {
  const [localIsFullscreen, setLocalIsFullscreen] = useState(false);
  
  const isFullscreen = controlledIsFullscreen !== undefined ? controlledIsFullscreen : localIsFullscreen;
  
  const setIsFullscreen = (val: boolean | ((prev: boolean) => boolean)) => {
    if (onFullscreenChange) {
      if (typeof val === 'function') {
        const next = val(isFullscreen);
        onFullscreenChange(next);
      } else {
        onFullscreenChange(val);
      }
    } else {
      if (typeof val === 'function') {
        setLocalIsFullscreen(val);
      } else {
        setLocalIsFullscreen(val);
      }
    }
  };
  const [chartType, setChartType] = useState<'area' | 'line'>('area');
  const [gridEnabled, setGridEnabled] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showPredLiq, setShowPredLiq] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [zoomCount, setZoomCount] = useState(100);
  const [yScaleBuffer, setYScaleBuffer] = useState(1.0);
  const [hoveredZone, setHoveredZone] = useState<{ cx: number; cy: number; zone: LiquidityZone } | null>(null);
  const [showSrDesk, setShowSrDesk] = useState(true);

  // Esc key listener for fullscreen exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const resetChartSettings = () => {
    setZoomCount(100);
    setYScaleBuffer(1.0);
    setChartType('area');
    setGridEnabled(true);
    setShowZones(true);
    setShowPredLiq(true);
    setShowTrades(true);
    setShowSrDesk(true);
  };

  // Slice visible data based on time zoom level
  const visibleData = data.slice(-zoomCount);

  // Use slightly larger domain window to see zones above/below current price
  let dataMin = visibleData.length > 0 ? Math.min(...visibleData.map(d => d.low)) : 64000;
  let dataMax = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.high)) : 65000;
  
  // Dynamic scale stretching: pull the nearest senior HTF support and resistance levels into the domain
  // so major HTF liquidity levels are clearly visible even on 1m, 5m or 15m charts!
  const currentPrice = visibleData.length > 0 ? visibleData[visibleData.length - 1].close : 64250;
  if (showZones && zones.length > 0) {
    const seniorZonesAbove = zones.filter(z => z.levelStrength === 'HTF' && z.price > currentPrice);
    const seniorZonesBelow = zones.filter(z => z.levelStrength === 'HTF' && z.price < currentPrice);
    
    if (seniorZonesAbove.length > 0) {
      const nearestAbove = Math.min(...seniorZonesAbove.map(z => z.price));
      if (nearestAbove - currentPrice < currentPrice * 0.035) { // within 3.5% range
        dataMax = Math.max(dataMax, nearestAbove + 35);
      }
    }
    if (seniorZonesBelow.length > 0) {
      const nearestBelow = Math.max(...seniorZonesBelow.map(z => z.price));
      if (currentPrice - nearestBelow < currentPrice * 0.035) { // within 3.5% range
        dataMin = Math.min(dataMin, nearestBelow - 35);
      }
    }
  }

  // Dynamic Y-axis margins (padding) based on total scale of the active chart timeframe to prevent
  // lines and labels at the absolute top/bottom extremes from clashing with borders or time axis/ticks.
  const rangeY = dataMax - dataMin;
  const baseBuffer = Math.max(80, rangeY * 0.08);
  const bufferY = baseBuffer * yScaleBuffer;
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

  // First filter by weight
  const minActiveFilteredZones = zones.filter(z => {
    const zoneTf = z.timeframe || '1d';
    const zoneWeight = tfWeights[zoneTf] || 6;
    return zoneWeight >= activeWeight;
  });

  // If we are looking at a lower timeframe, prune 1m and 5m zones to show only the most immediate support/resistance relative to currentPrice
  const m1Zones = minActiveFilteredZones.filter(z => z.timeframe === '1m');
  const m5Zones = minActiveFilteredZones.filter(z => z.timeframe === '5m');
  const seniorZones = minActiveFilteredZones.filter(z => z.timeframe !== '1m' && z.timeframe !== '5m');

  // Prune 1m zones: keep only the closest 3 below and 3 above the current price to prevent visual clutter
  const m1Below = m1Zones.filter(z => z.price < currentPrice).sort((a, b) => b.price - a.price).slice(0, 3);
  const m1Above = m1Zones.filter(z => z.price >= currentPrice).sort((a, b) => a.price - b.price).slice(0, 3);
  const prunedM1 = [...m1Below, ...m1Above];

  // Prune 5m zones: keep only the closest 4 below and 4 above
  const m5Below = m5Zones.filter(z => z.price < currentPrice).sort((a, b) => b.price - a.price).slice(0, 4);
  const m5Above = m5Zones.filter(z => z.price >= currentPrice).sort((a, b) => a.price - b.price).slice(0, 4);
  const prunedM5 = [...m5Below, ...m5Above];

  const relevantZones = [...seniorZones, ...prunedM1, ...prunedM5];

  // Filter zones to current viewable scope and stagger overlapping labels
  const visibleZones = relevantZones.filter(z => z.price >= minDomain && z.price <= maxDomain);
  const sortedZones = [...visibleZones].sort((a, b) => a.price - b.price);
  
  const resolvedZones = sortedZones
    .filter(z => {
      const isPredLiq = z.type.startsWith("PRED LIQ");
      const isActivePosLiq = z.type === "ACTIVE POS LIQ";
      if (!showZones && !isPredLiq && !isActivePosLiq) return false;
      if (!showPredLiq && (isPredLiq || isActivePosLiq)) return false;
      return true;
    })
    .map((z, index, arr) => {
      let position: 'insideTopLeft' | 'insideBottomLeft' = 'insideTopLeft';
      
      // If this zone is practically touching the previous zone's label, swap its alignment to spread them apart
      if (index > 0) {
        const prevZone = arr[index - 1];
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
      if (!visibleData || visibleData.length === 0) return null;
      
      let closestCandle = visibleData[0];
      
      if (timeframe === '1d') {
        closestCandle = visibleData[visibleData.length - 1];
      } else {
        const tradeSecs = timeToSeconds(trade.timestamp);
        let minDiff = Infinity;
        
        for (const candle of visibleData) {
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

  const leftEdgeX = visibleData.length > 0 ? visibleData[1]?.time || visibleData[0].time : undefined;

  const containerClasses = isFullscreen 
    ? "fixed inset-0 z-[9999] bg-[#070b14] flex flex-col p-6 w-screen h-screen overflow-hidden" 
    : "flex-1 bg-[#0a0f1d]/80 border border-[#1a2233] rounded-lg p-4 flex flex-col z-10 w-full min-h-0 relative";

  return (
    <div className={containerClasses} id="tradingview-chart-container">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <div className="w-32 h-32 bg-[#38bdf8] rounded-full blur-[80px]"></div>
      </div>

      {/* Main Title & Timeframes Row */}
      <div className="flex justify-between items-center mb-4 border-b border-[#1a2233]/50 pb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[11px] font-bold text-[#64748b] uppercase mb-0.5 tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse"></span>
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

      {/* TradingView-style Interactive Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-[#111827]/65 border border-[#1a2233]/50 rounded-md px-3 py-1.5 mb-3 text-xs flex-wrap z-20">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Chart Type Toggle */}
          <div className="flex items-center gap-1 border-r border-[#1a2233]/50 pr-4">
            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider select-none">Вид:</span>
            <button
              onClick={() => setChartType('area')}
              className={`p-1 rounded transition-all cursor-pointer ${chartType === 'area' ? 'text-[#38bdf8] bg-[#38bdf8]/15' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Область (Area)"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`p-1 rounded transition-all cursor-pointer ${chartType === 'line' ? 'text-[#38bdf8] bg-[#38bdf8]/15' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Линия (Line)"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Grid Toggle */}
          <div className="flex items-center gap-1 border-r border-[#1a2233]/50 pr-4">
            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider select-none mr-1">Сетка:</span>
            <button
              onClick={() => setGridEnabled(!gridEnabled)}
              className={`p-1 rounded transition-all cursor-pointer flex items-center ${gridEnabled ? 'text-[#38bdf8] bg-[#38bdf8]/15' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Вкл/Выкл сетку"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Visibility Layers */}
          <div className="flex items-center gap-1 border-r border-[#1a2233]/50 pr-4">
            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider select-none mr-1">Слои ТА:</span>
            <button
              onClick={() => setShowZones(!showZones)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 border border-transparent ${showZones ? 'text-green-400 bg-green-400/15 border-green-500/20' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Панель технического анализа (S/R)"
            >
              {showZones ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span className="text-[9px] font-bold font-mono">S/R</span>
            </button>
            <button
              onClick={() => setShowPredLiq(!showPredLiq)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 border border-transparent ${showPredLiq ? 'text-yellow-400 bg-yellow-400/15 border-yellow-500/20' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Предиктивные ликвидации (Liquidity)"
            >
              {showPredLiq ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span className="text-[9px] font-bold font-mono">LIQ</span>
            </button>
            <button
              onClick={() => setShowTrades(!showTrades)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 border border-transparent ${showTrades ? 'text-indigo-400 bg-indigo-400/15 border-indigo-500/20' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Сделки на графике"
            >
              {showTrades ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span className="text-[9px] font-bold font-mono">TRADES</span>
            </button>
            <button
              onClick={() => setShowSrDesk(!showSrDesk)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 border border-transparent ${showSrDesk ? 'text-[#38bdf8] bg-[#38bdf8]/15 border-[#38bdf8]/20' : 'text-gray-400 hover:text-white hover:bg-[#1a2233]/30'}`}
              title="Панель Деска S/R Ликвидности"
            >
              <Activity className="w-3 h-3" />
              <span className="text-[9px] font-bold font-mono font-sans">S/R DESK</span>
            </button>
          </div>

          {/* Time Zoom Controls */}
          <div className="flex items-center gap-2 border-r border-[#1a2233]/50 pr-4">
            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider select-none">Зум:</span>
            <button
              onClick={() => setZoomCount(prev => Math.max(20, prev - 15))}
              className="p-1 text-gray-400 hover:text-white hover:bg-[#1a2233]/30 rounded cursor-pointer transition-all"
              title="Сфокусировать / Приблизить свечи"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono font-bold text-gray-300 w-9 text-center select-none bg-[#111827] px-1 py-0.5 rounded border border-[#1a2233]/60">{zoomCount}б</span>
            <button
              onClick={() => setZoomCount(prev => Math.min(250, prev + 15))}
              className="p-1 text-gray-400 hover:text-white hover:bg-[#1a2233]/30 rounded cursor-pointer transition-all"
              title="Вся история / Отдалить свечи"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Vertical Scale (Stretch / Compress) */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold text-[#64748b] tracking-wider select-none">Высота Y:</span>
            <input
              type="range"
              min="0.3"
              max="2.5"
              step="0.1"
              value={yScaleBuffer}
              onChange={(e) => setYScaleBuffer(parseFloat(e.target.value))}
              className="w-16 h-1 bg-[#1a2233] rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
              title="Масштаб амплитуды по вертикали"
            />
            <span className="text-[9px] font-mono text-[#38bdf8] font-bold select-none">{yScaleBuffer.toFixed(1)}x</span>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          {/* Reset settings */}
          <button
            onClick={resetChartSettings}
            className="p-1.5 text-gray-400 hover:text-[#38bdf8] hover:bg-[#38bdf8]/15 rounded flex items-center gap-1 transition-all cursor-pointer border border-[#1a2233]/40"
            title="Сбросить все параметры"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[9px] font-bold uppercase tracking-wider hidden sm:inline">Сброс</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-[#38bdf8] hover:bg-[#38bdf8]/15 border border-[#38bdf8]/30 rounded flex items-center gap-1.5 transition-all cursor-pointer font-bold shadow-[0_0_8px_rgba(55,189,248,0.05)]"
            title={isFullscreen ? "Выйти из полного экрана [Esc]" : "Развернуть во весь экран"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-wider">Свернуть</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-wider">Весь экран</span>
              </>
            )}
          </button>
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

          {/* Dynamic Validity Score Block */}
          {(() => {
            let score = 40; // Base score
            const zone = hoveredZone.zone;
            
            // Timeframe contribution
            if (zone.timeframe === '1d') score += 30;
            else if (zone.timeframe === '4h') score += 25;
            else if (zone.timeframe === '1h') score += 15;
            else if (zone.timeframe === '15m') score += 10;
            else if (zone.timeframe === '5m') score += 5;

            // Structural strength contribution
            if (zone.levelStrength === 'HTF') {
              score += 25;
            } else {
              score += 10;
            }

            // Volume indicator presence (if volume is above average)
            if (zone.volumeScore && zone.volumeScore > 1000) {
              score += 10;
            }
            
            // Open Interest contribution
            if (zone.oiScore && Math.abs(zone.oiScore) > 5) {
              score += 10;
            }

            const finalScore = Math.min(100, Math.max(30, score));
            
            let colorClass = "text-[#f43f5e]";
            let bgClass = "bg-[#f43f5e]/5 border-[#f43f5e]/15";
            let barColor = "bg-[#f43f5e]";
            let statusText = "ЛОКАЛЬНЫЙ ТЕСТ (КРАТКОСРОЧНЫЙ)";
            
            if (finalScore >= 80) {
              colorClass = "text-[#00ff41] drop-shadow-[0_0_6px_rgba(0,255,65,0.4)]";
              bgClass = "bg-[#00ff41]/5 border-[#00ff41]/20";
              barColor = "bg-[#00ff41] shadow-[0_0_8px_rgba(0,255,65,0.6)]";
              statusText = "АБСОЛЮТНАЯ ВАЛИДНОСТЬ (HTF)";
            } else if (finalScore >= 55) {
              colorClass = "text-[#fbbf24] drop-shadow-[0_0_5px_rgba(251,191,36,0.3)]";
              bgClass = "bg-[#fbbf24]/5 border-[#fbbf24]/15";
              barColor = "bg-[#fbbf24]";
              statusText = "ПОДТВЕРЖДЕН КЛАСТЕРОМ VAP";
            }
            
            return (
              <div className={`p-2 rounded border ${bgClass} mb-2.5 flex flex-col gap-1.5`}>
                <div className="flex justify-between items-center">
                  <span className="text-[8px] uppercase tracking-wider text-gray-400 font-bold font-sans">Оценка уровня:</span>
                  <span className={`text-[10px] font-extrabold font-mono ${colorClass}`}>{finalScore}%</span>
                </div>
                
                {/* Visual Progress Bar */}
                <div className="w-full bg-[#111827] h-1.5 rounded-full overflow-hidden border border-gray-800">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${finalScore}%` }}></div>
                </div>

                <div className="flex items-center gap-1">
                  <TrendingUp className={`w-3 h-3 ${colorClass}`} />
                  <span className={`text-[8px] uppercase tracking-normal font-sans font-extrabold ${colorClass}`}>
                    {statusText}
                  </span>
                </div>
              </div>
            );
          })()}

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

      {/* Main Chart Canvas & S/R Desk combined flex container */}
      <div className="flex flex-1 min-h-0 w-full gap-4 flex-col lg:flex-row relative">
        {/* Main Chart Canvas Area */}
        <div className="flex-1 min-h-[350px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={visibleData} margin={{ top: 15, right: 5, left: 15, bottom: 0 }}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#0a0f1d" stopOpacity={0}/>
              </linearGradient>
            </defs>

            {gridEnabled && (
              <CartesianGrid 
                stroke="#1a2233" 
                strokeDasharray="3 3" 
                opacity={0.25} 
                vertical={true}
                horizontal={true}
              />
            )}

            <XAxis 
              dataKey="time" 
              stroke="#1a2233" 
              tick={{fill: '#64748b', fontSize: 10}} 
              tickLine={false} 
              axisLine={{stroke: '#1a2233'}}
              minTickGap={35}
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
              itemStyle={{ color: '#38bdf8' }} 
              labelStyle={{ color: '#64748b', marginBottom: '4px' }}
            />
            <Area 
              type="stepAfter" 
              dataKey="close" 
              stroke="#38bdf8" 
              strokeWidth={2}
              fillOpacity={chartType === 'area' ? 1 : 0} 
              fill="url(#colorClose)" 
              isAnimationActive={false} 
            />

             {/* Pivot support/resistance and daily swing levels visual reference lines */}
            {resolvedZones.map((z, i) => {
              const isLtf = z.levelStrength === 'LTF';
              const isBroken = z.isBroken;
              return (
                <ReferenceLine 
                  key={`line-${i}`} 
                  y={z.price} 
                  stroke={isBroken ? "#475569" : z.color} 
                  strokeOpacity={isBroken ? 0.2 : (isLtf ? 0.35 : 0.75)} 
                  strokeWidth={isLtf ? 1 : 1.5} 
                  strokeDasharray={isBroken ? "1 5" : (isLtf ? "2 3" : "5 2")}
                />
              );
            })}

            {resolvedZones.map((z, i) => {
              const isLtf = z.levelStrength === 'LTF';
              const isBroken = z.isBroken;
              const marker = isBroken ? 'BROKEN / PASSIVE' : (isLtf ? 'LTF - Risk -50%' : 'HTF - Strong');
              return (
                <ReferenceLine 
                  key={`lbl-${i}`} 
                  y={z.price} 
                  stroke="none" 
                  label={{ 
                    position: z.position, 
                    value: `[${z.type}] ${z.price.toFixed(1)} (${marker})`, 
                    fill: isBroken ? "#475569" : z.color, 
                    fontSize: isLtf ? 9 : 10, 
                    fontFamily: 'monospace', 
                    fontWeight: isBroken ? 'normal' : (isLtf ? 'normal' : 'bold'),
                    opacity: isBroken ? 0.35 : (isLtf ? 0.65 : 1)
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
            {showTrades && resolvedTrades.map((trade, idx) => {
              const isBuy = trade.side === 'BUY';
              const isEntry = trade.type.includes('ENTRY') || trade.type.includes('MANUAL ENTRY');
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

      {/* S/R Desk Real-time Sidebar */}
      {showSrDesk && (
        <div className="w-full lg:w-72 bg-[#090d16] border border-[#1a2233] rounded-lg p-3 flex flex-col font-mono shrink-0 max-h-[500px] lg:max-h-none overflow-hidden select-none">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#1a2233]/40">
            <span className="text-[11px] font-bold text-[#38bdf8] uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              ДЕСК ЛИКВИДНОСТИ (S/R)
            </span>
            <button 
              onClick={() => setShowSrDesk(false)}
              className="text-gray-400 hover:text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#1a2233]/30 border border-[#1a2233]/50 hover:bg-[#1a2233]/70 cursor-pointer"
            >
              Скрыть
            </button>
          </div>

          {/* List of active levels mapped with CVD and OI volume scores */}
          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            {zones.length === 0 ? (
              <div className="text-gray-500 text-xs text-center py-10">Загрузка сеток ликвидности...</div>
            ) : (
              [...zones]
                .sort((a, b) => {
                  const tfWeights: { [key: string]: number } = { '1d': 6, '4h': 5, '1h': 4, '15m': 3, '5m': 2, '1m': 1 };
                  return (tfWeights[b.timeframe || '1d'] || 0) - (tfWeights[a.timeframe || '1d'] || 0);
                })
                .map((z, idx) => {
                  const isResist = z.price >= currentPrice;
                  const isHTF = z.levelStrength === 'HTF';
                  
                  return (
                    <div 
                      key={idx}
                      onClick={() => {
                        // Interactive focus trigger: temporarily stretch domain to highlight this row
                        setYScaleBuffer(Math.abs(z.price - currentPrice) / (currentPrice * 0.05) + 0.3);
                      }}
                      className={`p-2 rounded border transition-all cursor-pointer hover:bg-[#111827]/75 hover:border-gray-500/30 flex flex-col gap-1.5 ${
                        isResist ? 'bg-[#f43f5e]/5 border-[#f43f5e]/10' : 'bg-[#10b981]/5 border-[#10b981]/10'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: z.color }}></span>
                          <span className="text-[10px] font-bold text-gray-200">
                            {(z.timeframe || '1m').toUpperCase()} {isResist ? 'СОПРОТИВЛЕНИЕ' : 'ПОДДЕРЖКА'}
                          </span>
                        </div>
                        {isHTF && (
                          <span className="text-[8px] px-1 font-sans rounded bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20 tracking-wider">HTF</span>
                        )}
                      </div>

                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-bold text-gray-100 font-mono">
                          ${z.price.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                        <span className="text-[9px] text-[#64748b] font-sans">
                          {Math.abs(z.price - currentPrice) < 150 ? '📍 У цены' : `~${Math.round(Math.abs(z.price - currentPrice))} USD`}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 pt-1.5 text-[8px] uppercase tracking-normal border-t border-[#1a2233]/40 text-gray-400 font-sans font-medium">
                        <div>
                          <span className="text-[#64748b] text-[8px]">Vol (BTC):</span>
                          <div className="text-gray-300 font-bold mt-0.5">{(z.volumeScore || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div>
                          <span className="text-[#64748b] text-[8px]">Delta:</span>
                          <div className={`font-bold mt-0.5 ${z.cvdScore && z.cvdScore > 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                            {z.cvdScore && z.cvdScore > 0 ? '+' : ''}{(z.cvdScore || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        <div>
                          <span className="text-[#64748b] text-[8px]">OI Change:</span>
                          <div className="text-[#38bdf8] font-bold mt-0.5 font-mono">
                            {z.oiScore && z.oiScore > 0 ? `+` : ''}{(z.oiScore || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  </div>
);
}
