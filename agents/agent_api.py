"""
Lightweight FastAPI bridge that exposes the existing AI agents over HTTP.
The Node.js webhook receiver calls POST /analyze with a TradingView alert payload.

Run:
    source .venv/bin/activate
    pip install fastapi uvicorn
    python agents/agent_api.py
"""

from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import uvicorn

try:
    from ict_pipeline import run_pipeline
    _ICT_AVAILABLE = True
except Exception:
    _ICT_AVAILABLE = False

app = FastAPI(title="OpenClaw Agent API", version="2.0.0")


class Indicators(BaseModel):
    rsi:         Optional[float] = None
    atr:         Optional[float] = None
    vol_ratio:   Optional[float] = None
    fast_ema:    Optional[float] = None
    slow_ema:    Optional[float] = None
    stoch_k:     Optional[float] = None
    stoch_d:     Optional[float] = None
    ema8:        Optional[float] = None
    ema21:       Optional[float] = None
    ema55:       Optional[float] = None
    vwap:        Optional[float] = None
    vwap_u1:     Optional[float] = None
    vwap_l1:     Optional[float] = None
    momentum:    Optional[float] = None
    squeeze:     Optional[bool]  = None
    ribbon_bull: Optional[bool]  = None
    signal:      Optional[str]   = None
    # ICT / Price Feed extras
    prev_high:   Optional[float] = None
    prev_low:    Optional[float] = None
    nwog_level:  Optional[float] = None
    nwog_present: Optional[bool] = None
    eqh:         Optional[bool]  = None
    eql:         Optional[bool]  = None
    rsi_context: Optional[str]   = None
    level_hint:  Optional[str]   = None


class AlertPayload(BaseModel):
    symbol:     str
    action:     str           # BUY | SELL | BULLISH | BEARISH | OVERSOLD | OVERBOUGHT | NEUTRAL
    price:      float
    timeframe:  str
    session:    str
    overlap:    Optional[str] = None
    indicators: Optional[Indicators] = None
    strategy:   Optional[str] = None
    tier:       Optional[str] = "free"
    # Flat fields from PriceFeed v2
    rsi:        Optional[float] = None
    atr:        Optional[float] = None
    ema21:      Optional[float] = None
    ema55:      Optional[float] = None
    vwap:       Optional[float] = None
    prev_high:  Optional[float] = None
    prev_low:   Optional[float] = None
    rsi_context: Optional[str] = None
    level_hint:  Optional[str] = None


@app.post("/analyze")
async def analyze(payload: AlertPayload) -> dict:
    analysis = run_agents(payload)
    return {"analysis": analysis, "symbol": payload.symbol, "action": payload.action}


@app.get("/health")
async def health():
    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ind(payload: AlertPayload, field: str, fallback=None):
    """Get a field from nested indicators or top-level flat fields."""
    ind = payload.indicators
    if ind:
        v = getattr(ind, field, None)
        if v is not None:
            return v
    return getattr(payload, field, fallback)


def _market_context(payload: AlertPayload) -> list[str]:
    """Build specific, factual bullets about current market conditions."""
    notes: list[str] = []
    price  = payload.price
    rsi    = _ind(payload, 'rsi')
    atr    = _ind(payload, 'atr')
    ema21  = _ind(payload, 'ema21')
    ema55  = _ind(payload, 'ema55')
    vwap   = _ind(payload, 'vwap')
    pdh    = _ind(payload, 'prev_high')
    pdl    = _ind(payload, 'prev_low')
    stoch_k = _ind(payload, 'stoch_k')
    stoch_d = _ind(payload, 'stoch_d')
    squeeze = _ind(payload, 'squeeze')
    ribbon  = _ind(payload, 'ribbon_bull')
    vol_ratio = _ind(payload, 'vol_ratio')
    momentum  = _ind(payload, 'momentum')

    # RSI
    if rsi is not None:
        if rsi < 28:
            notes.append(f"RSI {rsi:.1f} ⚠️ deeply oversold")
        elif rsi < 35:
            notes.append(f"RSI {rsi:.1f} oversold — watch for bounce")
        elif rsi > 72:
            notes.append(f"RSI {rsi:.1f} ⚠️ deeply overbought")
        elif rsi > 65:
            notes.append(f"RSI {rsi:.1f} overbought — watch for fade")
        else:
            notes.append(f"RSI {rsi:.1f} mid-range")

    # VWAP position
    if vwap and price:
        diff_pct = ((price - vwap) / vwap) * 100
        side = "above" if price > vwap else "below"
        notes.append(f"Price {side} VWAP ({abs(diff_pct):.2f}%)")

    # EMA structure
    if ema21 and ema55:
        if price > ema21 > ema55:
            notes.append(f"EMA structure bullish (price>{ema21:.1f}>55EMA)")
        elif price < ema21 < ema55:
            notes.append(f"EMA structure bearish (price<{ema21:.1f}<55EMA)")
        else:
            gap = ema21 - ema55
            notes.append(f"EMA21={ema21:.1f} EMA55={ema55:.1f} ({'+' if gap>0 else ''}{gap:.1f} gap)")
    elif ema21:
        side = "above" if price > ema21 else "below"
        notes.append(f"Price {side} EMA21 ({ema21:.1f})")

    # StochRSI
    if stoch_k is not None:
        if stoch_k < 20:
            notes.append(f"StochRSI K={stoch_k:.0f} oversold")
        elif stoch_k > 80:
            notes.append(f"StochRSI K={stoch_k:.0f} overbought")
        if stoch_d is not None and stoch_k is not None:
            cross = "K>D bullish cross" if stoch_k > stoch_d else "K<D bearish"
            notes.append(f"StochRSI {cross}")

    # Key levels
    if pdh and pdl:
        dist_to_pdh = pdh - price
        dist_to_pdl = price - pdl
        if abs(dist_to_pdh) < (atr or 5) * 0.5:
            notes.append(f"⚡ Near PDH {pdh:.2f} ({dist_to_pdh:+.2f})")
        elif abs(dist_to_pdl) < (atr or 5) * 0.5:
            notes.append(f"⚡ Near PDL {pdl:.2f} ({dist_to_pdl:+.2f})")
        else:
            notes.append(f"PDH {pdh:.2f} / PDL {pdl:.2f}")

    # Squeeze / momentum
    if squeeze:
        notes.append("TTM Squeeze building — energy coiling")
    elif momentum is not None:
        if momentum > 0:
            notes.append(f"Squeeze released — momentum UP ({momentum:.3f})")
        elif momentum < 0:
            notes.append(f"Squeeze released — momentum DOWN ({momentum:.3f})")

    # Volume
    if vol_ratio and vol_ratio >= 1.5:
        notes.append(f"RVOL {vol_ratio:.1f}x above average")

    # Ribbon
    if ribbon is not None:
        notes.append("Ribbon aligned " + ("UP" if ribbon else "DOWN"))

    # ATR context
    if atr:
        notes.append(f"ATR {atr:.2f} ({'low vol' if rsi and atr < 3 else 'elevated vol'})")

    return notes


def _trade_quality(payload: AlertPayload) -> str:
    """Assess signal quality: STRONG / MODERATE / WEAK."""
    score = 0
    rsi    = _ind(payload, 'rsi') or 50
    stoch_k = _ind(payload, 'stoch_k')
    vwap   = _ind(payload, 'vwap')
    ema21  = _ind(payload, 'ema21')
    ribbon = _ind(payload, 'ribbon_bull')
    vol    = _ind(payload, 'vol_ratio') or 0
    action = payload.action

    is_long = action in ('BUY', 'BULLISH')
    is_short = action in ('SELL', 'BEARISH')

    if is_long:
        if rsi < 50: score += 1
        if stoch_k and stoch_k < 40: score += 1
        if vwap and payload.price > vwap: score += 1
        if ema21 and payload.price > ema21: score += 1
        if ribbon is True: score += 1
    elif is_short:
        if rsi > 50: score += 1
        if stoch_k and stoch_k > 60: score += 1
        if vwap and payload.price < vwap: score += 1
        if ema21 and payload.price < ema21: score += 1
        if ribbon is False: score += 1

    if vol >= 1.5: score += 1

    if score >= 4: return "STRONG"
    if score >= 2: return "MODERATE"
    return "WEAK"


def _bias_verdict(payload: AlertPayload) -> str:
    """One-line actionable bias for the current market state."""
    action = payload.action
    rsi    = _ind(payload, 'rsi') or 50
    vwap   = _ind(payload, 'vwap')
    pdh    = _ind(payload, 'prev_high')
    pdl    = _ind(payload, 'prev_low')
    price  = payload.price

    above_vwap = vwap and price > vwap
    near_pdl   = pdl and abs(price - pdl) < (_ind(payload, 'atr') or 5) * 0.5
    near_pdh   = pdh and abs(price - pdh) < (_ind(payload, 'atr') or 5) * 0.5

    if action in ('BUY', 'BULLISH'):
        quality = _trade_quality(payload)
        return f"{quality} long bias — all confluences aligning"
    elif action in ('SELL', 'BEARISH'):
        quality = _trade_quality(payload)
        return f"{quality} short bias — bearish confluences stacking"
    elif action == 'OVERSOLD':
        loc = "at PDL" if near_pdl else ("below VWAP" if not above_vwap else "above VWAP")
        return f"Oversold ({rsi:.1f}) {loc} — monitor for reversal, wait for confirmation"
    elif action == 'OVERBOUGHT':
        loc = "at PDH" if near_pdh else ("above VWAP" if above_vwap else "below VWAP")
        return f"Overbought ({rsi:.1f}) {loc} — monitor for rejection, wait for confirmation"
    else:
        side = "above" if above_vwap else "below"
        return f"No clear edge — price {side} VWAP, RSI {rsi:.1f}, waiting for setup"


# ── Main analysis runner ──────────────────────────────────────────────────────

def run_agents(payload: AlertPayload) -> str:
    parts: list[str] = []
    ind = payload.indicators

    # ── ICT/SMC 6-node pipeline (only for actual directional signals) ─────────
    if _ICT_AVAILABLE and payload.action in ("BUY", "SELL"):
        try:
            result = run_pipeline({
                "symbol":  payload.symbol,
                "action":  payload.action,
                "price":   payload.price,
                "signal":  (ind.signal if ind else None) or "",
                "tier":    payload.tier or "free",
            })
            if result.decision == "EXECUTE" and result.entry and result.confluence and result.risk:
                e, r = result.entry, result.risk
                parts.append(
                    f"[ICT ✅ {result.confluence.score}/7] "
                    f"Entry {e.entry_price} | SL {e.stop_loss} | TP {e.take_profit} | "
                    f"R:R 1:{e.rr_ratio} | {e.entry_type} | {r.position_size} lots"
                )
            else:
                node  = result.stopped_at_node
                score = result.confluence.score if result.confluence else 0
                parts.append(f"[ICT 🚫 Node {node} | {score}/7] {result.summary}")
        except Exception as exc:
            parts.append(f"[ICT error: {exc}]")

    # ── Market context bullets ────────────────────────────────────────────────
    context_notes = _market_context(payload)
    if context_notes:
        parts.append("[Context] " + " | ".join(context_notes[:5]))  # cap at 5 bullets

    # ── Directional verdict ───────────────────────────────────────────────────
    verdict = _bias_verdict(payload)
    parts.append(f"[Bias] {verdict}")

    # ── Risk gate ─────────────────────────────────────────────────────────────
    # Only apply Dr. Strange for actual BUY/SELL signals with real SL math
    if payload.action in ("BUY", "SELL"):
        try:
            from agents.doctor_strange import DoctorStrange
            atr    = _ind(payload, 'atr') or (payload.price * 0.002)
            sl_pct = 1.5 * atr / payload.price  # 1.5× ATR stop
            tp_pct = 3.0 * atr / payload.price  # 3× ATR target → 1:2 RR

            idea = {
                "pair":       payload.symbol,
                "direction":  payload.action,
                "entry":      payload.price,
                "stop_loss":  payload.price * (1 - sl_pct) if payload.action == "BUY" else payload.price * (1 + sl_pct),
                "take_profit":payload.price * (1 + tp_pct) if payload.action == "BUY" else payload.price * (1 - tp_pct),
                "confidence": "medium",
                "timeframe":  payload.timeframe,
            }
            risk_result = DoctorStrange().analyze(trade_ideas=[idea])
            reviews = risk_result.get('trade_reviews', [])
            if reviews:
                r = reviews[0]
                verdict_str = r.get('verdict', 'UNKNOWN')
                reasons = "; ".join(r.get('reasons', []))[:120]
                rr_calc = f"SL {idea['stop_loss']:.2f} → TP {idea['take_profit']:.2f}"
                parts.append(
                    f"[Risk {verdict_str}] {rr_calc}"
                    + (f" — {reasons}" if reasons else "")
                )
        except Exception as e:
            pass  # Dr. Strange unavailable — skip rather than show generic text

    session_note = f" {payload.overlap} overlap." if payload.overlap else f" {payload.session} session."
    return " || ".join(parts) + session_note


if __name__ == "__main__":
    port = int(os.environ.get("AGENT_API_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
