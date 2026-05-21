import { Bar, ContractSpec, DataStatus, Quote, QuoteCallback } from '../types';

/**
 * Abstract base for all market data providers.
 *
 * Concrete implementations: RithmicProvider, MockProvider.
 * The server selects one at startup based on MARKET_PROVIDER env var.
 */
export abstract class MarketDataProvider {
  abstract readonly name: string;

  /** Establish connection / initialize data source. */
  abstract connect(): Promise<void>;

  /** Gracefully shut down. */
  abstract disconnect(): Promise<void>;

  /**
   * Register a callback for real-time quote updates for a symbol.
   * The provider fires the callback on every tick / best-bid-offer change.
   */
  abstract subscribeQuote(symbol: string, callback: QuoteCallback): void;

  /** Remove all quote callbacks for a symbol. */
  abstract unsubscribeQuote(symbol: string): void;

  /**
   * Fetch historical OHLCV bars.
   * @param symbol   Root symbol (NQ, not NQM26).
   * @param resolution  Bar size: '1' | '5' | '15' | '60' | 'D'
   * @param from     Start time, Unix seconds.
   * @param to       End time, Unix seconds.
   */
  abstract getBars(
    symbol: string,
    resolution: string,
    from: number,
    to: number,
  ): Promise<Bar[]>;

  /** Provider health and connectivity state. */
  abstract getStatus(): DataStatus;

  /**
   * Resolve the active front-month contract for a futures root.
   * For non-futures symbols returns a passthrough spec.
   */
  abstract resolveContract(root: string): ContractSpec;
}
