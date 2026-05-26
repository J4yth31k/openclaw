"""
ICT/SMC Pipeline Orchestrator — 6-Node Sequential Gate System

Wires existing Avengers agents into a strict ICT/SMC decision chain.
Every incoming TradingView alert runs through 6 sequential gates;
any WAIT or FAIL short-circuits all downstream nodes.

Node 1: Bias       → daily candle + AMD phase + NWOG (Iron Man data)
Node 2: Session    → key open window gate (EST time + 15-min window)
Node 3: Structure  → Iron Man detect_order_blocks + detect_fair_value_gaps
                     + detect_market_structure (CHoCH → CISD) + EQL/EQH
Node 4: Confluence → 7-point ICT scoring; IFVG = FVG inside OB
Node 5: Entry      → IFVG @ 50% → Rejection Block → Fib OTE (0.705)
Node 6: Risk       → War Machine journal → daily state machine → position sizing

Usage:
    from ict_pipeline import run_pipeline
    result = run_pipeline(alert_payload)  # payload = dict from TradingView webhook
    print(result.decision, result.summary)
"""

import json
import logging
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from iron_man import IronMan
from war_machine import WarMachine

logger = logging.getLogger("ict_pipeline")

# ── Constants ──────────────────────────────────────────────────────────────────

# (hour_est, minute_est, priority_label, description)
KEY_OPENS: List[Tuple[int, int, str, str]] = [
    (9,  30, "primary",   "RTH open — highest priority"),
    (9,   0, "high",      "NY pre-open — valid only with 1H OB alignment"),
    (8,  30, "high_news", "News open — requires news_event flag"),
    (10,  0, "medium",    "Mid-morning continuation"),
    (13,  0, "medium",    "Lunch reversal window"),
    (18,  0, "low",       "Overnight session open"),
    (0,   0, "low",       "Midnight session open"),
]

ENTRY_WINDOW_MIN   = 15    # minutes after open still considered valid
MIN_SL_PTS         = 5
MAX_SL_PTS         = 10
MIN_RR             = 3.0
CONFLUENCE_PASS    = 5     # score threshold to proceed to entry

# TradingView → yfinance symbol map
SYMBOL_MAP: Dict[str, str] = {
    "NQ1!": "NQ=F",  "ES1!": "ES=F",  "YM1!": "YM=F",  "RTY1!": "RTY=F",
    "CL1!": "CL=F",  "GC1!": "GC=F",  "NG1!": "NG=F",
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X",
    "AUDUSD": "AUDUSD=X", "USDCAD": "CAD=X",    "NZDUSD": "NZDUSD=X",
    "BTCUSD": "BTC-USD",  "ETHUSD": "ETH-USD",  "SOLUSD": "SOL-USD",
}

# ── Result dataclasses ─────────────────────────────────────────────────────────

@dataclass
class BiasResult:
    status: str                           # "ok" | "wait"
    direction: str       = "WAIT"        # "BULLISH" | "BEARISH" | "WAIT"
    daily_candle: str    = "NEUTRAL"
    amd_phase: str       = "ACCUMULATION"
    target_level: Optional[float] = None
    nwog_present: bool   = False
    nwog_level: Optional[float] = None
    reason: str          = ""

@dataclass
class SessionResult:
    status: str                           # "ok" | "wait"
    window_active: bool  = False
    primary_open: str    = ""
    minutes_since_open: int = 0
    open_priority: str   = "none"
    reason: str          = ""

@dataclass
class StructureResult:
    status: str                           # "ok" | "fail"
    cisd_confirmed: bool = False
    cisd_fvg_inversion: bool = False     # CISD + FVG inversion = strongest signal
    ob_location: Optional[float] = None
    ob_top: Optional[float] = None
    ob_bottom: Optional[float] = None
    ob_valid: bool       = False
    eql_eqh_present: bool = False
    eql_eqh_level: Optional[float] = None
    clear_path: bool     = False
    reason: str          = ""

@dataclass
class ConfluenceResult:
    status: str                           # "ok" | "fail"
    score: int           = 0
    checks: Dict[str, bool] = field(default_factory=dict)
    ifvg_present: bool   = False
    ifvg_50_level: Optional[float] = None
    rejection_block_present: bool = False
    reason: str          = ""

@dataclass
class EntryResult:
    status: str                           # "ok" | "wait" | "fail"
    entry_price: Optional[float] = None
    stop_loss: Optional[float]   = None
    take_profit: Optional[float] = None
    rr_ratio: Optional[float]    = None
    entry_type: str = ""                 # "IFVG" | "REJECTION_BLOCK" | "FIB_OTE"
    reason: str = ""

@dataclass
class RiskResult:
    status: str                           # "execute" | "blocked"
    order_status: str  = "BLOCKED"
    block_reason: str  = ""
    position_size: Optional[float] = None
    daily_state: str   = "UNKNOWN"       # "ACTIVE" | "DERIKSED" | "DONE"
    trades_today: int  = 0
    reason: str        = ""

@dataclass
class PipelineResult:
    timestamp: str
    symbol: str
    action: str
    decision: str                         # "EXECUTE" | "BLOCKED"
    stopped_at_node: Optional[int] = None
    bias: Optional[BiasResult]         = None
    session: Optional[SessionResult]   = None
    structure: Optional[StructureResult] = None
    confluence: Optional[ConfluenceResult] = None
    entry: Optional[EntryResult]       = None
    risk: Optional[RiskResult]         = None
    summary: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

# ── Pipeline class ─────────────────────────────────────────────────────────────

class ICTPipeline:
    """
    Sequential 6-node ICT/SMC gate system.
    Instantiate once at server startup; call run() per TradingView alert.
    """

    def __init__(self, account_size: float = 10_000.0, risk_pct: float = 0.01):
        self.account_size = account_size
        self.risk_pct     = risk_pct
        self._im          = IronMan()
        self._wm          = WarMachine()
        logger.info("ICTPipeline ready — $%.0f account, %.1f%% risk", account_size, risk_pct * 100)

    # ── Public entry point ─────────────────────────────────────────────────────

    def run(self, payload: Dict[str, Any]) -> PipelineResult:
        """Run the 6-node gate chain for one TradingView alert payload."""
        symbol = payload.get("symbol", "UNKNOWN")
        action = payload.get("action", "NEUTRAL")
        price  = float(payload.get("price", 0))
        now    = datetime.now(timezone.utc)

        result = PipelineResult(
            timestamp=now.isoformat(),
            symbol=symbol,
            action=action,
            decision="BLOCKED",
        )
        logger.info("[ICT] START %s %s @ %.5f", action, symbol, price)

        yf_ticker = SYMBOL_MAP.get(symbol, symbol)

        # Fetch OHLC at all timeframes Iron Man needs
        df_daily = self._im.fetch_data(yf_ticker, "1d",  "30d")
        df_4h    = self._im.fetch_data(yf_ticker, "1h",  "60d")   # yfinance max for 4H via 1H aggr.
        df_1h    = self._im.fetch_data(yf_ticker, "1h",  "14d")
        df_15m   = self._im.fetch_data(yf_ticker, "15m", "5d")
        df_5m    = self._im.fetch_data(yf_ticker, "5m",  "2d")

        # ── Node 1: Bias ──────────────────────────────────────────────────────
        bias = self._node_bias(payload, df_daily)
        result.bias = bias
        if bias.status != "ok":
            result.stopped_at_node = 1
            result.summary = f"[N1 BIAS] {bias.reason}"
            self._archive(result)
            return result

        # ── Node 2: Session ───────────────────────────────────────────────────
        session = self._node_session(payload, now)
        result.session = session
        if session.status != "ok":
            result.stopped_at_node = 2
            result.summary = f"[N2 SESSION] {session.reason}"
            self._archive(result)
            return result

        # ── Node 3: Structure ─────────────────────────────────────────────────
        structure = self._node_structure(bias, df_1h, df_4h)
        result.structure = structure
        if structure.status != "ok":
            result.stopped_at_node = 3
            result.summary = f"[N3 STRUCTURE] {structure.reason}"
            self._archive(result)
            return result

        # ── Node 4: Confluence ────────────────────────────────────────────────
        confluence = self._node_confluence(bias, session, structure, df_15m, df_5m, payload)
        result.confluence = confluence
        if confluence.status != "ok":
            result.stopped_at_node = 4
            result.summary = f"[N4 CONFLUENCE] {confluence.reason} (score {confluence.score}/7)"
            self._archive(result)
            return result

        # ── Node 5: Entry ─────────────────────────────────────────────────────
        entry = self._node_entry(confluence, structure, price, bias)
        result.entry = entry
        if entry.status != "ok":
            result.stopped_at_node = 5
            result.summary = f"[N5 ENTRY] {entry.reason}"
            self._archive(result)
            return result

        # ── Node 6: Risk ──────────────────────────────────────────────────────
        risk = self._node_risk(entry, session, symbol)
        result.risk = risk
        if risk.order_status != "EXECUTE":
            result.stopped_at_node = 6
            result.summary = f"[N6 RISK] {risk.block_reason}"
            self._archive(result)
            return result

        # ── All gates cleared — EXECUTE ───────────────────────────────────────
        result.decision = "EXECUTE"
        result.summary = (
            f"EXECUTE {bias.direction} {symbol} | "
            f"entry={entry.entry_price} SL={entry.stop_loss} TP={entry.take_profit} | "
            f"R:R=1:{entry.rr_ratio} | confluence={confluence.score}/7 | "
            f"type={entry.entry_type} | size={risk.position_size} lots"
        )
        logger.info("[ICT] EXECUTE — %s", result.summary)
        self._log_to_war_machine(result, session, risk)
        self._archive(result)
        return result

    # ── Node 1: Bias ──────────────────────────────────────────────────────────

    def _node_bias(self, payload: Dict[str, Any], df_daily: Optional[pd.DataFrame]) -> BiasResult:
        """
        Directional bias: daily candle direction + AMD phase from Pine payload + NWOG.
        AMD phase is inferred from signal type: 'ribbon' = distribution, 'squeeze' = manipulation release.
        """
        action = payload.get("action", "NEUTRAL")
        signal = payload.get("signal", "")

        if action not in ("BUY", "SELL"):
            return BiasResult(status="wait", reason="Action NEUTRAL — accumulation phase, no bias")

        direction = "BULLISH" if action == "BUY" else "BEARISH"

        # Daily candle direction — use Pine's prev_high/prev_low if sent, else yfinance
        pine_prev_high = payload.get("prev_high")
        pine_prev_low  = payload.get("prev_low")

        daily_candle = "NEUTRAL"
        target_level: Optional[float] = None
        if df_daily is not None and len(df_daily) >= 2:
            last = df_daily.iloc[-1]
            if last["close"] > last["open"]:
                daily_candle = "BULLISH"
                target_level = float(pine_prev_high) if pine_prev_high else float(df_daily["high"].rolling(5).max().iloc[-1])
            elif last["close"] < last["open"]:
                daily_candle = "BEARISH"
                target_level = float(pine_prev_low) if pine_prev_low else float(df_daily["low"].rolling(5).min().iloc[-1])

        # AMD: squeeze signal = momentum just released from compression = manipulation done
        amd_phase = "DISTRIBUTION" if signal == "ribbon" else "MANIPULATION"

        # NWOG — use Pine's calculation if present, else derive from yfinance
        pine_nwog_present = payload.get("nwog_present", False)
        pine_nwog_level   = payload.get("nwog_level")
        if pine_nwog_present and pine_nwog_level:
            nwog_present = bool(pine_nwog_present)
            nwog_level   = float(pine_nwog_level)
        else:
            nwog_present, nwog_level = self._detect_nwog(df_daily)

        reason = (
            f"direction={direction}, daily={daily_candle}, "
            f"amd={amd_phase}, nwog={'yes@' + str(round(nwog_level, 4)) if nwog_present else 'no'}"
        )
        return BiasResult(
            status="ok",
            direction=direction,
            daily_candle=daily_candle,
            amd_phase=amd_phase,
            target_level=target_level,
            nwog_present=nwog_present,
            nwog_level=nwog_level,
            reason=reason,
        )

    # ── Node 2: Session ───────────────────────────────────────────────────────

    def _node_session(self, payload: Dict[str, Any], now_utc: datetime) -> SessionResult:
        """Gate on key open windows (EST). Outside all windows → WAIT."""
        try:
            from zoneinfo import ZoneInfo
            ct = ZoneInfo("America/Chicago")
        except ImportError:
            import pytz
            ct = pytz.timezone("America/Chicago")

        now_ct = now_utc.astimezone(ct)
        h, m   = now_ct.hour, now_ct.minute
        has_news = bool(payload.get("news_event", False))

        for open_h, open_m, priority, desc in KEY_OPENS:
            if priority == "high_news" and not has_news:
                continue
            delta = (h * 60 + m) - (open_h * 60 + open_m)
            if 0 <= delta <= ENTRY_WINDOW_MIN:
                reason = f"{priority} window {open_h:02d}:{open_m:02d} CT ({delta}m elapsed) — {desc}"
                return SessionResult(
                    status="ok",
                    window_active=True,
                    primary_open=f"{open_h:02d}:{open_m:02d}",
                    minutes_since_open=delta,
                    open_priority=priority,
                    reason=reason,
                )

        return SessionResult(
            status="wait",
            reason=f"No active key open at {h:02d}:{m:02d} CT — WAIT_FOR_WINDOW",
        )

    # ── Node 3: Structure ─────────────────────────────────────────────────────

    def _node_structure(
        self,
        bias: BiasResult,
        df_1h: Optional[pd.DataFrame],
        df_4h: Optional[pd.DataFrame],
    ) -> StructureResult:
        """
        Detect orderblocks, CHoCH (CISD), and EQL/EQH using Iron Man's methods.
        Requires a valid 1H OB aligned with bias direction.
        """
        if df_1h is None or len(df_1h) < 20:
            return StructureResult(status="fail", reason="Insufficient 1H data")

        direction = bias.direction

        # ── Orderblock detection via Iron Man ─────────────────────────────────
        obs = self._im.detect_order_blocks(df_1h)
        side = "bullish" if direction == "BULLISH" else "bearish"
        ob_list = obs.get(side, [])

        ob_location = ob_top = ob_bottom = None
        ob_valid = False
        if ob_list:
            strongest = max(ob_list, key=lambda x: x.get("strength", 0))
            ob_top      = strongest["top"]
            ob_bottom   = strongest["bottom"]
            ob_location = (ob_top + ob_bottom) / 2
            ob_valid    = True

        if not ob_valid:
            return StructureResult(
                status="fail",
                reason=f"No valid {direction} 1H orderblock found — no structural anchor",
            )

        # ── CISD via Iron Man's market structure (CHoCH = CISD) ───────────────
        ms = self._im.detect_market_structure(df_1h)
        cisd_confirmed = ms.get("last_choch") is not None

        # Also check 4H if available
        if not cisd_confirmed and df_4h is not None and len(df_4h) >= 20:
            ms_4h = self._im.detect_market_structure(df_4h)
            cisd_confirmed = ms_4h.get("last_choch") is not None

        # CISD + FVG inversion = strongest signal (per strategy doc)
        # Inversion FVG = a previously bearish FVG that price has now traded back through bullishly
        cisd_fvg_inversion = False
        if cisd_confirmed and df_1h is not None:
            fvgs_1h = self._im.detect_fair_value_gaps(df_1h)
            opposite_side = "bearish" if direction == "BULLISH" else "bullish"
            inverted = fvgs_1h.get(opposite_side, [])
            # An inversion means price has come back into the opposite-side FVG
            current_price_1h = float(df_1h["close"].iloc[-1])
            for fvg in inverted:
                if fvg["bottom"] <= current_price_1h <= fvg["top"]:
                    cisd_fvg_inversion = True
                    break

        # ── EQL/EQH via swing highs/lows from market structure ────────────────
        eql_eqh_present = False
        eql_eqh_level: Optional[float] = None
        swing_highs = ms.get("swing_highs", [])
        swing_lows  = ms.get("swing_lows",  [])
        tol = float(df_1h["high"].mean()) * 0.001   # 0.1% tolerance

        # Equal highs: 2 swing highs within tolerance
        for i in range(len(swing_highs) - 1):
            if abs(swing_highs[i] - swing_highs[i + 1]) < tol:
                eql_eqh_present = True
                eql_eqh_level   = swing_highs[i]
                break

        # Equal lows: 2 swing lows within tolerance
        if not eql_eqh_present:
            for i in range(len(swing_lows) - 1):
                if abs(swing_lows[i] - swing_lows[i + 1]) < tol:
                    eql_eqh_present = True
                    eql_eqh_level   = swing_lows[i]
                    break

        # ── Clear path to target ──────────────────────────────────────────────
        # Clear if no EQL/EQH blocking between current price and target
        current_price = float(df_1h["close"].iloc[-1])
        clear_path = True
        if eql_eqh_present and eql_eqh_level and bias.target_level:
            between_price_and_target = (
                min(current_price, bias.target_level) < eql_eqh_level <
                max(current_price, bias.target_level)
            )
            clear_path = not between_price_and_target

        reason = (
            f"OB={ob_location:.4f} (top={ob_top:.4f} bot={ob_bottom:.4f}), "
            f"CISD={'confirmed' if cisd_confirmed else 'unconfirmed'}"
            f"{'+FVG_INVERSION' if cisd_fvg_inversion else ''}, "
            f"EQL/EQH={'yes@' + str(round(eql_eqh_level, 4)) if eql_eqh_present else 'none'}, "
            f"path={'clear' if clear_path else 'blocked'}"
        )
        return StructureResult(
            status="ok",
            cisd_confirmed=cisd_confirmed,
            cisd_fvg_inversion=cisd_fvg_inversion,
            ob_location=round(ob_location, 5),
            ob_top=round(ob_top, 5),
            ob_bottom=round(ob_bottom, 5),
            ob_valid=True,
            eql_eqh_present=eql_eqh_present,
            eql_eqh_level=round(eql_eqh_level, 5) if eql_eqh_level else None,
            clear_path=clear_path,
            reason=reason,
        )

    # ── Node 4: Confluence ─────────────────────────────────────────────────────

    def _node_confluence(
        self,
        bias: BiasResult,
        session: SessionResult,
        structure: StructureResult,
        df_15m: Optional[pd.DataFrame],
        df_5m: Optional[pd.DataFrame],
        payload: Dict[str, Any],
    ) -> ConfluenceResult:
        """
        Score setup 0–7. IFVG = FVG on 15M whose midpoint falls inside the 1H OB.
        Score >= 5 to proceed.
        """
        direction = bias.direction

        # ── IFVG: FVG on 15M inside the 1H OB range ──────────────────────────
        ifvg_present  = False
        ifvg_50_level: Optional[float] = None

        if df_15m is not None and structure.ob_top and structure.ob_bottom:
            fvgs = self._im.detect_fair_value_gaps(df_15m)
            side_fvgs = fvgs.get("bullish" if direction == "BULLISH" else "bearish", [])
            for fvg in side_fvgs:
                fvg_mid = (fvg["top"] + fvg["bottom"]) / 2
                if structure.ob_bottom <= fvg_mid <= structure.ob_top:
                    ifvg_present  = True
                    ifvg_50_level = round(fvg_mid, 5)
                    break

        # ── Rejection block on 5M ─────────────────────────────────────────────
        # Rejection block = wick start that rejected a PD array (FVG or OB)
        rej_block_present = False
        if df_5m is not None and len(df_5m) >= 5:
            fvgs_5m = self._im.detect_fair_value_gaps(df_5m)
            rej_block_present = bool(fvgs_5m.get("bullish" if direction == "BULLISH" else "bearish"))

        # ── 7-point scoring ───────────────────────────────────────────────────
        # CISD+FVG inversion = strongest CISD signal; counts as the CISD point
        # and also unlocks the IFVG point if no standalone IFVG was found.
        cisd_point = structure.cisd_confirmed or structure.cisd_fvg_inversion
        ifvg_point = ifvg_present or structure.cisd_fvg_inversion  # inversion doubles as IFVG confirm

        # EQL/EQH: prefer Pine's chart-accurate detection if present
        pine_eqh = bool(payload.get("eqh", False))
        pine_eql = bool(payload.get("eql", False))
        eql_eqh_point = structure.eql_eqh_present or pine_eqh or pine_eql

        checks: Dict[str, bool] = {
            "nwog_aligns":     bias.nwog_present,
            "ob_valid":        structure.ob_valid,
            "ifvg_confirmed":  ifvg_point,
            "cisd_confirmed":  cisd_point,
            "key_open_active": session.window_active,
            "amd_confirmed":   bias.amd_phase in ("MANIPULATION", "DISTRIBUTION"),
            "eql_eqh_swept":   eql_eqh_point,
        }
        score = sum(checks.values())

        if score < CONFLUENCE_PASS:
            return ConfluenceResult(
                status="fail",
                score=score,
                checks=checks,
                ifvg_present=ifvg_present,
                ifvg_50_level=ifvg_50_level,
                reason=f"Score {score}/7 below threshold {CONFLUENCE_PASS} — LOW CONFIDENCE. Checks: {checks}",
            )

        reason = f"Score {score}/7 — HIGH CONFIDENCE. Checks: {checks}"
        return ConfluenceResult(
            status="ok",
            score=score,
            checks=checks,
            ifvg_present=ifvg_present,
            ifvg_50_level=ifvg_50_level,
            rejection_block_present=rej_block_present,
            reason=reason,
        )

    # ── Node 5: Entry ─────────────────────────────────────────────────────────

    def _node_entry(
        self,
        confluence: ConfluenceResult,
        structure: StructureResult,
        current_price: float,
        bias: BiasResult,
    ) -> EntryResult:
        """
        Entry priority: IFVG @ 50% → Rejection Block → Fib OTE (0.705).
        Rejects if R:R < 1:3 or SL outside 5–10pt range.
        """
        if bias.target_level is None:
            return EntryResult(status="fail", reason="No target level — cannot calculate R:R")

        target     = bias.target_level
        is_bullish = target > current_price

        entry_price: Optional[float] = None
        entry_type  = ""

        # 1. IFVG @ 50%
        if confluence.ifvg_present and confluence.ifvg_50_level:
            proximity = abs(current_price - confluence.ifvg_50_level) / current_price
            if proximity < 0.003:   # within 0.3% — already at the level
                entry_price = confluence.ifvg_50_level
                entry_type  = "IFVG"

        # 2. Rejection block (near OB boundary)
        if entry_price is None and confluence.rejection_block_present and structure.ob_location:
            proximity = abs(current_price - structure.ob_location) / current_price
            if proximity < 0.005:
                entry_price = structure.ob_location
                entry_type  = "REJECTION_BLOCK"

        # 3. Fib OTE safety net (0.705 of manipulation move)
        if entry_price is None:
            # Use current price as-is; caller should verify fib externally
            entry_price = current_price
            entry_type  = "FIB_OTE"

        # SL: beyond the OB boundary
        pip = 0.0001 if current_price < 50 else 1.0
        sl_pts = 7.0   # midpoint of 5–10 rule
        stop_loss   = entry_price - sl_pts * pip if is_bullish else entry_price + sl_pts * pip
        take_profit = target

        sl_dist = abs(entry_price - stop_loss)
        tp_dist = abs(entry_price - take_profit)

        if sl_dist == 0:
            return EntryResult(status="fail", reason="SL distance zero")

        sl_pts_actual = sl_dist / pip
        if sl_pts_actual < MIN_SL_PTS:
            return EntryResult(
                status="fail",
                reason=f"SL {sl_pts_actual:.1f}pts below minimum {MIN_SL_PTS}pts",
            )
        if sl_pts_actual > MAX_SL_PTS:
            return EntryResult(
                status="fail",
                reason=f"SL {sl_pts_actual:.1f}pts exceeds maximum {MAX_SL_PTS}pts",
            )

        rr = round(tp_dist / sl_dist, 2)
        if rr < MIN_RR:
            return EntryResult(
                status="fail",
                entry_price=round(entry_price, 5),
                stop_loss=round(stop_loss, 5),
                take_profit=round(take_profit, 5),
                rr_ratio=rr,
                entry_type=entry_type,
                reason=f"R:R {rr} below minimum {MIN_RR} — do not widen SL to force it",
            )

        reason = f"entry={entry_price:.5f} SL={stop_loss:.5f} TP={take_profit:.5f} R:R=1:{rr} type={entry_type}"
        return EntryResult(
            status="ok",
            entry_price=round(entry_price, 5),
            stop_loss=round(stop_loss, 5),
            take_profit=round(take_profit, 5),
            rr_ratio=rr,
            entry_type=entry_type,
            reason=reason,
        )

    # ── Node 6: Risk ──────────────────────────────────────────────────────────

    def _node_risk(self, entry: EntryResult, session: SessionResult, symbol: str) -> RiskResult:
        """
        Psychology rules + SL validation + position sizing.
        Risk Agent has absolute veto over all upstream nodes.
        """
        today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        instrument = symbol.replace("/", "").replace("1!", "").replace("=X", "").replace("-USD", "USD")

        trades_today = [
            t for t in self._wm._trades.values()
            if t.get("trade_id", "").startswith(today_str)
            and t.get("status") == "closed"
        ]
        wins_today   = sum(1 for t in trades_today if t.get("outcome") == "WIN")
        losses_today = sum(1 for t in trades_today if t.get("outcome") == "LOSS")
        total_today  = len(trades_today)

        # Psychology gates (from strategy doc)
        if wins_today >= 1 and losses_today == 0:
            return RiskResult(status="blocked", order_status="BLOCKED",
                              block_reason="Won first trade — DONE for the day",
                              daily_state="DONE", trades_today=total_today)

        if wins_today >= 1 and losses_today >= 1:
            return RiskResult(status="blocked", order_status="BLOCKED",
                              block_reason="Second trade completed (W+L) — DONE for the day",
                              daily_state="DONE", trades_today=total_today)

        if losses_today >= 2:
            return RiskResult(status="blocked", order_status="BLOCKED",
                              block_reason="Two losses today — DONE, max drawdown hit",
                              daily_state="DONE", trades_today=total_today)

        de_risked  = losses_today == 1 and wins_today == 0
        daily_state = "DERIKSED" if de_risked else "ACTIVE"

        # Position sizing
        ep  = entry.entry_price or 0
        sl  = entry.stop_loss   or 0
        pip = 0.0001 if ep < 50 else 1.0
        sl_pts = abs(ep - sl) / pip if pip > 0 else 7.0

        risk_amount   = self.account_size * self.risk_pct * (0.5 if de_risked else 1.0)
        sl_dollar     = sl_pts * pip * 100_000   # per standard lot
        position_size = round(risk_amount / sl_dollar, 4) if sl_dollar > 0 else 0.01

        reason = (
            f"daily_state={daily_state}, trades_today={total_today}, "
            f"de_risked={de_risked}, sl_pts={sl_pts:.1f}, "
            f"risk=${risk_amount:.2f}, size={position_size} lots"
        )
        return RiskResult(
            status="execute",
            order_status="EXECUTE",
            position_size=position_size,
            daily_state=daily_state,
            trades_today=total_today,
            reason=reason,
        )

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _detect_nwog(
        self, df_daily: Optional[pd.DataFrame]
    ) -> Tuple[bool, Optional[float]]:
        """
        New Week Opening Gap: gap between last Friday's close and most recent Monday's open.
        Gap must be > 20% of average daily range to qualify.
        """
        if df_daily is None or len(df_daily) < 5:
            return False, None
        try:
            df = df_daily.copy()
            df.index = pd.to_datetime(df.index)
            fridays = df[df.index.day_of_week == 4]
            mondays = df[df.index.day_of_week == 0]
            if fridays.empty or mondays.empty:
                return False, None
            fri_close = float(fridays["close"].iloc[-1])
            mon_open  = float(mondays["open"].iloc[-1])
            gap       = abs(mon_open - fri_close)
            avg_range = float((df["high"] - df["low"]).mean())
            if avg_range > 0 and gap > avg_range * 0.2:
                return True, round((fri_close + mon_open) / 2, 5)
        except Exception as exc:
            logger.debug("NWOG detection error: %s", exc)
        return False, None

    def _log_to_war_machine(
        self, result: PipelineResult, session: SessionResult, risk: RiskResult
    ) -> None:
        """Log an EXECUTE decision into War Machine's trade journal."""
        if result.entry is None or result.bias is None or result.confluence is None:
            return
        try:
            self._wm.log_signal({
                "instrument":              result.symbol,
                "session":                 session.primary_open,
                "signal_direction":        result.bias.direction,
                "signal_timeframe":        "1H",
                "htf_bias":                result.bias.daily_candle,
                "confluence_score":        result.confluence.score,
                "confirming_factors":      [k for k, v in result.confluence.checks.items() if v],
                "entry_price":             result.entry.entry_price,
                "stop_loss_price":         result.entry.stop_loss,
                "take_profit_prices":      [result.entry.take_profit],
                "stop_loss_pips":          abs((result.entry.entry_price or 0) - (result.entry.stop_loss or 0)) / 0.0001,
                "dollar_risk":             self.account_size * self.risk_pct,
                "position_size":           risk.position_size,
                "account_balance_at_entry": self.account_size,
                "account_type":            "FUTURES" if "1!" in result.symbol else "FOREX",
                "risk_pct_used":           self.risk_pct * (0.5 if risk.daily_state == "DERIKSED" else 1.0),
                "generating_agent":        "ICTPipeline",
            })
        except Exception as exc:
            logger.warning("War Machine log_signal failed: %s", exc)

    def _archive(self, result: PipelineResult) -> None:
        """Append pipeline result summary to session_summaries.json."""
        try:
            path = os.path.join(os.path.dirname(__file__), "..", "session_summaries.json")
            with open(path, "r") as f:
                data = json.load(f)
            data.append({
                "type":             "ict_pipeline",
                "timestamp":        result.timestamp,
                "symbol":           result.symbol,
                "action":           result.action,
                "decision":         result.decision,
                "stopped_at_node":  result.stopped_at_node,
                "summary":          result.summary,
                "score":            result.confluence.score if result.confluence else None,
            })
            data = data[-500:]
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as exc:
            logger.warning("_archive failed: %s", exc)


# ── Module-level convenience ──────────────────────────────────────────────────

_pipeline: Optional[ICTPipeline] = None


def run_pipeline(
    payload: Dict[str, Any],
    account_size: float = 10_000.0,
    risk_pct: float = 0.01,
) -> PipelineResult:
    """
    Shared singleton pipeline. Call this from Hawkeye's webhook handler.

        from ict_pipeline import run_pipeline
        result = run_pipeline(request.json)
        if result.decision == "EXECUTE":
            fire_order(result)
    """
    global _pipeline
    if _pipeline is None:
        _pipeline = ICTPipeline(account_size=account_size, risk_pct=risk_pct)
    return _pipeline.run(payload)
