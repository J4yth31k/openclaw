export interface TradingViewAlert {
  symbol:       string;
  timeframe:    string;
  // Expanded action set — PriceFeed v2 sends BULLISH/BEARISH/OVERSOLD/OVERBOUGHT
  action:       'BUY' | 'SELL' | 'NEUTRAL' | 'BULLISH' | 'BEARISH' | 'OVERSOLD' | 'OVERBOUGHT';
  price:        number;
  bid?:         number;
  ask?:         number;
  volume?:      number;
  open?:        number;
  high?:        number;
  low?:         number;
  // Base indicators
  rsi?:         number;
  atr?:         number;
  vol_ratio?:   number;
  fast_ema?:    number;
  slow_ema?:    number;
  vwap?:        number;
  // Signal Forge / Scalping
  signal?:      string;   // Signal Forge: "5/6 (SMA|MACD|ST|STOCH|ADX)" | legacy: 'ribbon'|'squeeze'
  stoch_k?:     number;
  stoch_d?:     number;
  ema8?:        number;
  ema21?:       number;
  ema55?:       number;
  vwap_u1?:     number;
  vwap_l1?:     number;
  momentum?:    number;
  squeeze?:     boolean;
  ribbon_bull?: boolean;
  // ICT / PriceFeed v2 extras
  prev_high?:   number;
  prev_low?:    number;
  nwog_present?: boolean;
  nwog_level?:  number;
  eqh?:         boolean;
  eql?:         boolean;
  rsi_context?: string;
  level_hint?:  string;
  // Meta
  strategy?:    string;
  session?:     string;
  tier?:        'free' | 'premium';
  source?:      string;
}
