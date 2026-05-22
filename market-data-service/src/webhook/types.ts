export interface TradingViewAlert {
  symbol:       string;
  timeframe:    string;
  action:       'BUY' | 'SELL' | 'NEUTRAL';
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
  // Scalping indicators
  signal?:      string;   // 'ribbon' | 'squeeze'
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
  strategy?:    string;
  session?:     string;
  tier?:        'free' | 'premium';
  source?:      string;
}
