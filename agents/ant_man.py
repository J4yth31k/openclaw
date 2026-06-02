"""
Ant-Man (Scott Lang) - Etsy Niche Research Agent

"The size of the opportunity doesn't matter. It's how you use it."

Finds the small, underserved niches others overlook. Combines Google Trends,
Etsy public search data, and Claude AI to score and rank niche opportunities.

Key methods:
    research_niche(keyword)           — deep-dive one keyword
    discover_trending_niches(cat)     — auto-discover top opportunities
    generate_niche_report(niches)     — formatted markdown report
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger("ant_man")

PERSONA = "The size of the opportunity doesn't matter. It's how you use it."

ETSY_BASE = "https://openapi.etsy.com/v3"
ETSY_API_KEY = os.getenv("ETSY_API_KEY", "")

# ── Seed niche keywords by category ──────────────────────────────────────────

SEED_NICHES: dict[str, list[str]] = {
    "digital_downloads": [
        "printable wall art", "digital planner", "svg bundle", "notion template",
        "party printable", "digital journal", "budget spreadsheet", "resume template",
        "meal planner printable", "wedding invitation template", "coloring page",
        "affirmation card", "habit tracker printable", "chore chart",
    ],
    "personalized_gifts": [
        "custom name sign", "personalized portrait", "custom pet portrait",
        "name necklace", "custom tumbler", "personalized book", "custom map print",
        "personalized ornament", "custom family portrait", "name puzzle",
    ],
    "home_decor": [
        "boho wall art", "farmhouse decor", "minimalist poster", "botanical print",
        "celestial decor", "macrame wall hanging", "dried flower arrangement",
        "aesthetic room decor", "retro poster", "inspirational quote print",
    ],
    "seasonal": [
        "christmas ornament", "halloween svg", "valentine printable",
        "easter basket tag", "thanksgiving centerpiece", "mothers day gift",
        "fathers day svg", "new year planner", "summer wall art",
    ],
    "nq_es_trader": [
        "trading journal printable", "trading planner", "forex wall art",
        "stock market print", "trader gift", "trading desk decor",
        "investment planner", "financial goal tracker",
    ],
}

# ── Competition thresholds (listing count → label) ───────────────────────────

def _competition_label(count: int) -> str:
    if count < 500:
        return "very low"
    if count < 2_000:
        return "low"
    if count < 8_000:
        return "medium"
    if count < 25_000:
        return "high"
    return "very high"


def _competition_score(count: int) -> float:
    """Inverse score: fewer listings = higher opportunity."""
    if count < 500:
        return 10.0
    if count < 2_000:
        return 8.0
    if count < 8_000:
        return 6.0
    if count < 25_000:
        return 3.5
    return 1.5


# ── Google Trends helper ──────────────────────────────────────────────────────

def _trends_data(keyword: str) -> dict:
    """
    Fetch Google Trends interest for a keyword (last 90 days, US).
    Returns {avg_interest, direction, peak, status}.
    Falls back gracefully if pytrends is unavailable or rate-limited.
    """
    try:
        from pytrends.request import TrendReq
        pt = TrendReq(hl="en-US", tz=300, timeout=(10, 25), retries=2, backoff_factor=0.5)
        pt.build_payload([keyword], cat=0, timeframe="today 3-m", geo="US")
        df = pt.interest_over_time()

        if df.empty or keyword not in df.columns:
            return {"avg_interest": 0, "direction": "unknown", "peak": 0, "status": "no_data"}

        series = df[keyword]
        avg = round(float(series.mean()), 1)
        last4 = series.tail(4).mean()
        first4 = series.head(4).mean()

        if first4 > 0:
            pct_change = (last4 - first4) / first4 * 100
        else:
            pct_change = 0.0

        direction = "rising" if pct_change > 10 else ("falling" if pct_change < -10 else "stable")

        return {
            "avg_interest": avg,
            "direction": direction,
            "peak": int(series.max()),
            "pct_change_90d": round(pct_change, 1),
            "status": "success",
        }

    except ImportError:
        logger.warning("[AntMan] pytrends not installed — trends unavailable")
        return {"avg_interest": 0, "direction": "unknown", "peak": 0, "status": "no_pytrends"}
    except Exception as e:
        logger.warning(f"[AntMan] Google Trends error for '{keyword}': {e}")
        return {"avg_interest": 0, "direction": "unknown", "peak": 0, "status": "error"}


def _trends_score(trend: dict) -> float:
    """Convert trend data into a 0–10 opportunity score."""
    avg = trend.get("avg_interest", 0)
    direction = trend.get("direction", "unknown")

    if avg == 0 and direction == "unknown":
        return 5.0  # no data — neutral

    base = min(avg / 10.0, 10.0)  # 0–10 based on avg interest

    bonus = {"rising": 1.5, "stable": 0.0, "falling": -2.0}.get(direction, 0.0)
    return round(min(10.0, max(0.0, base + bonus)), 2)


# ── Etsy search helper ────────────────────────────────────────────────────────

def _etsy_search(keyword: str, limit: int = 25) -> dict:
    """
    Search Etsy active listings using just the API key (no OAuth required).
    Returns {count, avg_price_usd, sample_titles, status}.
    """
    if not ETSY_API_KEY:
        return {"count": 0, "avg_price_usd": 0, "sample_titles": [], "status": "no_api_key"}

    try:
        resp = httpx.get(
            f"{ETSY_BASE}/application/listings/active",
            headers={"x-api-key": ETSY_API_KEY},
            params={"keywords": keyword, "limit": limit, "sort_on": "score"},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        total_count = data.get("count", len(results))

        prices = []
        titles = []
        for r in results[:10]:
            price_raw = r.get("price", {})
            if isinstance(price_raw, dict):
                amount = price_raw.get("amount", 0)
                divisor = price_raw.get("divisor", 100)
                prices.append(amount / divisor if divisor else 0)
            titles.append(r.get("title", "")[:60])

        avg_price = round(sum(prices) / len(prices), 2) if prices else 0.0

        return {
            "count": total_count,
            "avg_price_usd": avg_price,
            "sample_titles": titles[:5],
            "status": "success",
        }

    except httpx.HTTPStatusError as e:
        logger.warning(f"[AntMan] Etsy search HTTP error for '{keyword}': {e}")
        return {"count": 0, "avg_price_usd": 0, "sample_titles": [], "status": "http_error"}
    except Exception as e:
        logger.warning(f"[AntMan] Etsy search error for '{keyword}': {e}")
        return {"count": 0, "avg_price_usd": 0, "sample_titles": [], "status": "error"}


# ── Price score ───────────────────────────────────────────────────────────────

def _price_score(avg_price: float) -> float:
    """Higher price = better margin potential. Score 0–10."""
    if avg_price <= 0:
        return 5.0  # unknown
    if avg_price >= 50:
        return 10.0
    if avg_price >= 30:
        return 8.0
    if avg_price >= 15:
        return 6.5
    if avg_price >= 8:
        return 5.0
    return 3.0


# ── Claude AI synthesis ───────────────────────────────────────────────────────

def _ai_insights(keyword: str, niche_data: dict) -> str:
    """
    Call Claude to produce a 2–3 sentence niche insight and tag suggestions.
    Falls back to a template string if Anthropic SDK not available.
    """
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

        prompt = (
            f"You are an Etsy niche research expert. Analyze this niche opportunity:\n\n"
            f"Keyword: {keyword}\n"
            f"Google Trends avg interest: {niche_data.get('trend', {}).get('avg_interest', 'N/A')}/100\n"
            f"Trend direction: {niche_data.get('trend', {}).get('direction', 'N/A')}\n"
            f"Etsy listing count: {niche_data.get('listing_count', 'N/A')}\n"
            f"Competition level: {niche_data.get('competition', 'N/A')}\n"
            f"Avg price: ${niche_data.get('avg_price_usd', 0):.2f}\n"
            f"Opportunity score: {niche_data.get('opportunity_score', 0)}/10\n\n"
            f"In 2–3 sentences, explain: (1) why this is or isn't a good niche, "
            f"(2) who the target buyer is, (3) what specific product angle would stand out. "
            f"Then list 10 optimized Etsy tags for this niche (comma-separated). "
            f"Format: INSIGHT: <text>\nTAGS: <tag1>, <tag2>, ..."
        )

        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()

    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"[AntMan] Claude AI error: {e}")

    # Fallback template
    comp = niche_data.get("competition", "medium")
    direction = niche_data.get("trend", {}).get("direction", "stable")
    score = niche_data.get("opportunity_score", 5)
    verdict = "strong opportunity" if score >= 7 else ("decent option" if score >= 5 else "tough market")

    return (
        f"INSIGHT: '{keyword}' is a {verdict} with {comp} competition and {direction} trend. "
        f"Target buyers looking for unique, personalized items in this category. "
        f"Differentiate with high-quality mockups and fast digital delivery.\n"
        f"TAGS: {keyword}, {keyword} gift, {keyword} printable, instant download, digital download, "
        f"wall art, home decor, personalized gift, unique gift, handmade"
    )


# ── Core AntMan class ─────────────────────────────────────────────────────────

class AntMan:
    """Scott Lang's niche research engine — finds the small opportunities others miss."""

    def research_niche(self, keyword: str) -> dict:
        """
        Full niche research for a single keyword.

        Returns:
            {
              keyword, trend, listing_count, competition, avg_price_usd,
              sample_titles, opportunity_score, ai_insights,
              tags_suggested, verdict, timestamp
            }
        """
        logger.info(f"[AntMan] Researching niche: '{keyword}'")

        trend = _trends_data(keyword)
        etsy = _etsy_search(keyword)

        t_score = _trends_score(trend)
        c_score = _competition_score(etsy.get("count", 0))
        p_score = _price_score(etsy.get("avg_price_usd", 0))

        # Weighted opportunity score
        opp_score = round(t_score * 0.4 + c_score * 0.4 + p_score * 0.2, 2)

        niche_data = {
            "keyword": keyword,
            "trend": trend,
            "listing_count": etsy.get("count", 0),
            "competition": _competition_label(etsy.get("count", 0)),
            "avg_price_usd": etsy.get("avg_price_usd", 0),
            "sample_titles": etsy.get("sample_titles", []),
            "trend_score": t_score,
            "competition_score": c_score,
            "price_score": p_score,
            "opportunity_score": opp_score,
            "verdict": _verdict(opp_score),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # AI insights (last, slightly slower)
        raw_ai = _ai_insights(keyword, niche_data)
        insight_text = ""
        tags_suggested = []

        if "INSIGHT:" in raw_ai:
            parts = raw_ai.split("TAGS:")
            insight_text = parts[0].replace("INSIGHT:", "").strip()
            if len(parts) > 1:
                tags_suggested = [t.strip() for t in parts[1].split(",") if t.strip()][:13]

        niche_data["ai_insights"] = insight_text
        niche_data["tags_suggested"] = tags_suggested

        logger.info(
            f"[AntMan] '{keyword}' → score={opp_score}/10, "
            f"comp={niche_data['competition']}, trend={trend.get('direction')}"
        )
        return niche_data

    def discover_trending_niches(
        self,
        category: str = "all",
        top_n: int = 10,
        delay_s: float = 2.0,
    ) -> list[dict]:
        """
        Auto-discover and rank niche opportunities for a category.

        Args:
            category: Key from SEED_NICHES ('digital_downloads', 'personalized_gifts',
                       'home_decor', 'seasonal', 'nq_es_trader') or 'all'
            top_n:    Number of top niches to return
            delay_s:  Seconds to wait between API calls (avoid rate limits)

        Returns:
            List of niche dicts sorted by opportunity_score descending.
        """
        if category == "all":
            seeds = [kw for kws in SEED_NICHES.values() for kw in kws]
        else:
            seeds = SEED_NICHES.get(category, [])

        if not seeds:
            logger.warning(f"[AntMan] Unknown category: {category}")
            return []

        logger.info(f"[AntMan] Scanning {len(seeds)} seed niches in '{category}'")

        results = []
        for kw in seeds:
            try:
                # Lightweight version: skip AI to keep bulk scan fast
                trend = _trends_data(kw)
                etsy = _etsy_search(kw, limit=10)

                t_score = _trends_score(trend)
                c_score = _competition_score(etsy.get("count", 0))
                p_score = _price_score(etsy.get("avg_price_usd", 0))
                opp = round(t_score * 0.4 + c_score * 0.4 + p_score * 0.2, 2)

                results.append({
                    "keyword": kw,
                    "opportunity_score": opp,
                    "competition": _competition_label(etsy.get("count", 0)),
                    "trend_direction": trend.get("direction", "unknown"),
                    "trend_avg": trend.get("avg_interest", 0),
                    "listing_count": etsy.get("count", 0),
                    "avg_price_usd": etsy.get("avg_price_usd", 0),
                    "verdict": _verdict(opp),
                })

                if delay_s > 0:
                    time.sleep(delay_s)

            except Exception as e:
                logger.warning(f"[AntMan] Error scanning '{kw}': {e}")

        results.sort(key=lambda x: x["opportunity_score"], reverse=True)
        top = results[:top_n]

        logger.info(
            f"[AntMan] Discovery complete. Top niche: "
            f"'{top[0]['keyword']}' ({top[0]['opportunity_score']}/10)" if top else "[AntMan] No results"
        )
        return top

    def generate_niche_report(self, niches: list[dict], title: str = "Etsy Niche Report") -> str:
        """
        Generate a formatted markdown niche report.

        Args:
            niches: List of niche dicts (from research_niche or discover_trending_niches)
            title:  Report title

        Returns:
            Markdown string.
        """
        lines = [
            f"# {title}",
            f"_Generated by Ant-Man — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
            f"_\"The size of the opportunity doesn't matter. It's how you use it.\"_",
            "",
            f"**{len(niches)} niches analyzed** | Ranked by opportunity score",
            "",
            "---",
            "",
        ]

        for i, n in enumerate(niches, 1):
            score = n.get("opportunity_score", 0)
            verdict = n.get("verdict", "")
            comp = n.get("competition", "?")
            direction = n.get("trend_direction", n.get("trend", {}).get("direction", "?"))
            price = n.get("avg_price_usd", 0)
            listings = n.get("listing_count", 0)

            bar = "█" * int(score) + "░" * (10 - int(score))
            medal = {1: "🥇", 2: "🥈", 3: "🥉"}.get(i, f"#{i}")

            lines += [
                f"## {medal} {n['keyword'].title()}",
                f"**Score:** `{score}/10` `{bar}`  |  **Verdict:** {verdict}",
                f"",
                f"| Metric | Value |",
                f"|--------|-------|",
                f"| Competition | {comp} ({listings:,} listings) |",
                f"| Trend | {direction} (avg interest: {n.get('trend_avg', '?')}/100) |",
                f"| Avg Price | ${price:.2f} |",
            ]

            if n.get("ai_insights"):
                lines += ["", f"**Insight:** {n['ai_insights']}"]

            if n.get("tags_suggested"):
                tags_str = ", ".join(f"`{t}`" for t in n["tags_suggested"][:10])
                lines += ["", f"**Tags:** {tags_str}"]

            if n.get("sample_titles"):
                lines += [
                    "",
                    "**Sample listings:**",
                    *[f"- _{t}_" for t in n["sample_titles"][:3]],
                ]

            lines += ["", "---", ""]

        return "\n".join(lines)


# ── Verdict helper ────────────────────────────────────────────────────────────

def _verdict(score: float) -> str:
    if score >= 8:
        return "🔥 Hot — move fast"
    if score >= 6.5:
        return "✅ Strong opportunity"
    if score >= 5:
        return "⚡ Decent — worth testing"
    if score >= 3.5:
        return "⚠️ Crowded — differentiate hard"
    return "❌ Skip — too saturated or low demand"


# ── Standalone execution ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    agent = AntMan()

    print("\n" + "=" * 60)
    print("ANT-MAN — ETSY NICHE RESEARCH AGENT")
    print("=" * 60)

    # Quick research on a single keyword
    test_kw = "trading journal printable"
    print(f"\nResearching: '{test_kw}'")
    result = agent.research_niche(test_kw)
    print(json.dumps(result, indent=2, default=str))

    # Discover top niches in one category
    print("\nDiscovering top niches in 'digital_downloads'...")
    top = agent.discover_trending_niches("digital_downloads", top_n=5, delay_s=1.0)
    report = agent.generate_niche_report(top, "Digital Downloads Niche Report")
    print(report)
