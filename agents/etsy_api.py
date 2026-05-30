"""
Etsy Open API v3 client — OAuth 2.0 PKCE + listing management
==============================================================
Set in Railway env vars:
  ETSY_API_KEY      — from developers.etsy.com app keystring
  ETSY_API_SECRET   — shared secret (not required for PKCE but needed for some flows)
  ETSY_REDIRECT_URI — e.g. https://openclaw-production-xxxx.up.railway.app/etsy/callback
  RAILWAY_URL       — base URL of this Railway service
"""

from __future__ import annotations
import os, hashlib, base64, secrets, json, time
from typing import Optional
import httpx

# ── Config ────────────────────────────────────────────────────────────────────

ETSY_BASE        = "https://openapi.etsy.com/v3"
ETSY_AUTH_URL    = "https://www.etsy.com/oauth/connect"
ETSY_TOKEN_URL   = "https://api.etsy.com/v3/public/oauth/token"
ETSY_SCOPES      = "listings_r listings_w shops_r shops_w transactions_r"

API_KEY          = os.getenv("ETSY_API_KEY", "")
API_SECRET       = os.getenv("ETSY_API_SECRET", "")
REDIRECT_URI     = os.getenv("ETSY_REDIRECT_URI", "http://localhost:8000/etsy/callback")

# ── In-memory token store (swap for Redis/Postgres in production) ─────────────

_token_store: dict = {}          # {"access_token": ..., "refresh_token": ..., "expires_at": ...}
_pkce_store:  dict = {}          # {state: code_verifier}
_shop_id:     Optional[str] = None

# ── PKCE helpers ──────────────────────────────────────────────────────────────

def _pkce_pair() -> tuple[str, str]:
    verifier  = secrets.token_urlsafe(64)[:128]
    digest    = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def build_auth_url() -> str:
    state              = secrets.token_urlsafe(16)
    verifier, challenge = _pkce_pair()
    _pkce_store[state] = verifier

    params = (
        f"response_type=code"
        f"&client_id={API_KEY}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope={ETSY_SCOPES.replace(' ', '%20')}"
        f"&state={state}"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
    )
    return f"{ETSY_AUTH_URL}?{params}"


def exchange_code(code: str, state: str) -> dict:
    verifier = _pkce_store.pop(state, None)
    if not verifier:
        raise ValueError("Unknown OAuth state — possible CSRF")

    resp = httpx.post(ETSY_TOKEN_URL, data={
        "grant_type":    "authorization_code",
        "client_id":     API_KEY,
        "redirect_uri":  REDIRECT_URI,
        "code":          code,
        "code_verifier": verifier,
    }, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    _token_store.update({
        "access_token":  data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_at":    time.time() + data.get("expires_in", 3600) - 60,
    })
    return data


def _refresh_if_needed():
    if not _token_store:
        raise RuntimeError("Not authenticated — visit /etsy/auth first")
    if time.time() > _token_store.get("expires_at", 0):
        resp = httpx.post(ETSY_TOKEN_URL, data={
            "grant_type":    "refresh_token",
            "client_id":     API_KEY,
            "refresh_token": _token_store["refresh_token"],
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        _token_store.update({
            "access_token": data["access_token"],
            "expires_at":   time.time() + data.get("expires_in", 3600) - 60,
        })


def _headers() -> dict:
    _refresh_if_needed()
    return {
        "x-api-key":     API_KEY,
        "Authorization": f"Bearer {_token_store['access_token']}",
        "Content-Type":  "application/json",
    }

# ── Shop helpers ──────────────────────────────────────────────────────────────

def get_shop_id() -> str:
    global _shop_id
    if _shop_id:
        return _shop_id
    resp = httpx.get(f"{ETSY_BASE}/application/shops", headers=_headers(), timeout=15)
    resp.raise_for_status()
    shops = resp.json().get("results", [])
    if not shops:
        raise RuntimeError("No Etsy shop found for this account")
    _shop_id = str(shops[0]["shop_id"])
    return _shop_id


def get_shop_stats() -> dict:
    shop_id = get_shop_id()
    resp    = httpx.get(f"{ETSY_BASE}/application/shops/{shop_id}", headers=_headers(), timeout=15)
    resp.raise_for_status()
    raw = resp.json()
    return {
        "shop_id":         shop_id,
        "name":            raw.get("shop_name"),
        "sale_message":    raw.get("sale_message"),
        "transaction_sold_count": raw.get("transaction_sold_count", 0),
        "review_count":    raw.get("num_favorers", 0),
        "url":             raw.get("url"),
    }

# ── Listing management ────────────────────────────────────────────────────────

def create_listing(
    title:       str,
    description: str,
    price_usd:   float,
    tags:        list[str],
    category:    str = "Printables",
) -> dict:
    shop_id    = get_shop_id()
    taxonomy   = _category_taxonomy(category)
    body = {
        "quantity":         999,
        "title":            title[:140],
        "description":      description,
        "price":            round(price_usd, 2),
        "who_made":         "i_did",
        "when_made":        "made_to_order",
        "taxonomy_id":      taxonomy,
        "tags":             tags[:13],
        "is_digital":       True,
        "type":             "download",
        "state":            "draft",
        "shipping_profile_id": None,
    }
    resp = httpx.post(
        f"{ETSY_BASE}/application/shops/{shop_id}/listings",
        headers=_headers(), json=body, timeout=20
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "listing_id": data.get("listing_id"),
        "title":      data.get("title"),
        "state":      data.get("state"),
        "url":        f"https://www.etsy.com/listing/{data.get('listing_id')}",
    }


def upload_digital_file(listing_id: str, file_path: str, display_name: str) -> dict:
    shop_id = get_shop_id()
    with open(file_path, "rb") as f:
        content = f.read()

    # Etsy requires multipart upload for digital files
    headers = {k: v for k, v in _headers().items() if k != "Content-Type"}
    resp = httpx.post(
        f"{ETSY_BASE}/application/shops/{shop_id}/listings/{listing_id}/files",
        headers=headers,
        files={"file": (display_name, content, "application/pdf")},
        data={"name": display_name, "rank": 1},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def activate_listing(listing_id: str) -> dict:
    shop_id = get_shop_id()
    resp = httpx.patch(
        f"{ETSY_BASE}/application/shops/{shop_id}/listings/{listing_id}",
        headers=_headers(), json={"state": "active"}, timeout=15
    )
    resp.raise_for_status()
    return {"listing_id": listing_id, "state": "active"}


def get_listings(limit: int = 25) -> list[dict]:
    shop_id = get_shop_id()
    resp = httpx.get(
        f"{ETSY_BASE}/application/shops/{shop_id}/listings/active",
        headers=_headers(), params={"limit": limit}, timeout=15
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return [
        {
            "listing_id": r.get("listing_id"),
            "title":      r.get("title"),
            "price":      r.get("price", {}).get("amount", 0) / 100,
            "views":      r.get("views", 0),
            "sales":      r.get("quantity_sold", 0),
            "state":      r.get("state"),
        }
        for r in results
    ]


def get_recent_transactions(limit: int = 10) -> list[dict]:
    shop_id = get_shop_id()
    resp = httpx.get(
        f"{ETSY_BASE}/application/shops/{shop_id}/transactions",
        headers=_headers(), params={"limit": limit}, timeout=15
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return [
        {
            "transaction_id": r.get("transaction_id"),
            "title":          r.get("title"),
            "price":          float(r.get("price", {}).get("amount", 0)) / 100,
            "created_timestamp": r.get("created_timestamp"),
        }
        for r in results
    ]


def is_authenticated() -> bool:
    return bool(_token_store.get("access_token"))

# ── Taxonomy map ──────────────────────────────────────────────────────────────

def _category_taxonomy(category: str) -> int:
    return {
        "Templates":    2078,   # Paper goods > Stationery
        "Printables":   2078,
        "SVG":          1,      # Digital files > SVG
        "Digital Art":  2613,   # Art & Collectibles > Digital
        "Notion":       2078,
        "Clip Art":     2613,
    }.get(category, 2078)
