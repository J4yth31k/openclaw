import numpy as np
import pandas as pd

def to_time_index(df, col='time'):
    df = df.copy()
    df[col] = pd.to_datetime(df[col], utc=True, errors='coerce')
    df = df.set_index(col).sort_index()
    return df

def geometric_random_walk(n=20000, mu=0.0, sigma=0.0008, start=1.10, seed=42, freq='T'):
    rng = np.random.default_rng(seed)
    steps = rng.normal(mu, sigma, n)
    prices = start * np.exp(np.cumsum(steps))
    idx = pd.date_range('2022-01-01', periods=n, freq=freq, tz='UTC')
    return pd.DataFrame({'mid': prices}, index=idx)

def normalize_pair(pair: str) -> str:
    p = pair.upper().replace(' ','')
    if p == 'CADUSD':
        return 'USDCAD'
    return p

def pip_value(pair='EURUSD'):
    p = normalize_pair(pair)
    # Standard majors (EURUSD, GBPUSD, USDJPY handled)
    if p.endswith('JPY'):
        return 1e-2  # 1 pip = 0.01
    if p == 'XAUUSD':
        return 0.01  # gold often quoted to cents; treat pip as $0.01
    # Crypto pairs (BTCUSD, ETHUSD, SOLUSD)
    if p in ('BTCUSD', 'ETHUSD', 'SOLUSD'):
        return 1.0  # crypto typically quoted to nearest dollar
    return 1e-4
