import React, { useState, useEffect, useRef } from 'react';
import { Search, Flame, TrendingUp, TrendingDown, DollarSign, X, ShieldAlert, Sparkles } from 'lucide-react';

interface TickerData {
  symbol: string;
  priceChangePercent: number;
  quoteVolume: number;
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  isInPlay: boolean;
}

interface SymbolSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function SymbolSelectorModal({ isOpen, onClose, currentSymbol, onSelectSymbol }: SymbolSelectorModalProps) {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'inplay' | 'all' | 'gainers' | 'losers'>('inplay');
  const [error, setError] = useState<string | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load symbols on mount/open
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);
    
    // Auto-focus search input
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    fetch('/api/tickers24h')
      .then((res) => {
        if (!res.ok) throw new Error('Ошибка загрузки данных котировок');
        return res.json();
      })
      .then((data: TickerData[]) => {
        setTickers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch tickers:', err);
        setError('Не удалось подключиться к шлюзу Binance. Используются резервные котировки.');
        setLoading(false);
      });
  }, [isOpen]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Formatting utilities
  const formatVolume = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const formatPrice = (val: number) => {
    if (val < 0.001) return val.toFixed(6);
    if (val < 1) return val.toFixed(4);
    if (val < 100) return val.toFixed(3);
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Filtering list
  const filteredTickers = tickers.filter((t) => {
    const matchesSearch = t.symbol.toLowerCase().includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;

    switch (tab) {
      case 'inplay':
        return t.isInPlay;
      case 'gainers':
        return t.priceChangePercent > 0;
      case 'losers':
        return t.priceChangePercent < 0;
      case 'all':
      default:
        return true;
    }
  });

  // Secondary sort for Gainers / Losers to make tabs useful
  const sortedTickers = [...filteredTickers].sort((a, b) => {
    if (tab === 'gainers') {
      return b.priceChangePercent - a.priceChangePercent;
    }
    if (tab === 'losers') {
      return a.priceChangePercent - b.priceChangePercent;
    }
    // Default pre-sorted by InPlay + volume
    return b.quoteVolume - a.quoteVolume;
  });

  const handleSelect = (symbol: string) => {
    onSelectSymbol(symbol);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div 
        ref={modalRef}
        id="symbol-selector-modal-box"
        className="w-full max-w-xl bg-[#090e1a] border border-[#1a2233] rounded-xl flex flex-col h-[520px] shadow-2xl overflow-hidden font-mono"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3.5 border-b border-[#1a2233] bg-[#0c1324]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00ff41] animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-[#e0e0e0] uppercase tracking-wide">Выбор Торгового Актива</h2>
              <p className="text-[9px] text-[#64748b] uppercase tracking-wider">Суточный сканер Binance Futures USDT-M</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-[#64748b] hover:text-[#e0e0e0] hover:bg-white/5 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="p-3 bg-[#070b14] border-b border-[#1a2233] flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="h-3.5 w-3.5 text-[#64748b]" />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Поиск инструмента (например: DOGE, BTC...)"
              className="w-full bg-[#03050a] border border-[#1a2233] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#e0e0e0] placeholder-[#475569] outline-none focus:border-[#38bdf8] transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex bg-[#05080f] px-3 pt-2 gap-1 border-b border-[#1a2233]">
          <button
            type="button"
            onClick={() => setTab('inplay')}
            className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 transition-all
              ${tab === 'inplay' 
                ? 'border-[#00ff41] text-[#00ff41] bg-[#00ff41]/5' 
                : 'border-transparent text-[#64748b] hover:text-[#e0e0e0]'}`}
          >
            <Flame className="w-3 h-3 fill-current" />
            В игре / In-Play
            {tickers.length > 0 && (
              <span className="ml-1 text-[8px] px-1.5 py-0.5 rounded-full bg-[#00ff41]/10 text-[#00ff41]">
                {tickers.filter(t => t.isInPlay).length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 transition-all
              ${tab === 'all' 
                ? 'border-[#38bdf8] text-[#38bdf8] bg-[#38bdf8]/5' 
                : 'border-transparent text-[#64748b] hover:text-[#e0e0e0]'}`}
          >
            <DollarSign className="w-3 h-3" />
            Все USDT
          </button>
          <button
            type="button"
            onClick={() => setTab('gainers')}
            className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 transition-all
              ${tab === 'gainers' 
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                : 'border-transparent text-[#64748b] hover:text-[#e0e0e0]'}`}
          >
            <TrendingUp className="w-3 h-3" />
            Лидеры роста
          </button>
          <button
            type="button"
            onClick={() => setTab('losers')}
            className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 transition-all
              ${tab === 'losers' 
                ? 'border-[#ef4444] text-[#ef4444] bg-[#ef4444]/5' 
                : 'border-transparent text-[#64748b] hover:text-[#e0e0e0]'}`}
          >
            <TrendingDown className="w-3 h-3" />
            Лидеры падения
          </button>
        </div>

        {/* Warning / Error notice */}
        {error && (
          <div className="bg-[#ef4444]/10 border-b border-[#ef4444]/20 p-2 text-[10px] text-[#ef4444] flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Table Header */}
        <div className="grid grid-cols-24 px-4 py-2 border-b border-[#1a2233]/40 bg-[#060a12]/50 text-[9px] text-[#64748b] uppercase tracking-wider font-bold">
          <div className="col-span-8">Инструмент</div>
          <div className="col-span-5 text-right">Последняя цена</div>
          <div className="col-span-5 text-right">24ч Изм.</div>
          <div className="col-span-6 text-right">Объем 24ч</div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto bg-[#04060b]">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[#1a2233]/40 rounded w-1/3"></div>
                  <div className="h-4 bg-[#1a2233]/40 rounded w-1/4 ml-auto"></div>
                  <div className="h-4 bg-[#1a2233]/40 rounded w-1/5 ml-auto"></div>
                </div>
              ))}
            </div>
          ) : sortedTickers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-[#64748b]">
              <Search className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-[11px] uppercase tracking-wide">Активы не обнаружены</p>
              <p className="text-[9px] opacity-70 mt-1">Ослабьте критерии поиска или смените вкладку.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1a2233]/20">
              {sortedTickers.map((t) => {
                const isActive = t.symbol.toUpperCase() === currentSymbol.toUpperCase();
                const isPositive = t.priceChangePercent >= 0;
                
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => handleSelect(t.symbol)}
                    className={`grid grid-cols-24 px-4 py-2 text-[11px] font-mono items-center w-full text-left transition-colors cursor-pointer
                      ${isActive 
                        ? 'bg-[#1e3a8a]/30 text-[#38bdf8] border-l-2 border-[#38bdf8]' 
                        : 'text-[#e0e0e0] hover:bg-[#111827]/60'}`}
                  >
                    {/* Symbol / Badges */}
                    <div className="col-span-8 flex items-center gap-1.5 min-w-0">
                      <span className="font-bold tracking-tight truncate">{t.symbol}</span>
                      {t.isInPlay && (
                        <span 
                          className="text-[8px] bg-[#00ff41]/10 text-[#00ff41] px-1 py-0.5 rounded font-bold border border-[#00ff41]/20 shadow-[0_0_4px_rgba(0,255,65,0.1)] shrink-0"
                          title="Высокая волатильность и объемы - инструмент в игре!"
                        >
                          В игре
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="col-span-5 text-right font-mono font-medium tabular-nums text-[#cbd5e1]">
                      ${formatPrice(t.lastPrice)}
                    </div>

                    {/* priceChangePercent */}
                    <div className={`col-span-5 text-right font-bold tabular-nums
                      ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isPositive ? '+' : ''}{t.priceChangePercent.toFixed(2)}%
                    </div>

                    {/* quoteVolume */}
                    <div className="col-span-6 text-right tabular-nums text-[#94a3b8] font-medium">
                      ${formatVolume(t.quoteVolume)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info stats */}
        <div className="px-4 py-2 border-t border-[#1a2233] bg-[#070b14] flex justify-between items-center text-[9px] text-[#64748b] uppercase tracking-wider font-bold">
          <span>Отображается: {sortedTickers.length} из {tickers.length} USDT пар</span>
          <span className="flex items-center gap-1 text-[#00ff41]/80">
            <Flame className="w-2.5 h-2.5" /> В игре: {tickers.filter(t => t.isInPlay).length} монет
          </span>
        </div>
      </div>
    </div>
  );
}
