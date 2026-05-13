import itertools
import logging
import numpy as np
import pandas as pd
from .scalper import generate_signals, backtest_minute

logger = logging.getLogger(__name__)

def windows(index, train_days, test_days):
    idx = pd.DatetimeIndex(index).tz_convert('UTC')
    start = idx.min().normalize()
    end = idx.max().normalize()
    cur = start
    while cur + pd.Timedelta(days=train_days+test_days) <= end:
        train_start = cur
        train_end = cur + pd.Timedelta(days=train_days)
        test_start = train_end
        test_end = test_start + pd.Timedelta(days=test_days)
        yield (train_start, train_end), (test_start, test_end)
        cur = test_start

def param_grid(cfg):
    s = cfg['walk_forward']
    keys = ['ema_fast_grid','ema_slow_grid','tp_grid','sl_grid','rsi_buy_min_grid','rsi_buy_max_grid','rsi_sell_min_grid','rsi_sell_max_grid']
    values = [s[k] for k in keys]
    if not all(values):
        logger.warning("Empty param_grid detected, skipping walk-forward")
        return
    for combo in itertools.product(*values):
        yield dict(zip(['ema_fast','ema_slow','tp_pips','sl_pips','rsi_buy_min','rsi_buy_max','rsi_sell_min','rsi_sell_max'], combo))

def score(rec):
    if rec.empty:
        return -1e9
    pnl = rec['pnl'].sum()
    daily = rec['pnl'].resample('D').sum()
    denom = (daily.std() + 1e-6)
    return pnl / denom

def walk_forward(df, cfg):
    results = []
    for (tr_s, tr_e), (te_s, te_e) in windows(df.index, cfg['walk_forward']['train_days'], cfg['walk_forward']['test_days']):
        train_df = df.loc[tr_s:tr_e].copy()
        test_df = df.loc[te_s:te_e].copy()
        best_score = -1e18
        best_params = None
        for params in param_grid(cfg):
            tr_cfg = {**cfg, 'strategy': {**cfg['strategy'], **params}}
            tr_aug, tr_sig = generate_signals(train_df, tr_cfg)
            tr_rec, _ = backtest_minute(tr_aug, tr_sig, tr_cfg)
            sc = score(tr_rec)
            if sc > best_score:
                best_score = sc
                best_params = params

        if best_params is None:
            logger.warning(f"No best_params found for window {tr_s} to {tr_e}, skipping test phase")
            continue

        te_cfg = {**cfg, 'strategy': {**cfg['strategy'], **best_params}}
        te_aug, te_sig = generate_signals(test_df, te_cfg)
        te_rec, _ = backtest_minute(te_aug, te_sig, te_cfg)
        if not te_rec.empty:
            te_rec = te_rec.assign(**{f'param_{k}': v for k,v in best_params.items()})
            te_rec['phase'] = 'test'
            results.append(te_rec)
    return pd.concat(results).sort_index() if results else pd.DataFrame()
