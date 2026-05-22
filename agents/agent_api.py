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

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import uvicorn

app = FastAPI(title="OpenClaw Agent API", version="1.0.0")


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


class AlertPayload(BaseModel):
    symbol:     str
    action:     str           # BUY | SELL | NEUTRAL
    price:      float
    timeframe:  str
    session:    str
    overlap:    Optional[str] = None
    indicators: Optional[Indicators] = None
    strategy:   Optional[str] = None
    tier:       Optional[str] = "free"


@app.post("/analyze")
async def analyze(payload: AlertPayload) -> dict:
    """
    Route the alert to relevant Avenger agents and return a composite analysis.
    """
    analysis = run_agents(payload)
    return {"analysis": analysis, "symbol": payload.symbol, "action": payload.action}


@app.get("/health")
async def health():
    return {"ok": True}


def run_agents(payload: AlertPayload) -> str:
    """
    Call the relevant agents and concatenate their output.
    """
    parts: list[str] = []
    ind = payload.indicators

    # ── Iron Man: live multi-timeframe technical analysis ─────────────────────
    try:
        import agents.iron_man as im_module
        result = im_module.analyze([payload.symbol])
        pair_data = result.get('pairs', {}).get(payload.symbol, {})
        tfs = pair_data.get('timeframes', {})

        # Summarise 15m → 5m → 1m scalping context
        scalp_notes: list[str] = []
        for tf in ('15m', '5m', '1m'):
            tf_data = tfs.get(tf, {})
            if not tf_data or tf_data.get('error'):
                continue
            trend = tf_data.get('trend', '')
            srsi  = tf_data.get('stochastic_rsi', {})
            vwap  = tf_data.get('vwap')
            price = tf_data.get('current_price', payload.price)
            note  = f"{tf}: {trend}"
            if srsi.get('k') is not None:
                note += f" | StochRSI K={srsi['k']:.0f}"
            if vwap and price:
                note += f" | {'above' if price > vwap else 'below'} VWAP"
            scalp_notes.append(note)

        if scalp_notes:
            parts.append("[Iron Man] " + " | ".join(scalp_notes))
        elif pair_data.get('error'):
            parts.append(f"[Iron Man] {pair_data['error']}")
        else:
            parts.append("[Iron Man] multi-tf scan complete")
    except Exception as e:
        parts.append(f"[Iron Man] unavailable: {e}")

    # ── Scalping indicator overlay (from TradingView alert) ───────────────────
    if ind:
        scalp: list[str] = []
        if ind.ribbon_bull is not None:
            scalp.append("Ribbon " + ("aligned UP" if ind.ribbon_bull else "aligned DOWN"))
        if ind.stoch_k is not None:
            k = ind.stoch_k
            label = "overbought" if k > 80 else "oversold" if k < 20 else "mid"
            scalp.append(f"StochRSI K={k:.0f} ({label})")
        if ind.vwap is not None:
            diff = ((payload.price - ind.vwap) / ind.vwap * 100)
            scalp.append(f"Price {'above' if diff > 0 else 'below'} VWAP {abs(diff):.2f}%")
        if ind.squeeze is True:
            scalp.append("SQUEEZE building")
        elif ind.signal == 'squeeze':
            mom_dir = "UP" if (ind.momentum or 0) > 0 else "DOWN"
            scalp.append(f"SQUEEZE fired {mom_dir}")
        if ind.vol_ratio and ind.vol_ratio > 1.5:
            scalp.append(f"RVOL {ind.vol_ratio:.1f}x")
        if scalp:
            parts.append("[Scalp] " + " | ".join(scalp))

    # ── Dr. Strange: risk / session filter ───────────────────────────────────
    try:
        from agents.doctor_strange import DoctorStrange
        ds = DoctorStrange()
        dummy_idea = {
            "pair":       payload.symbol,
            "direction":  payload.action,
            "entry":      payload.price,
            "stop_loss":  payload.price * (0.997 if payload.action == "BUY" else 1.003),
            "take_profit":payload.price * (1.006 if payload.action == "BUY" else 0.994),
            "confidence": "medium",
            "timeframe":  payload.timeframe,
        }
        risk_result = ds.analyze(trade_ideas=[dummy_idea])
        reviews = risk_result.get('trade_reviews', [])
        if reviews:
            r = reviews[0]
            verdict = r.get('verdict', 'UNKNOWN')
            reasons = "; ".join(r.get('reasons', []))[:120]
            parts.append(f"[Dr. Strange] {verdict} — {reasons}" if reasons else f"[Dr. Strange] {verdict}")
    except Exception as e:
        parts.append(f"[Dr. Strange] unavailable: {e}")

    if not parts:
        return build_fallback(payload)

    overlap_note = f" {payload.overlap} overlap." if payload.overlap else f" {payload.session} session."
    return " || ".join(parts) + overlap_note


def build_fallback(p: AlertPayload) -> str:
    ind = p.indicators
    rsi_note = ""
    if ind and ind.rsi is not None:
        if ind.rsi > 70:
            rsi_note = " RSI overbought."
        elif ind.rsi < 30:
            rsi_note = " RSI oversold."
        else:
            rsi_note = f" RSI {ind.rsi:.1f} neutral."

    session_note = f" {p.overlap} overlap." if p.overlap else f" {p.session} session."
    direction = "bullish" if p.action == "BUY" else "bearish" if p.action == "SELL" else "neutral"
    return f"{p.symbol} {direction} signal at {p.price}.{rsi_note}{session_note}"


if __name__ == "__main__":
    port = int(os.environ.get("AGENT_API_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
