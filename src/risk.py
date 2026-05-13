import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

def in_sessions(index_utc, sessions, tz='Europe/London'):
    local = index_utc.tz_convert(tz)
    minutes = local.hour * 60 + local.minute
    allow = pd.Series(False, index=index_utc)
    for sess in sessions:
        s_parts = sess['start'].split(':')
        e_parts = sess['end'].split(':')
        s_min = int(s_parts[0]) * 60 + int(s_parts[1])
        e_min = int(e_parts[0]) * 60 + int(e_parts[1])
        allow = allow | ((minutes >= s_min) & (minutes <= e_min))
    return allow

def position_units(equity, risk_per_trade, entry, stop, pip_val):
    risk_per_unit = abs(entry - stop) / pip_val
    if risk_per_unit <= 0:
        return 0.0
    dollar_risk = equity * risk_per_trade
    units = dollar_risk / max(risk_per_unit, 1e-9)
    return float(max(units, 0.0))

def apply_daily_kill_switch(equity_curve, daily_loss_limit):
    daily = equity_curve.resample('D').last().ffill()
    dd = daily / daily.shift(1) - 1.0
    halt_days = dd <= -daily_loss_limit
    return halt_days
