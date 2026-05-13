import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

def ema(series, span):
    return series.ewm(span=span, adjust=False).mean()

def rsi(series, length=14):
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(length).mean()
    loss = (-delta.clip(upper=0)).rolling(length).mean()
    rs = gain / (loss + 1e-12)
    return 100 - 100/(1+rs)

def add_indicators(df, ema_fast=9, ema_slow=21, rsi_len=14):
    out = df.copy()
    out['ema_fast'] = ema(out['mid'], ema_fast)
    out['ema_slow'] = ema(out['mid'], ema_slow)
    out['rsi'] = rsi(out['mid'], rsi_len)
    before_len = len(out)
    out = out.dropna()
    after_len = len(out)
    dropped = before_len - after_len
    if dropped > 0:
        logger.warning(f"Dropped {dropped} rows due to NaN values in indicators")
    return out
