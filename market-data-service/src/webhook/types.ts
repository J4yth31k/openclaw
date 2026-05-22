export interface TradingViewAlert {
  symbol:     string;
  timeframe:  string;
  action:     'BUY' | 'SELL' | 'NEUTRAL';
  price:      number;
  bid?:       number;
  ask?:       number;
  volume?:    number;
  open?:      number;
  high?:      number;
  low?:       number;
  rsi?:       number;
  atr?:       number;
  vol_ratio?: number;
  fast_ema?:  number;
  slow_ema?:  number;
  vwap?:      number;
  strategy?:  string;
  session?:   string;
  tier?:      'free' | 'premium';
  source?:    string;
}
