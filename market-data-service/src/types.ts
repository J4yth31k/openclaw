export type ProviderStatus = 'connecting' | 'connected' | 'delayed' | 'offline';

export type SessionStatus =
  | 'RTH'
  | 'PRE-MARKET'
  | 'POST-MARKET'
  | 'OVERNIGHT'
  | 'CLOSED';

export interface Quote {
  symbol: string;      // Root symbol (NQ, not NQM26)
  contract: string;    // Active front-month (NQM26)
  exchange: string;    // CME, NYMEX, COMEX, FOREX, CRYPTO
  price: number;       // Last trade price
  bid: number;
  ask: number;
  volume: number;      // Day volume
  timestamp: number;   // Unix ms
  sessionStatus: SessionStatus;
}

/** OHLCV bar — times in Unix seconds (TradingView Lightweight Charts convention). */
export interface Bar {
  symbol: string;
  resolution: string;  // '1', '5', '15', '60', 'D'
  t: number;           // Bar open time, Unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ContractSpec {
  root: string;        // NQ
  active: string;      // NQM26
  exchange: string;    // CME
  expiry: string;      // ISO date YYYY-MM-DD
  rollDate: string;    // ISO date YYYY-MM-DD (switch contracts before this)
  description: string;
  tickSize: number;    // Minimum price increment
  tickValue: number;   // $ value per tick
  pointValue: number;  // $ value per full point
  currency: string;    // USD
}

export interface DataStatus {
  provider: string;
  status: ProviderStatus;
  dataDelayed: boolean;
  lastHeartbeat: number; // Unix ms
}

export type QuoteCallback = (quote: Quote) => void;
export type BarCallback = (bar: Bar) => void;

/** WS message: frontend → backend */
export type ClientMessage =
  | { type: 'subscribe';   symbol: string }
  | { type: 'unsubscribe'; symbol: string }
  | { type: 'bars';        symbol: string; resolution: string; from: number; to: number }
  | { type: 'ping' };

/** WS message: backend → frontend */
export type ServerMessage =
  | { type: 'quote';  quote: Quote }
  | { type: 'bar';    bar: Bar }
  | { type: 'bars';   symbol: string; resolution: string; bars: Bar[] }
  | { type: 'status'; status: DataStatus }
  | { type: 'pong' }
  | { type: 'error';  message: string };
