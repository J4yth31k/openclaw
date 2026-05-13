import numpy as np
import pandas as pd
import logging
from .indicators import add_indicators
from .risk import in_sessions, position_units
from .utils import pip_value, normalize_pair

logger = logging.getLogger(__name__)

def generate_signals(df, cfg):
    s = cfg['strategy']
    df = add_indicators(df, s['ema_fast'], s['ema_slow'], s['rsi_len'])
    cond_long = (df['ema_fast'] > df['ema_slow']) & (df['rsi'].between(s['rsi_buy_min'], s['rsi_buy_max']))
    cond_short = (df['ema_fast'] < df['ema_slow']) & (df['rsi'].between(s['rsi_sell_min'], s['rsi_sell_max']))
    sig = pd.Series(0, index=df.index, dtype=int)
    sig[cond_long] = 1
    sig[cond_short] = -1
    return df, sig

def backtest_minute(df, sig, cfg, pair=None, initial_equity=10000.0):
    pair = normalize_pair(pair or cfg.get('pair','EURUSD'))
    # Resolve per-pair costs
    costs_default = cfg.get('costs_default', {})
    overrides = cfg.get('costs_overrides', {})
    pair_costs = {**costs_default, **overrides.get(pair, {})}
    pips = pip_value(pair)
    tp = cfg['strategy']['tp_pips'] * pips
    sl = cfg['strategy']['sl_pips'] * pips
    spread = pair_costs.get('spread_pips', 1.0) * pips
    slip = pair_costs.get('slippage_pips', 0.2) * pips

    tz = cfg['session_timezone']
    allow = in_sessions(df.index, cfg['trade_sessions'], tz=tz)
    sig = sig.where(allow, 0)

    equity = initial_equity
    risk_pt = cfg['risk']['risk_per_trade']
    max_trades = cfg['risk']['max_trades_per_day']

    day = None
    trades_today = 0
    positions = []
    records = []

    # Commission: $ per $1M notionals. We approximate notional = units * price.
    commission_per_million = pair_costs.get('commission_per_million', 0.0)

    # Use all bars except the last (to safely access next_price)
    for idx, t in enumerate(df.index[:-1]):
        price = df.at[t, 'mid']
        next_price = df.at[df.index[idx + 1], 'mid']
        today = t.date()
        if day != today:
            day = today
            trades_today = 0

        # manage open positions
        new_positions = []
        for pos in positions:
            closed = False
            # assume TP/SL evaluated at next bar open
            if pos['side'] == 1:
                if next_price >= pos['tp']:
                    pnl = (pos['tp'] - pos['entry']) * pos['units']
                    closed = True
                elif next_price <= pos['sl']:
                    pnl = (pos['sl'] - pos['entry']) * pos['units']
                    closed = True
            else:
                if next_price <= pos['tp']:
                    pnl = (pos['entry'] - pos['tp']) * pos['units']
                    closed = True
                elif next_price >= pos['sl']:
                    pnl = (pos['entry'] - pos['sl']) * pos['units']
                    closed = True

            if closed:
                # commission approx: two sides (entry already counted), here we finalize round-turn
                notional = abs(pos['units'] * next_price)
                commission = commission_per_million * (notional / 1_000_000.0)
                equity += pnl - commission
                records.append({'time': t, 'pnl': pnl - commission, 'equity': equity, 'side': pos['side'], 'exit':'tp/sl'})
            else:
                new_positions.append(pos)
        positions = new_positions

        # new entry
        if trades_today < max_trades:
            side = sig.at[t]
            if side != 0:
                effective_entry = next_price + (spread/2 + slip) * (1 if side==1 else -1)
                tp_level = effective_entry + (tp if side==1 else -tp)
                sl_level = effective_entry - (sl if side==1 else -sl)
                units = position_units(equity, risk_pt, effective_entry, sl_level, pips)
                if units > 0:
                    # commission on entry
                    notional = abs(units * effective_entry)
                    commission = commission_per_million * (notional / 1_000_000.0)
                    equity -= commission
                    positions.append({'side': side, 'entry': effective_entry, 'tp': tp_level, 'sl': sl_level, 'units': units})
                    trades_today += 1
                    records.append({'time': t, 'pnl': -commission, 'equity': equity, 'side': side, 'enter':'y'})

    rec = pd.DataFrame(records).set_index('time') if records else pd.DataFrame(columns=['time','pnl','equity']).set_index('time')
    eq_series = rec['equity'].groupby(level=0).last() if not rec.empty else None
    if eq_series is None or eq_series.empty:
        from pandas import Series
        eq = df['mid']*0 + initial_equity
    else:
        eq = eq_series.reindex(df.index).ffill().bfill().fillna(initial_equity)
    return rec, eq
