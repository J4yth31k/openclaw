"""
Spider-Man (Peter Parker) - News & Events Agent for Crypto/Forex Markets

My spider-sense is tingling... something big is about to move the markets.
Monitors real-time news feeds, economic data releases, and breaking events
that could impact crypto and forex markets. Uses RSS feeds, CryptoCompare,
and keyword-based sentiment scoring to detect market-moving catalysts.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import json

import feedparser
import requests

logger = logging.getLogger('spider_man')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

PERSONA = "My spider-sense is tingling... something big is about to move the markets."


class SpiderMan:
    """Peter Parker's spider-sense for market-moving news."""

    RSS_FEEDS = {
        'CoinDesk': 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'CoinTelegraph': 'https://cointelegraph.com/rss',
        'ForexLive': 'https://www.forexlive.com/feed/',
        'FXStreet': 'https://www.fxstreet.com/rss',
    }

    PAIR_KEYWORDS = {
        'BTCUSD': ['bitcoin', 'btc', 'satoshi', 'lightning network'],
        'ETHUSD': ['ethereum', 'eth', 'vitalik', 'defi', 'layer 2', 'l2'],
        'SOLUSD': ['solana', 'sol'],
        'EURUSD': ['euro', 'eur', 'ecb', 'eurozone', 'lagarde'],
        'XAUUSD': ['gold', 'xau', 'precious metals', 'safe haven', 'bullion'],
        'USDCAD': ['canadian dollar', 'cad', 'bank of canada', 'boc', 'oil', 'crude'],
    }

    BULLISH_KEYWORDS = [
        'rally', 'surge', 'adoption', 'approval', 'partnership',
        'bullish', 'breakout', 'all-time high', 'accumulation', 'institutional',
        'upgrade', 'record high', 'soars', 'jumps', 'moon', 'pump',
        'etf approved', 'inflows', 'buy signal', 'recovery',
    ]

    BEARISH_KEYWORDS = [
        'crash', 'hack', 'ban', 'lawsuit', 'bearish',
        'sell-off', 'liquidation', 'regulation', 'fraud', 'bankruptcy',
        'plunge', 'dump', 'collapse', 'exploit', 'rug pull',
        'sec charges', 'outflows', 'sell signal', 'capitulation',
    ]

    # High-authority sources get a weighting boost
    HIGH_AUTHORITY_SOURCES = [
        'coindesk', 'cointelegraph', 'reuters', 'bloomberg',
        'wall street journal', 'financial times', 'forexlive',
    ]

    def __init__(self):
        """Initialize Spider-Man - the news & events sentinel."""
        logger.info("Spider-Man swinging in. Spider-sense calibrated for market news...")
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'FuturesFlow-SpiderMan/1.0 (News Aggregator)'
        })
        self.news_cache: List[dict] = []
        self.cache_time: Optional[datetime] = None
        self.cache_ttl = timedelta(minutes=10)

    def _is_cache_fresh(self) -> bool:
        """Check if cached news is still fresh."""
        if not self.cache_time or not self.news_cache:
            return False
        return datetime.now(timezone.utc) - self.cache_time < self.cache_ttl

    def fetch_rss_news(self, feed_url: str, limit: int = 20) -> list:
        """
        Parse an RSS feed and extract recent articles.

        Returns list of dicts with title, link, published, summary, source.
        Filters to articles from the last 24 hours only.
        """
        articles = []
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        try:
            feed = feedparser.parse(feed_url)
            if feed.bozo and not feed.entries:
                logger.warning(f"RSS feed error for {feed_url}: {feed.bozo_exception}")
                return articles

            # Identify source from feed title
            source = feed.feed.get('title', feed_url)

            for entry in feed.entries[:limit]:
                # Parse published date
                published = None
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                    published = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

                # Skip articles older than 24 hours (if we have a date)
                if published and published < cutoff:
                    continue

                summary = ''
                if hasattr(entry, 'summary'):
                    summary = entry.summary[:500]

                articles.append({
                    'title': entry.get('title', 'No Title'),
                    'link': entry.get('link', ''),
                    'published': published.isoformat() if published else None,
                    'summary': summary,
                    'source': source,
                })

        except Exception as e:
            logger.error(f"Error fetching RSS feed {feed_url}: {e}")

        return articles

    def fetch_crypto_news(self, limit: int = 50) -> list:
        """
        Fetch latest crypto news from CryptoCompare free API.

        Returns list of dicts with title, source, categories, published_on, body, url.
        """
        articles = []
        url = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN'
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        try:
            resp = self.session.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            for item in data.get('Data', [])[:limit]:
                published_ts = item.get('published_on', 0)
                published = datetime.fromtimestamp(published_ts, tz=timezone.utc)

                if published < cutoff:
                    continue

                body_excerpt = item.get('body', '')[:500]

                articles.append({
                    'title': item.get('title', 'No Title'),
                    'source': item.get('source', 'CryptoCompare'),
                    'categories': item.get('categories', ''),
                    'published': published.isoformat(),
                    'body': body_excerpt,
                    'link': item.get('guid', item.get('url', '')),
                })

        except requests.RequestException as e:
            logger.error(f"Error fetching CryptoCompare news: {e}")
        except (ValueError, KeyError) as e:
            logger.error(f"Error parsing CryptoCompare response: {e}")

        return articles

    def score_headline_sentiment(self, headline: str) -> dict:
        """
        Score a headline using keyword-based sentiment analysis.

        Returns dict with score (-10 to +10), matched keywords, and label.
        """
        text = headline.lower()
        bullish_matches = [kw for kw in self.BULLISH_KEYWORDS if kw in text]
        bearish_matches = [kw for kw in self.BEARISH_KEYWORDS if kw in text]

        # Base score: each keyword is worth ~2 points, capped at +/-10
        raw_score = (len(bullish_matches) * 2.5) - (len(bearish_matches) * 2.5)

        # Intensity boost for strong language
        intensity_boosters = ['massive', 'huge', 'historic', 'unprecedented', 'record']
        for booster in intensity_boosters:
            if booster in text:
                raw_score *= 1.3
                break

        score = max(-10, min(10, round(raw_score, 1)))

        return {
            'score': score,
            'bullish_keywords': bullish_matches,
            'bearish_keywords': bearish_matches,
            'label': self._sentiment_label(score),
        }

    def detect_market_moving_events(self, news_items: list) -> list:
        """
        Flag potentially market-moving events from a list of scored news items.

        Criteria: high sentiment magnitude, pair-specific mentions, or high-authority sources.
        """
        events = []

        for item in news_items:
            title = item.get('title', '')
            sentiment = item.get('sentiment', {})
            score = sentiment.get('score', 0)
            source = item.get('source', '').lower()

            # Determine affected pairs
            affected_pairs = []
            title_lower = title.lower()
            summary_lower = item.get('summary', '').lower() + ' ' + item.get('body', '').lower()
            combined = title_lower + ' ' + summary_lower

            for pair, keywords in self.PAIR_KEYWORDS.items():
                if any(kw in combined for kw in keywords):
                    affected_pairs.append(pair)

            # Authority boost
            is_high_authority = any(auth in source for auth in self.HIGH_AUTHORITY_SOURCES)

            # Flag if score magnitude > 5, or high authority with score > 3
            threshold = 3 if is_high_authority else 5
            if abs(score) >= threshold or (affected_pairs and abs(score) >= 3):
                events.append({
                    'title': title,
                    'sentiment': score,
                    'source': item.get('source', 'Unknown'),
                    'url': item.get('link', ''),
                    'affected_pairs': affected_pairs if affected_pairs else ['GENERAL'],
                    'published': item.get('published'),
                    'high_authority': is_high_authority,
                })

        # Sort by absolute sentiment score descending
        events.sort(key=lambda x: abs(x['sentiment']), reverse=True)
        return events

    def get_pair_news_sentiment(self, pair: str, news_items: list) -> dict:
        """
        Filter and aggregate news sentiment for a specific trading pair.

        Returns dict with article count, avg sentiment, label, and top headlines.
        """
        keywords = self.PAIR_KEYWORDS.get(pair, [])
        if not keywords:
            return {
                'article_count': 0,
                'avg_sentiment': 0,
                'sentiment_label': 'NEUTRAL',
                'top_headlines': [],
            }

        relevant = []
        for item in news_items:
            combined = (
                item.get('title', '').lower() + ' '
                + item.get('summary', '').lower() + ' '
                + item.get('body', '').lower()
            )
            if any(kw in combined for kw in keywords):
                relevant.append(item)

        if not relevant:
            return {
                'article_count': 0,
                'avg_sentiment': 0,
                'sentiment_label': 'NEUTRAL',
                'top_headlines': [],
            }

        scores = [item.get('sentiment', {}).get('score', 0) for item in relevant]
        avg = round(sum(scores) / len(scores), 2) if scores else 0

        # Top headlines sorted by absolute sentiment
        top = sorted(relevant, key=lambda x: abs(x.get('sentiment', {}).get('score', 0)), reverse=True)[:5]
        top_headlines = [
            {
                'title': item['title'],
                'sentiment': item.get('sentiment', {}).get('score', 0),
                'source': item.get('source', 'Unknown'),
            }
            for item in top
        ]

        return {
            'article_count': len(relevant),
            'avg_sentiment': avg,
            'sentiment_label': self._sentiment_label(avg),
            'top_headlines': top_headlines,
        }

    def analyze(self, pairs: list = None) -> dict:
        """
        Main analysis method. Fetches all news, scores headlines, detects events,
        and calculates per-pair sentiment.

        Args:
            pairs: List of pair names (e.g. ['BTCUSD', 'EURUSD']). Defaults to all.

        Returns:
            Structured dict with status, market-moving events, per-pair sentiment, and overall score.
        """
        if pairs is None:
            pairs = list(self.PAIR_KEYWORDS.keys())

        logger.info(f"Spider-sense activating... scanning news for {len(pairs)} pairs")

        # Use cache if fresh
        if self._is_cache_fresh():
            all_news = self.news_cache
            logger.info(f"Using cached news ({len(all_news)} articles)")
        else:
            # Fetch from all sources
            all_news = []

            # RSS feeds
            for source_name, feed_url in self.RSS_FEEDS.items():
                logger.info(f"Scanning {source_name} RSS feed...")
                articles = self.fetch_rss_news(feed_url, limit=20)
                for article in articles:
                    article['source_type'] = 'rss'
                all_news.extend(articles)

            # CryptoCompare API
            logger.info("Scanning CryptoCompare news API...")
            crypto_news = self.fetch_crypto_news(limit=50)
            for article in crypto_news:
                article['source_type'] = 'api'
            all_news.extend(crypto_news)

            # Update cache
            self.news_cache = all_news
            self.cache_time = datetime.now(timezone.utc)

        # Score all headlines
        for item in all_news:
            item['sentiment'] = self.score_headline_sentiment(item.get('title', ''))

        # Detect market-moving events
        market_moving = self.detect_market_moving_events(all_news)

        # Per-pair sentiment
        pairs_analysis = {}
        all_pair_scores = []
        for pair in pairs:
            pair_result = self.get_pair_news_sentiment(pair, all_news)
            pairs_analysis[pair] = pair_result
            if pair_result['article_count'] > 0:
                all_pair_scores.append(pair_result['avg_sentiment'])

        # Overall market sentiment
        overall = round(sum(all_pair_scores) / len(all_pair_scores), 2) if all_pair_scores else 0

        result = {
            'status': 'success',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'total_articles': len(all_news),
            'market_moving_events': market_moving[:10],  # Top 10 events
            'pairs': pairs_analysis,
            'overall_market_sentiment': overall,
            'sentiment_label': self._sentiment_label(overall),
        }

        logger.info(
            f"Spider-sense report: {len(all_news)} articles scanned, "
            f"{len(market_moving)} market-moving events, "
            f"overall sentiment: {overall} ({result['sentiment_label']})"
        )

        return result

    def format_report(self, analysis: dict) -> str:
        """
        Format the analysis into a Telegram MarkdownV2 report.

        Args:
            analysis: Output from analyze().

        Returns:
            MarkdownV2 formatted string.
        """
        if analysis.get('status') != 'success':
            return self._escape_md("Spider-sense malfunction. Could not scan news.")

        lines = []
        lines.append("*SPIDER\\-MAN NEWS REPORT*")
        lines.append(f"_{self._escape_md(PERSONA)}_")
        lines.append("")

        # Overall sentiment
        overall = analysis.get('overall_market_sentiment', 0)
        label = self._escape_md(analysis.get('sentiment_label', 'NEUTRAL'))
        emoji = self._sentiment_emoji(overall)
        lines.append(f"{emoji} *Overall Market Sentiment:* {self._escape_md(str(overall))} \\({label}\\)")
        lines.append(f"Articles scanned: {analysis.get('total_articles', 0)}")
        lines.append("")

        # Market-moving events
        events = analysis.get('market_moving_events', [])
        if events:
            lines.append("*MARKET\\-MOVING EVENTS*")
            for i, event in enumerate(events[:5], 1):
                score = event.get('sentiment', 0)
                emoji = self._sentiment_emoji(score)
                title = self._escape_md(event['title'][:80])
                source = self._escape_md(event.get('source', 'Unknown'))
                pairs_str = self._escape_md(', '.join(event.get('affected_pairs', [])))
                lines.append(f"{i}\\. {emoji} {title}")
                lines.append(f"   Source: {source} \\| Pairs: {pairs_str} \\| Score: {self._escape_md(str(score))}")
            lines.append("")
        else:
            lines.append("_No major market\\-moving events detected\\._")
            lines.append("")

        # Per-pair breakdown
        lines.append("*PAIR SENTIMENT BREAKDOWN*")
        for pair, data in analysis.get('pairs', {}).items():
            count = data.get('article_count', 0)
            if count == 0:
                continue
            avg = data.get('avg_sentiment', 0)
            pair_label = self._escape_md(data.get('sentiment_label', 'NEUTRAL'))
            emoji = self._sentiment_emoji(avg)
            lines.append(f"{emoji} *{self._escape_md(pair)}*: {self._escape_md(str(avg))} \\({pair_label}\\) \\- {count} articles")

            # Top headline for this pair
            top = data.get('top_headlines', [])
            if top:
                top_title = self._escape_md(top[0]['title'][:60])
                lines.append(f"   Top: _{top_title}_")

        lines.append("")
        ts = analysis.get('timestamp', '')
        if ts:
            lines.append(f"_Updated: {self._escape_md(ts[:19])}_")

        return '\n'.join(lines)

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _sentiment_label(score: float) -> str:
        """Convert a numeric score to a sentiment label."""
        if score >= 5:
            return 'VERY_BULLISH'
        elif score >= 2:
            return 'BULLISH'
        elif score >= 0.5:
            return 'SLIGHTLY_BULLISH'
        elif score > -0.5:
            return 'NEUTRAL'
        elif score > -2:
            return 'SLIGHTLY_BEARISH'
        elif score > -5:
            return 'BEARISH'
        else:
            return 'VERY_BEARISH'

    @staticmethod
    def _sentiment_emoji(score: float) -> str:
        """Return an emoji indicator for the sentiment score."""
        if score >= 5:
            return '\U0001F7E2'   # green circle
        elif score >= 2:
            return '\U0001F7E1'   # yellow circle (bullish lean)
        elif score > -2:
            return '⚪'       # white circle (neutral)
        elif score > -5:
            return '\U0001F7E0'   # orange circle (bearish lean)
        else:
            return '\U0001F534'   # red circle

    @staticmethod
    def _escape_md(text: str) -> str:
        """Escape special characters for Telegram MarkdownV2."""
        special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#',
                         '+', '-', '=', '|', '{', '}', '.', '!']
        for ch in special_chars:
            text = text.replace(ch, f'\\{ch}')
        return text


# -----------------------------------------------------------------------------
# Standalone execution
# -----------------------------------------------------------------------------

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    spidey = SpiderMan()

    print("=" * 60)
    print("SPIDER-MAN NEWS & EVENTS AGENT")
    print("=" * 60)

    result = spidey.analyze()

    if result['status'] == 'success':
        print(f"\nArticles scanned: {result['total_articles']}")
        print(f"Overall sentiment: {result['overall_market_sentiment']} ({result['sentiment_label']})")

        events = result.get('market_moving_events', [])
        if events:
            print(f"\nMarket-moving events ({len(events)}):")
            for i, event in enumerate(events[:5], 1):
                print(f"  {i}. [{event['sentiment']:+.1f}] {event['title'][:80]}")
                print(f"     Source: {event['source']} | Pairs: {', '.join(event['affected_pairs'])}")

        print("\nPair breakdown:")
        for pair, data in result.get('pairs', {}).items():
            if data['article_count'] > 0:
                print(f"  {pair}: {data['avg_sentiment']:+.2f} ({data['sentiment_label']}) - {data['article_count']} articles")

        print("\n--- Telegram Report Preview ---")
        print(spidey.format_report(result))
    else:
        print("Spider-sense malfunction!")

    print("\n" + "=" * 60)
