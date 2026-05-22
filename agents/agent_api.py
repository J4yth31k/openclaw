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
    rsi:       Optional[float] = None
    atr:       Optional[float] = None
    vol_ratio: Optional[float] = None
    fast_ema:  Optional[float] = None
    slow_ema:  Optional[float] = None


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
    Add more agents here as needed.
    """
    parts: list[str] = []

    try:
        from agents.iron_man import IronMan
        im = IronMan()
        result = im.analyze({
            "symbol":    payload.symbol,
            "action":    payload.action,
            "price":     payload.price,
            "timeframe": payload.timeframe,
            "session":   payload.session,
            "rsi":       payload.indicators.rsi if payload.indicators else None,
            "atr":       payload.indicators.atr if payload.indicators else None,
        })
        parts.append(f"[Iron Man] {result}")
    except Exception as e:
        parts.append(f"[Iron Man] unavailable: {e}")

    try:
        from agents.doctor_strange import DoctorStrange
        ds = DoctorStrange()
        result = ds.analyze({
            "symbol":  payload.symbol,
            "session": payload.session,
            "overlap": payload.overlap,
        })
        parts.append(f"[Dr. Strange] {result}")
    except Exception as e:
        parts.append(f"[Dr. Strange] unavailable: {e}")

    if not parts:
        return build_fallback(payload)

    return " | ".join(parts)


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
