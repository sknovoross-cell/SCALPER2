export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  takerVolume?: number;
  cvd?: number;
  oi?: number;
}

export interface LiquidityZone {
  price: number;
  type: string;
  color: string;
  levelStrength?: 'HTF' | 'LTF';
  timeframe?: string;
  updatedAt?: string;
  validationCriteria?: string[];
  volumeScore?: number;
  cvdScore?: number;
  oiScore?: number;
  touchesCount?: number;
  isBroken?: boolean;
  lastTouchTimestamp?: number;
}

export interface TradePosition {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  size: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  timestamp: string;
  createdAt?: number;
  strategyType?: 'BREAKOUT' | 'ABSORPTION_FADE';
  timeframe?: string;
  tpPrice?: number;
  slPrice?: number;
  maxFavPrice?: number;
  hasPartialTP?: boolean;
}

export interface HistorisedTrade {
  id: string;
  timestamp: string;
  type: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl?: number;
  strategyType?: 'BREAKOUT' | 'ABSORPTION_FADE';
}

export interface AppConfig {
  exchange: string;
  symbols: string;
  mode: 'paper' | 'live';
  latencyBudget: number;
  risk: {
    maxDailyDDPct: number;
    maxPositionPct: number;
    kellyFraction: number;
    atrStopMultiplier: number;
    consecutiveLossPause: number;
  };
  filters: {
    htfLookbackBars: number;
    swingThresholdPct: number;
    oiGrowthMin: number;
    consolidationStdMax: number;
    tapeSpeedMultiplier: number;
    spoofingLifetimeMs: number;
    icebergStabilityTicks: number;
  };
  execution: {
    entryType: string;
    maxSlippageTicks: number;
    tpRr: string;
    timeExitSec: number;
    breakevenEnabled: boolean;
    trailingStopEnabled: boolean;
    partialTakeProfitEnabled: boolean;
    signalExitEnabled: boolean;
    feeExitEnabled: boolean;
    predictiveLiqEnabled: boolean;
  };
}

export type MachineState = 
  | 'SCANNING' 
  | 'APPROACHING' 
  | 'ARMED' 
  | 'EXECUTING' 
  | 'POSITION_OPEN' 
  | 'COOLDOWN';

export interface MicroMetrics {
  time: string;
  tapeSpeed: number;
  tapeSpeedBaseline: number;
  tapeAcceleration: number;
  cvdDelta: number;
  cvdCumulative: number;
  obImbalance: number;
  price: number;
  openInterest: number;
}

export interface SignalEvent {
  id: string;
  timestamp: string;
  type: 'TRUE_BREAKOUT' | 'ABSORPTION_FADE' | 'SYSTEM_ALERT';
  side: 'BUY' | 'SELL' | 'NONE';
  price: number;
  message: string;
}
