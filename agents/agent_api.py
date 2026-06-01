"""
OpenClaw Agent API v3.0  —  Signal Forge Edition
=================================================
Primary strategy: LuxAlgo Signal Forge (openclaw_signal_forge.pine)

Every incoming webhook alert is analyzed in four stages:

  Stage 1 — Signal Forge  : parse confluence score + active indicators
  Stage 2 — ICT pipeline  : session window / daily bias / structure gate
  Stage 3 — Market context: RSI / VWAP / EMA / Stoch / key levels
  Stage 4 — Risk gate     : Dr. Strange ATR-based SL/TP + position sizing

Run:
    source .venv/bin/activate
    python agents/agent_api.py
"""

from __future__ import annotations
import re
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, Any
import uvicorn
import json

try:
    from etsy_api import (
        build_auth_url, exchange_code, get_shop_stats,
        create_listing, upload_digital_file, activate_listing,
        get_listings, get_recent_transactions, is_authenticated,
        generate_product as _etsy_gen_product,
    )
    _ETSY_AVAILABLE = True
except Exception:
    _ETSY_AVAILABLE = False

try:
    from pdf_generator import generate_product, generate_all, PRODUCT_MAP
    _PDF_AVAILABLE = True
except Exception:
    _PDF_AVAILABLE = False

# ── In-memory sim state store (persists across requests within a deploy) ───────
_sim_state: dict[str, Any] = {}

# ── In-memory trade journal store ─────────────────────────────────────────────
_journal_trades: list[dict] = []
_journal_analysis: dict[str, Any] = {}

try:
    from ict_pipeline import run_pipeline
    _ICT_AVAILABLE = True
except Exception:
    _ICT_AVAILABLE = False

try:
    from hulk import Hulk as _Hulk
    _hulk_instance = _Hulk()
    _HULK_AVAILABLE = True
except Exception:
    _HULK_AVAILABLE = False
    _hulk_instance = None  # type: ignore

app = FastAPI(title="OpenClaw Agent API", version="3.0.0")

# ── Signal Forge indicator short-code → readable label ────────────────────────
SF_IND_LABELS: dict[str, str] = {
    "SMA":   "SMA×",
    "RSI":   "RSI",
    "MACD":  "MACD×",
    "ST":    "SuperTrend",
    "STOCH": "Stoch",
    "BB":    "BB",
    "EMA":   "EMA×",
    "AO":    "AO",
    "SAR":   "SAR",
    "CCI":   "CCI",
    "ADX":   "ADX",
}

# ── Pydantic models ───────────────────────────────────────────────────────────

class Indicators(BaseModel):
    rsi:          Optional[float] = None
    atr:          Optional[float] = None
    vol_ratio:    Optional[float] = None
    fast_ema:     Optional[float] = None
    slow_ema:     Optional[float] = None
    stoch_k:      Optional[float] = None
    stoch_d:      Optional[float] = None
    ema8:         Optional[float] = None
    ema21:        Optional[float] = None
    ema55:        Optional[float] = None
    vwap:         Optional[float] = None
    vwap_u1:      Optional[float] = None
    vwap_l1:      Optional[float] = None
    momentum:     Optional[float] = None
    squeeze:      Optional[bool]  = None
    ribbon_bull:  Optional[bool]  = None
    signal:       Optional[str]   = None
    prev_high:    Optional[float] = None
    prev_low:     Optional[float] = None
    nwog_level:   Optional[float] = None
    nwog_present: Optional[bool]  = None
    eqh:          Optional[bool]  = None
    eql:          Optional[bool]  = None
    rsi_context:  Optional[str]   = None
    level_hint:   Optional[str]   = None


class AlertPayload(BaseModel):
    symbol:      str
    action:      str           # BUY | SELL | BULLISH | BEARISH | OVERSOLD | OVERBOUGHT | NEUTRAL
    price:       float
    timeframe:   str
    session:     str
    overlap:     Optional[str]   = None
    indicators:  Optional[Indicators] = None
    strategy:    Optional[str]   = None
    tier:        Optional[str]   = "free"
    # Flat indicator fields (Signal Forge + PriceFeed v2)
    signal:      Optional[str]   = None   # "5/6 (SMA|MACD|ST|STOCH|ADX)"
    rsi:         Optional[float] = None
    atr:         Optional[float] = None
    ema21:       Optional[float] = None
    ema55:       Optional[float] = None
    vwap:        Optional[float] = None
    stoch_k:     Optional[float] = None
    stoch_d:     Optional[float] = None
    vol_ratio:   Optional[float] = None
    prev_high:   Optional[float] = None
    prev_low:    Optional[float] = None
    rsi_context: Optional[str]   = None
    level_hint:  Optional[str]   = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(payload: AlertPayload) -> dict:
    analysis = run_agents(payload)
    return {"analysis": analysis, "symbol": payload.symbol, "action": payload.action}


@app.get("/health")
async def health():
    return {"ok": True, "version": "3.0.0", "strategy": "SignalForge"}


# ── Core helpers ──────────────────────────────────────────────────────────────

def _ind(payload: AlertPayload, field: str, fallback=None):
    """Get a field from nested indicators first, then top-level flat fields."""
    ind = payload.indicators
    if ind:
        v = getattr(ind, field, None)
        if v is not None:
            return v
    return getattr(payload, field, fallback)


def _parse_sf_signal(signal_str: str) -> tuple[int, int, list[str]]:
    """
    Parse Signal Forge signal string.
    '5/6 (SMA|MACD|ST|STOCH|ADX)' → (5, 6, ['SMA', 'MACD', 'ST', 'STOCH', 'ADX'])
    Returns (0, 0, []) if the string doesn't match.
    """
    if not signal_str:
        return 0, 0, []
    m = re.match(r'(\d+)/(\d+)\s*\(([^)]*)\)', signal_str.strip())
    if not m:
        return 0, 0, []
    aligned = int(m.group(1))
    total   = int(m.group(2))
    inds    = [i.strip() for i in m.group(3).split('|') if i.strip()]
    return aligned, total, inds


def _sf_quality(aligned: int, total: int) -> str:
    """Map Signal Forge confluence ratio to STRONG / MODERATE / WEAK."""
    if total == 0:
        return "WEAK"
    pct = aligned / total
    if pct == 1.0:                  return "STRONG+"   # all indicators locked
    if pct >= 0.80:                 return "STRONG"
    if pct >= 0.60:                 return "MODERATE"
    return "WEAK"


def _sf_header(payload: AlertPayload) -> str | None:
    """
    Build the [SF ...] block.  Returns None if this isn't a Signal Forge alert.
    Example output:
      [SF ✅ 5/6 — SMA× MACD× SuperTrend Stoch ADX]
    """
    if "SignalForge" not in (payload.strategy or ""):
        return None

    raw_sig = _ind(payload, 'signal') or payload.signal
    aligned, total, codes = _parse_sf_signal(raw_sig or "")

    if total == 0:
        # No parseable score — at least flag the source
        return "[SF] Signal Forge alert (no score parsed)"

    quality = _sf_quality(aligned, total)
    icon    = "✅" if quality in ("STRONG+", "STRONG") else "⚡" if quality == "MODERATE" else "⚠️"
    labels  = " ".join(SF_IND_LABELS.get(c, c) for c in codes)
    return f"[SF {icon} {aligned}/{total} — {labels}]"


# ── Stage 3: market context bullets ──────────────────────────────────────────

def _market_context(payload: AlertPayload) -> list[str]:
    """Specific, factual bullets about current market conditions."""
    notes: list[str] = []
    price     = payload.price
    rsi       = _ind(payload, 'rsi')
    atr       = _ind(payload, 'atr')
    ema21     = _ind(payload, 'ema21')
    ema55     = _ind(payload, 'ema55')
    vwap      = _ind(payload, 'vwap')
    pdh       = _ind(payload, 'prev_high')
    pdl       = _ind(payload, 'prev_low')
    stoch_k   = _ind(payload, 'stoch_k')
    stoch_d   = _ind(payload, 'stoch_d')
    vol_ratio = _ind(payload, 'vol_ratio')

    # RSI
    if rsi is not None:
        if rsi < 28:       notes.append(f"RSI {rsi:.1f} ⚠️ deeply OS")
        elif rsi < 35:     notes.append(f"RSI {rsi:.1f} oversold")
        elif rsi > 72:     notes.append(f"RSI {rsi:.1f} ⚠️ deeply OB")
        elif rsi > 65:     notes.append(f"RSI {rsi:.1f} overbought")
        else:              notes.append(f"RSI {rsi:.1f}")

    # VWAP position
    if vwap and price:
        diff_pct = ((price - vwap) / vwap) * 100
        side = "▲VWAP" if price > vwap else "▼VWAP"
        notes.append(f"{side} ({abs(diff_pct):.2f}%)")

    # EMA structure
    if ema21 and ema55:
        if price > ema21 > ema55:
            notes.append(f"EMA bullish (>{ema21:.1f}>55)")
        elif price < ema21 < ema55:
            notes.append(f"EMA bearish (<{ema21:.1f}<55)")
        else:
            gap = ema21 - ema55
            notes.append(f"EMA21/55 gap {gap:+.1f}")
    elif ema21:
        notes.append(f"{'▲' if price > ema21 else '▼'} EMA21 {ema21:.1f}")

    # Stochastic
    if stoch_k is not None:
        level = "OS" if stoch_k < 20 else "OB" if stoch_k > 80 else ""
        cross = ""
        if stoch_d is not None:
            cross = " K>D ↑" if stoch_k > stoch_d else " K<D ↓"
        notes.append(f"Stoch K={stoch_k:.0f}{level}{cross}")

    # Key levels — ATR-relative proximity
    atr_ref = atr or 5
    if pdh and pdl:
        dist_pdh = pdh - price
        dist_pdl = price - pdl
        if abs(dist_pdh) < atr_ref * 0.4:
            notes.append(f"⚡PDH {pdh:.2f} ({dist_pdh:+.2f})")
        elif abs(dist_pdl) < atr_ref * 0.4:
            notes.append(f"⚡PDL {pdl:.2f} ({dist_pdl:+.2f})")
        else:
            notes.append(f"PDH {pdh:.2f} / PDL {pdl:.2f}")

    # Volume
    if vol_ratio and vol_ratio >= 1.4:
        notes.append(f"RVOL {vol_ratio:.1f}×")

    # ATR
    if atr:
        notes.append(f"ATR {atr:.2f}")

    return notes


# ── Stage 1+3: trade quality — Signal Forge score is primary ─────────────────

def _trade_quality(payload: AlertPayload) -> str:
    """
    Assess signal quality using Signal Forge's own confluence score when available,
    augmented by independent indicator checks.
    """
    raw_sig = _ind(payload, 'signal') or payload.signal
    aligned, total, _ = _parse_sf_signal(raw_sig or "")

    if total > 0:
        # Signal Forge provided a score — use it as the base
        base = _sf_quality(aligned, total)
        if base == "WEAK":
            return "WEAK"

        # Augment: bonus confirmations
        bonus = 0
        vol_ratio = _ind(payload, 'vol_ratio') or 0
        atr       = _ind(payload, 'atr') or 1
        pdh       = _ind(payload, 'prev_high')
        pdl       = _ind(payload, 'prev_low')
        price     = payload.price
        action    = payload.action

        if vol_ratio >= 1.5:
            bonus += 1
        if pdh and pdl:
            near_pdl = abs(price - pdl) < atr * 0.5
            near_pdh = abs(price - pdh) < atr * 0.5
            if action == "BUY"  and near_pdl: bonus += 1
            if action == "SELL" and near_pdh: bonus += 1

        # Downgrade MODERATE if stoch is against direction
        stoch_k = _ind(payload, 'stoch_k')
        if stoch_k is not None:
            if action == "BUY"  and stoch_k > 75: bonus -= 1
            if action == "SELL" and stoch_k < 25: bonus -= 1

        if base == "STRONG+" or (base == "STRONG" and bonus >= 1):
            return "STRONG"
        if base == "MODERATE" and bonus >= 1:
            return "MODERATE+"
        return base

    # Fallback: score from raw indicators (non-SF alerts)
    score = 0
    rsi    = _ind(payload, 'rsi') or 50
    stoch_k = _ind(payload, 'stoch_k')
    vwap   = _ind(payload, 'vwap')
    ema21  = _ind(payload, 'ema21')
    vol    = _ind(payload, 'vol_ratio') or 0
    action = payload.action
    price  = payload.price

    is_long  = action in ('BUY', 'BULLISH')
    is_short = action in ('SELL', 'BEARISH')

    if is_long:
        if rsi < 50:                          score += 1
        if stoch_k and stoch_k < 40:          score += 1
        if vwap and price > vwap:             score += 1
        if ema21 and price > ema21:           score += 1
    elif is_short:
        if rsi > 50:                          score += 1
        if stoch_k and stoch_k > 60:          score += 1
        if vwap and price < vwap:             score += 1
        if ema21 and price < ema21:           score += 1

    if vol >= 1.5: score += 1

    if score >= 4: return "STRONG"
    if score >= 2: return "MODERATE"
    return "WEAK"


# ── Stage 3: actionable verdict ───────────────────────────────────────────────

def _bias_verdict(payload: AlertPayload) -> str:
    """One-line actionable bias line, Signal Forge-aware."""
    action = payload.action
    price  = payload.price
    rsi    = _ind(payload, 'rsi') or 50
    vwap   = _ind(payload, 'vwap')
    atr    = _ind(payload, 'atr') or 5
    pdh    = _ind(payload, 'prev_high')
    pdl    = _ind(payload, 'prev_low')

    above_vwap = vwap and price > vwap
    near_pdl   = pdl and abs(price - pdl) < atr * 0.5
    near_pdh   = pdh and abs(price - pdh) < atr * 0.5

    quality = _trade_quality(payload)

    # Signal Forge score label for directional signals
    raw_sig = _ind(payload, 'signal') or payload.signal
    aligned, total, _ = _parse_sf_signal(raw_sig or "")
    sf_suffix = f" ({aligned}/{total} SF)" if total > 0 else ""

    if action in ('BUY', 'BULLISH'):
        vwap_tag = "above VWAP" if above_vwap else "below VWAP ⚠️"
        return f"{quality} long{sf_suffix} — {vwap_tag}, RSI {rsi:.1f}"
    elif action in ('SELL', 'BEARISH'):
        vwap_tag = "below VWAP" if not above_vwap else "above VWAP ⚠️"
        return f"{quality} short{sf_suffix} — {vwap_tag}, RSI {rsi:.1f}"
    elif action == 'OVERSOLD':
        loc = "at PDL ⚡" if near_pdl else ("▼VWAP" if not above_vwap else "▲VWAP")
        return f"Oversold {rsi:.1f} {loc} — wait for confirmation"
    elif action == 'OVERBOUGHT':
        loc = "at PDH ⚡" if near_pdh else ("▲VWAP" if above_vwap else "▼VWAP")
        return f"Overbought {rsi:.1f} {loc} — wait for rejection"
    else:
        side = "▲VWAP" if above_vwap else "▼VWAP"
        return f"No edge — {side}, RSI {rsi:.1f}"


# ── Main analysis runner ──────────────────────────────────────────────────────

def run_agents(payload: AlertPayload) -> str:
    parts: list[str] = []
    ind = payload.indicators

    # ── Stage 1: Signal Forge header ─────────────────────────────────────────
    sf_block = _sf_header(payload)
    if sf_block:
        parts.append(sf_block)

    # ── Stage 2: ICT/SMC pipeline (session gate + daily bias + structure) ─────
    if _ICT_AVAILABLE and payload.action in ("BUY", "SELL"):
        try:
            result = run_pipeline({
                "symbol":     payload.symbol,
                "action":     payload.action,
                "price":      payload.price,
                "signal":     _ind(payload, 'signal') or payload.signal or "",
                "tier":       payload.tier or "free",
                # Extra context for bias + confluence nodes
                "rsi":        _ind(payload, 'rsi'),
                "vwap":       _ind(payload, 'vwap'),
                "ema21":      _ind(payload, 'ema21'),
                "ema55":      _ind(payload, 'ema55'),
                "stoch_k":    _ind(payload, 'stoch_k'),
                "prev_high":  _ind(payload, 'prev_high'),
                "prev_low":   _ind(payload, 'prev_low'),
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
                parts.append(f"[ICT 🚫 {node} | {score}/7] {result.summary}")
        except Exception as exc:
            parts.append(f"[ICT err: {exc}]")

    # ── Stage 3: Market context ───────────────────────────────────────────────
    ctx = _market_context(payload)
    if ctx:
        parts.append("[Mkt] " + " | ".join(ctx[:6]))

    # ── Stage 3b: Directional verdict ─────────────────────────────────────────
    parts.append(f"[Bias] {_bias_verdict(payload)}")

    # ── Stage 4: Risk gate (Dr. Strange, ATR-based SL/TP) ─────────────────────
    if payload.action in ("BUY", "SELL"):
        try:
            from doctor_strange import DoctorStrange
            atr    = _ind(payload, 'atr') or (payload.price * 0.002)
            sl_pct = 1.5 * atr / payload.price
            tp_pct = 3.0 * atr / payload.price

            idea = {
                "pair":        payload.symbol,
                "direction":   payload.action,
                "entry":       payload.price,
                "stop_loss":   payload.price * (1 - sl_pct) if payload.action == "BUY"
                               else payload.price * (1 + sl_pct),
                "take_profit": payload.price * (1 + tp_pct) if payload.action == "BUY"
                               else payload.price * (1 - tp_pct),
                "confidence":  "medium",
                "timeframe":   payload.timeframe,
            }
            risk_result = DoctorStrange().analyze(trade_ideas=[idea])
            reviews = risk_result.get('trade_reviews', [])
            if reviews:
                r = reviews[0]
                verdict_str = r.get('verdict', 'UNKNOWN')
                reasons = "; ".join(r.get('reasons', []))[:100]
                rr_str = f"SL {idea['stop_loss']:.2f} → TP {idea['take_profit']:.2f}"
                parts.append(
                    f"[Risk {verdict_str}] {rr_str}"
                    + (f" — {reasons}" if reasons else "")
                )
        except Exception:
            pass  # skip silently — don't show generic fallback

    session_note = (
        f" {payload.overlap} overlap." if payload.overlap
        else f" {payload.session} session."
    )
    return " || ".join(parts) + session_note


# ═══════════════════════════════════════════════════════════════════════════════
# ETSY ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/etsy/auth")
async def etsy_auth():
    """Redirect browser to Etsy OAuth consent screen."""
    if not _ETSY_AVAILABLE:
        raise HTTPException(503, "etsy_api module not available")
    if not os.getenv("ETSY_API_KEY"):
        raise HTTPException(503, "ETSY_API_KEY not set in environment")
    url = build_auth_url()
    return RedirectResponse(url)


@app.get("/etsy/callback")
async def etsy_callback(code: str, state: str):
    """Etsy OAuth callback — exchange code for token."""
    if not _ETSY_AVAILABLE:
        raise HTTPException(503, "etsy_api module not available")
    try:
        data = exchange_code(code, state)
        return JSONResponse({"status": "authenticated", "expires_in": data.get("expires_in")})
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/etsy/status")
async def etsy_status():
    """Check if Etsy OAuth token is present."""
    if not _ETSY_AVAILABLE:
        return {"authenticated": False, "reason": "etsy_api module not loaded"}
    return {
        "authenticated": is_authenticated(),
        "api_key_set":   bool(os.getenv("ETSY_API_KEY")),
    }


@app.get("/etsy/shop")
async def etsy_shop():
    """Return live shop stats from Etsy."""
    if not _ETSY_AVAILABLE or not is_authenticated():
        raise HTTPException(401, "Not authenticated — visit /etsy/auth first")
    try:
        return get_shop_stats()
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/etsy/listings")
async def etsy_listings(limit: int = 25):
    """Return active listings from the Etsy shop."""
    if not _ETSY_AVAILABLE or not is_authenticated():
        raise HTTPException(401, "Not authenticated — visit /etsy/auth first")
    try:
        return {"listings": get_listings(limit)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/etsy/sales")
async def etsy_sales(limit: int = 10):
    """Return recent Etsy transactions."""
    if not _ETSY_AVAILABLE or not is_authenticated():
        raise HTTPException(401, "Not authenticated — visit /etsy/auth first")
    try:
        return {"transactions": get_recent_transactions(limit)}
    except Exception as e:
        raise HTTPException(500, str(e))


class ListingRequest(BaseModel):
    title:       str
    description: str
    price:       float
    tags:        list[str]
    category:    str = "Printables"


@app.post("/etsy/listing")
async def etsy_create_listing(req: ListingRequest):
    """Create a draft listing on Etsy."""
    if not _ETSY_AVAILABLE or not is_authenticated():
        raise HTTPException(401, "Not authenticated — visit /etsy/auth first")
    try:
        return create_listing(req.title, req.description, req.price, req.tags, req.category)
    except Exception as e:
        raise HTTPException(500, str(e))


class GenerateRequest(BaseModel):
    product_key: str
    auto_list:   bool = False   # if True, create Etsy draft + upload PDF automatically


@app.post("/etsy/generate")
async def etsy_generate(req: GenerateRequest):
    """Generate a PDF product and optionally create an Etsy draft listing."""
    if not _PDF_AVAILABLE:
        raise HTTPException(503, "pdf_generator not available — install fpdf2")
    try:
        product_info = generate_product(req.product_key)
    except ValueError as e:
        raise HTTPException(400, str(e))

    result = {"pdf": product_info, "listing": None}

    if req.auto_list and _ETSY_AVAILABLE and is_authenticated():
        try:
            name = product_info["name"]
            listing = create_listing(
                title=f"{name} | Printable PDF | Instant Download",
                description=_default_description(name),
                price=4.99,
                tags=_default_tags(req.product_key),
            )
            upload_digital_file(
                str(listing["listing_id"]),
                product_info["file_path"],
                f"{req.product_key}.pdf",
            )
            result["listing"] = listing
        except Exception as e:
            result["listing_error"] = str(e)

    return result


@app.post("/etsy/generate-all")
async def etsy_generate_all():
    """Generate all PDF products."""
    if not _PDF_AVAILABLE:
        raise HTTPException(503, "pdf_generator not available — install fpdf2")
    products = generate_all()
    return {"products": products, "count": len(products)}


# ═══════════════════════════════════════════════════════════════════════════════
# SIM STATE PERSISTENCE ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/sim/save")
async def sim_save(payload: dict):
    """Save simworld state. Frontend posts entire Zustand store snapshot."""
    _sim_state.clear()
    _sim_state.update(payload)
    return {"status": "saved", "keys": list(payload.keys())}


@app.get("/sim/load")
async def sim_load():
    """Load last saved simworld state."""
    if not _sim_state:
        return {"status": "empty"}
    return {"status": "ok", "state": _sim_state}


# ═══════════════════════════════════════════════════════════════════════════════
# TRADE JOURNAL ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

import csv, io

class JournalIngest(BaseModel):
    trades: list[dict]        # list of trade row dicts

class JournalCSV(BaseModel):
    csv_text: str             # raw CSV string uploaded from the browser


@app.post("/journal/ingest")
async def journal_ingest(payload: JournalIngest):
    """Accept an array of trade dicts and store them in memory. Runs analysis immediately."""
    global _journal_trades, _journal_analysis
    _journal_trades = payload.trades
    if _HULK_AVAILABLE and _hulk_instance:
        _journal_analysis = _hulk_instance.analyze_journal(_journal_trades)
    return {"status": "ok", "trades_loaded": len(_journal_trades)}


@app.post("/journal/ingest-csv")
async def journal_ingest_csv(payload: JournalCSV):
    """Accept raw CSV text, parse it, store trades, and run Hulk analysis."""
    global _journal_trades, _journal_analysis
    try:
        reader = csv.DictReader(io.StringIO(payload.csv_text.strip()))
        _journal_trades = [row for row in reader]
    except Exception as e:
        raise HTTPException(400, f"CSV parse error: {e}")
    if _HULK_AVAILABLE and _hulk_instance:
        _journal_analysis = _hulk_instance.analyze_journal(_journal_trades)
    return {"status": "ok", "trades_loaded": len(_journal_trades)}


@app.get("/journal/entries")
async def journal_entries():
    """Return all stored journal entries."""
    return {"trades": _journal_trades, "count": len(_journal_trades)}


@app.get("/journal/analyze")
async def journal_analyze():
    """Return Hulk's latest journal analysis. Recomputes if journal has entries."""
    global _journal_analysis
    if not _journal_trades:
        return {"status": "empty", "message": "No journal data — upload trades first"}
    if not _HULK_AVAILABLE or not _hulk_instance:
        raise HTTPException(503, "Hulk module not available")
    _journal_analysis = _hulk_instance.analyze_journal(_journal_trades)
    return _journal_analysis


@app.delete("/journal/clear")
async def journal_clear():
    """Clear all stored journal entries."""
    global _journal_trades, _journal_analysis
    _journal_trades = []
    _journal_analysis = {}
    return {"status": "cleared"}


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _default_description(name: str) -> str:
    return (
        f"✨ {name} — Instant Digital Download\n\n"
        "📥 What you get:\n"
        "• High-quality PDF (A4 + US Letter)\n"
        "• Print at home or at any print shop\n"
        "• Minimalist, clean aesthetic\n\n"
        "✅ How it works:\n"
        "1. Purchase & instant download\n"
        "2. Open in any PDF viewer\n"
        "3. Print & use immediately\n\n"
        "💡 No physical product is shipped. This is a digital file.\n\n"
        "OpenClaw Crafts — Organized. Intentional. Aesthetic."
    )


def _default_tags(product_key: str) -> list[str]:
    base = ["printable", "instant download", "digital download", "pdf printable", "planner"]
    extras = {
        "daily_planner":     ["daily planner", "time blocking", "productivity", "undated planner", "planner pages", "daily schedule", "minimalist planner", "planner printable"],
        "weekly_tracker":    ["habit tracker", "weekly habits", "habit log", "self improvement", "wellness planner", "goal tracker", "routine tracker"],
        "budget_tracker":    ["budget planner", "finance tracker", "money planner", "bill tracker", "expense tracker", "savings planner", "budget worksheet"],
        "gratitude_journal": ["gratitude journal", "mindfulness", "self care", "daily journal", "wellness journal", "positive thinking", "journal pages", "30 day challenge"],
        "goal_workbook":     ["goal setting", "vision board", "quarterly planner", "goal planner", "life planner", "achievement tracker", "success planner"],
    }
    all_tags = (extras.get(product_key, []) + base)[:13]
    return all_tags


if __name__ == "__main__":
    port = int(os.environ.get("AGENT_API_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
