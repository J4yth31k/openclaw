"""
Unified session/timezone handler for Forex and Futures markets.

Converts exchange times to UTC, labels sessions (RTH/PRE/POST/OVERNIGHT/CLOSED),
and provides per-instrument session info for alerts and pipeline routing.
"""
from datetime import datetime, timezone
from typing import Optional
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # Python <3.9

# ── Forex sessions (UTC hours, inclusive start / exclusive end) ────────
FOREX_SESSIONS = {
    "Asian":   {"start": 0,  "end": 9,  "pairs": ["USDJPY","AUDUSD","NZDUSD","AUDJPY","NZDJPY"]},
    "London":  {"start": 8,  "end": 17, "pairs": ["EURUSD","GBPUSD","EURGBP","GBPJPY","EURJPY"]},
    "NY":      {"start": 13, "end": 22, "pairs": ["EURUSD","GBPUSD","USDCAD","USDCHF"]},
    "Overlap": {"start": 13, "end": 17, "pairs": ["EURUSD","GBPUSD","XAUUSD","USDCAD"]},
}

# ── Futures sessions ───────────────────────────────────────────────────
# Times are LOCAL to the exchange timezone (HH:MM string).
# overnight = prior 17:00 → next 08:00 (wraps midnight).
# Exchange abbreviations:  CME/CBOT = America/Chicago,  NYMEX/COMEX = America/New_York
FUTURES_SESSIONS = {
    # ── CME Equity Indices (E-mini) ── tz: America/Chicago
    "ES":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"E-mini S&P 500",
            "rth":("08:30","15:15"), "pre":("08:00","08:30"), "post":("15:15","16:00"), "overnight":("17:00","08:00")},
    "NQ":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"E-mini Nasdaq-100",
            "rth":("08:30","15:15"), "pre":("08:00","08:30"), "post":("15:15","16:00"), "overnight":("17:00","08:00")},
    "YM":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"E-mini Dow",
            "rth":("08:30","15:15"), "pre":("08:00","08:30"), "post":("15:15","16:00"), "overnight":("17:00","08:00")},
    "RTY": {"exchange":"CME",   "tz":"America/Chicago",   "desc":"E-mini Russell 2000",
            "rth":("08:30","15:15"), "pre":("08:00","08:30"), "post":("15:15","16:00"), "overnight":("17:00","08:00")},
    "MNQ": {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Micro Nasdaq-100",
            "rth":("08:30","15:15"), "pre":("08:00","08:30"), "post":("15:15","16:00"), "overnight":("17:00","08:00")},
    "MES": {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Micro E-mini S&P 500",
            "rth":("08:30","15:15"), "pre":("08:00","08:30"), "post":("15:15","16:00"), "overnight":("17:00","08:00")},
    # ── NYMEX/COMEX Energy & Metals ── tz: America/New_York
    "CL":  {"exchange":"NYMEX", "tz":"America/New_York",  "desc":"Crude Oil (WTI)",
            "rth":("09:00","14:30"), "pre":("08:00","09:00"), "post":("14:30","17:00"), "overnight":("18:00","08:00")},
    "NG":  {"exchange":"NYMEX", "tz":"America/New_York",  "desc":"Natural Gas",
            "rth":("09:00","14:30"), "pre":("08:00","09:00"), "post":("14:30","17:00"), "overnight":("18:00","08:00")},
    "GC":  {"exchange":"COMEX", "tz":"America/New_York",  "desc":"Gold",
            "rth":("08:20","13:30"), "pre":("08:00","08:20"), "post":("13:30","17:00"), "overnight":("18:00","08:00")},
    "SI":  {"exchange":"COMEX", "tz":"America/New_York",  "desc":"Silver",
            "rth":("08:25","13:25"), "pre":("08:00","08:25"), "post":("13:25","17:00"), "overnight":("18:00","08:00")},
    "HG":  {"exchange":"COMEX", "tz":"America/New_York",  "desc":"Copper",
            "rth":("08:10","13:00"), "pre":("08:00","08:10"), "post":("13:00","17:00"), "overnight":("18:00","08:00")},
    "PL":  {"exchange":"NYMEX", "tz":"America/New_York",  "desc":"Platinum",
            "rth":("08:20","13:30"), "pre":("08:00","08:20"), "post":("13:30","17:00"), "overnight":("18:00","08:00")},
    # ── CBOT Bonds ── tz: America/Chicago
    "ZB":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"30-Year T-Bond",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "ZN":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"10-Year T-Note",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "ZF":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"5-Year T-Note",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "ZT":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"2-Year T-Note",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    # ── CME FX Futures ── tz: America/Chicago
    "6E":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Euro FX Futures",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "6B":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"British Pound Futures",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "6J":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Japanese Yen Futures",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "6A":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Australian Dollar Futures",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "6C":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Canadian Dollar Futures",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    "6S":  {"exchange":"CME",   "tz":"America/Chicago",   "desc":"Swiss Franc Futures",
            "rth":("07:20","14:00"), "pre":("07:00","07:20"), "post":("14:00","16:00"), "overnight":("17:00","07:00")},
    # ── CBOT Ags ── tz: America/Chicago
    "ZC":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"Corn",
            "rth":("08:30","13:20"), "pre":("08:00","08:30"), "post":("13:20","14:00"), "overnight":("19:00","08:00")},
    "ZW":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"Wheat",
            "rth":("08:30","13:15"), "pre":("08:00","08:30"), "post":("13:15","14:00"), "overnight":("19:00","08:00")},
    "ZS":  {"exchange":"CBOT",  "tz":"America/Chicago",   "desc":"Soybeans",
            "rth":("08:30","13:15"), "pre":("08:00","08:30"), "post":("13:15","14:00"), "overnight":("19:00","08:00")},
}

# ── Instrument classification sets ─────────────────────────────────────
FUTURES_INSTRUMENTS = set(FUTURES_SESSIONS.keys()) | {"CT","KC","SB","DAX","FTSE","NIKKEI","HSI"}
CRYPTO_INSTRUMENTS  = {"BTCUSD","ETHUSD","SOLUSD"}
FOREX_INSTRUMENTS   = {
    "EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD",
    "EURGBP","EURJPY","GBPJPY","AUDJPY","CADJPY","CHFJPY",
    "EURAUD","EURCHF","EURCAD","GBPAUD","GBPCAD","GBPCHF",
    "AUDCAD","AUDCHF","AUDNZD","NZDCAD","NZDCHF","NZDJPY",
    "USDZAR","USDMXN","USDSEK","USDNOK","USDDKK","USDSGD",
    "USDTRY","USDHKD","USDCNH","EURNOK","EURSEK","GBPNZD","XAUUSD",
}

# ── Session labels for Discord/alert messages ──────────────────────────
SESSION_EMOJI = {
    "RTH":       "🟢",
    "PRE-MARKET":"🟡",
    "POST-MARKET":"🟠",
    "OVERNIGHT": "🌙",
    "CLOSED":    "🔴",
    "UNKNOWN":   "⚪",
}


def _parse_hhmm(s: str) -> float:
    """'HH:MM' → float hours."""
    h, m = map(int, s.split(":"))
    return h + m / 60.0


def _in_range(start: str, end: str, h: float) -> bool:
    s, e = _parse_hhmm(start), _parse_hhmm(end)
    if s < e:
        return s <= h < e
    # Overnight wrap (e.g. 17:00–08:00)
    return h >= s or h < e


def classify_instrument(symbol: str) -> str:
    """Return 'futures', 'forex', or 'crypto'."""
    s = symbol.upper()
    if s in CRYPTO_INSTRUMENTS:
        return "crypto"
    if s in FUTURES_INSTRUMENTS:
        return "futures"
    return "forex"


def get_active_forex_sessions(now_utc: Optional[datetime] = None) -> list[str]:
    """Return names of currently active Forex sessions."""
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    h = now_utc.hour + now_utc.minute / 60.0
    active = [name for name, cfg in FOREX_SESSIONS.items() if cfg["start"] <= h < cfg["end"]]
    return active or ["Off-Hours"]


def get_futures_session(instrument: str, now_utc: Optional[datetime] = None) -> dict:
    """
    Return current session info for a futures instrument.

    Returns:
        {session, instrument, desc, exchange, exchange_time, exchange_tz, utc_time}
        session is one of: RTH | PRE-MARKET | POST-MARKET | OVERNIGHT | CLOSED | UNKNOWN
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)

    spec = FUTURES_SESSIONS.get(instrument.upper())
    if not spec:
        return {
            "session": "UNKNOWN", "instrument": instrument, "desc": instrument,
            "exchange": "?", "exchange_time": "?",
            "exchange_tz": "UTC", "utc_time": now_utc.strftime("%H:%M UTC"),
        }

    local = now_utc.astimezone(ZoneInfo(spec["tz"]))
    local_h = local.hour + local.minute / 60.0
    tz_abbr = local.strftime("%Z")
    local_str = local.strftime("%H:%M")

    if _in_range(*spec["rth"], local_h):
        session = "RTH"
    elif _in_range(*spec["pre"], local_h):
        session = "PRE-MARKET"
    elif _in_range(*spec["post"], local_h):
        session = "POST-MARKET"
    elif _in_range(*spec["overnight"], local_h):
        session = "OVERNIGHT"
    else:
        session = "CLOSED"

    return {
        "session":      session,
        "instrument":   instrument.upper(),
        "desc":         spec["desc"],
        "exchange":     spec["exchange"],
        "exchange_time": f"{local_str} {tz_abbr}",
        "exchange_tz":  spec["tz"],
        "utc_time":     now_utc.strftime("%H:%M UTC"),
    }


def session_label(instrument: str, now_utc: Optional[datetime] = None) -> str:
    """
    One-line label for alerts/Discord.

    Examples:
        'ES  🟢 RTH  09:45 CT  (14:45 UTC)'
        'EURUSD  London/Overlap'
        'BTCUSD  24/7'
    """
    kind = classify_instrument(instrument)
    if kind == "futures":
        info = get_futures_session(instrument, now_utc)
        em = SESSION_EMOJI.get(info["session"], "⚪")
        return f"{instrument}  {em} {info['session']}  {info['exchange_time']}  ({info['utc_time']})"
    if kind == "crypto":
        return f"{instrument}  24/7"
    sessions = get_active_forex_sessions(now_utc)
    return f"{instrument}  {'/'.join(sessions)}"


def user_time(now_utc: Optional[datetime] = None, user_tz: str = "America/New_York") -> str:
    """Current time formatted in the user's timezone."""
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    local = now_utc.astimezone(ZoneInfo(user_tz))
    return local.strftime("%Y-%m-%d %H:%M %Z")


def session_context(instruments: list[str], now_utc: Optional[datetime] = None) -> dict:
    """
    Build a compact session snapshot for the pipeline workspace.

    Returns:
        {
          utc_time, forex_sessions, futures: {symbol: {session, exchange_time}},
          active_forex_pairs, active_futures
        }
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)

    forex_sessions = get_active_forex_sessions(now_utc)
    futures_info = {}
    active_futures = []

    for sym in instruments:
        if classify_instrument(sym) == "futures":
            info = get_futures_session(sym, now_utc)
            futures_info[sym] = {"session": info["session"], "exchange_time": info["exchange_time"]}
            if info["session"] in ("RTH", "OVERNIGHT", "PRE-MARKET"):
                active_futures.append(sym)

    active_forex_pairs = []
    for sess in forex_sessions:
        active_forex_pairs.extend(FOREX_SESSIONS.get(sess, {}).get("pairs", []))

    return {
        "utc_time":          now_utc.strftime("%Y-%m-%d %H:%M UTC"),
        "forex_sessions":    forex_sessions,
        "active_forex_pairs": list(dict.fromkeys(active_forex_pairs)),  # dedup, preserve order
        "futures":           futures_info,
        "active_futures":    active_futures,
    }
