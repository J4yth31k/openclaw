import { MarketDataProvider } from './providers/MarketDataProvider';

let _provider: MarketDataProvider | null = null;

export function setProvider(p: MarketDataProvider): void { _provider = p; }
export function getProvider(): MarketDataProvider | null { return _provider; }
