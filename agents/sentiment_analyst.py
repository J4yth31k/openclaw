"""
Sentiment Analysis Agent for Market Analysis
Analyzes market sentiment, volume, momentum, and regime detection.
Uses yfinance for price/volume data and alternative.me for crypto Fear & Greed Index.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json

import yfinance as yf
import pandas as pd
import numpy as np
import requests

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class SentimentAnalyst:
    """Analyzes market sentiment, volume, momentum, and regime."""

    # Default pairs to analyze
    DEFAULT_PAIRS = [
        "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCAD=X",
        "AUDUSD=X", "NZDUSD=X", "XAUUSD=X", "XAGUSD=X",
        "BTC-USD", "ETH-USD", "SOL-USD"
    ]

    # Psychological levels for crypto
    CRYPTO_LEVELS = {
        "BTC-USD": [20000, 30000, 40000, 50000, 60000, 70000],
        "ETH-USD": [1500, 2000, 2500, 3000, 3500, 4000],
        "SOL-USD": [50, 100, 150, 200, 250],
    }

    def __init__(self):
        """Initialize the sentiment analyst."""
        logger.info("Initializing SentimentAnalyst")
        self.analysis_cache = {}
        self.fng_cache = None
        self.fng_cache_time = None

    def get_fear_and_greed_index(self, limit: int = 7) -> Optional[Dict]:
        """
        Fetch Fear & Greed Index from alternative.me API.

        Args:
            limit: Number of days to fetch (default 7)

        Returns:
            Dict with current FNG value and history, or None if failed
        """
        try:
            # Check cache (valid for 1 hour)
            if self.fng_cache and self.fng_cache_time:
                if (datetime.now() - self.fng_cache_time).seconds < 3600:
                    return self.fng_cache

            url = f"https://api.alternative.me/fng/?limit={limit}"
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            data = response.json()
            if data.get("data"):
                fng_data = {
                    "current_value": int(data["data"][0].get("value", 0)),
                    "current_classification": data["data"][0].get("value_classification", "N/A"),
                    "timestamp": data["data"][0].get("timestamp", "N/A"),
                    "history": [
                        {
                            "value": int(item.get("value", 0)),
                            "classification": item.get("value_classification", "N/A"),
                            "timestamp": item.get("timestamp", "N/A")
                        }
                        for item in data["data"]
                    ]
                }
                self.fng_cache = fng_data
                self.fng_cache_time = datetime.now()
                logger.info(f"Fear & Greed Index: {fng_data['current_value']} ({fng_data['current_classification']})")
                return fng_data

        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to fetch Fear & Greed Index: {e}")
        except Exception as e:
            logger.error(f"Error parsing Fear & Greed Index: {e}")

        return None

    def get_volume_analysis(self, symbol: str, period: str = "1y") -> Optional[Dict]:
        """
        Compare current volume to 20-day average.

        Args:
            symbol: Ticker symbol (e.g., "BTC-USD", "EURUSD=X")
            period: Data period (default "1y")

        Returns:
            Dict with volume metrics, or None if failed
        """
        try:
            data = yf.download(symbol, period=period, progress=False)

            if data.empty or len(data) < 20:
                logger.warning(f"Insufficient data for {symbol}")
                return None

            current_volume = data["Volume"].iloc[-1]
            volume_20ma = data["Volume"].tail(20).mean()
            volume_ratio = current_volume / volume_20ma if volume_20ma > 0 else 0

            volume_trend = "high" if volume_ratio > 1.5 else "low" if volume_ratio < 0.67 else "normal"

            return {
                "symbol": symbol,
                "current_volume": int(current_volume) if current_volume > 0 else None,
                "volume_20ma": int(volume_20ma),
                "volume_ratio": round(volume_ratio, 2),
                "status": volume_trend,
                "is_unusual": volume_ratio > 1.5 or volume_ratio < 0.67,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.warning(f"Error analyzing volume for {symbol}: {e}")
            return None

    def calculate_momentum_score(self, symbol: str, period: str = "1y") -> Optional[Dict]:
        """
        Rate momentum 1-10 based on RSI, EMA position, price change, volume.

        Args:
            symbol: Ticker symbol
            period: Data period (default "1y")

        Returns:
            Dict with momentum metrics and score, or None if failed
        """
        try:
            data = yf.download(symbol, period=period, progress=False)

            if data.empty or len(data) < 50:
                logger.warning(f"Insufficient data for momentum analysis: {symbol}")
                return None

            close = data["Close"]

            # RSI calculation
            rsi = self._calculate_rsi(close)
            rsi_current = rsi.iloc[-1]
            rsi_score = 0
            if rsi_current > 70:
                rsi_score = 2  # Overbought
            elif rsi_current > 60:
                rsi_score = 3
            elif rsi_current > 40:
                rsi_score = 5
            elif rsi_current > 30:
                rsi_score = 7
            else:
                rsi_score = 8  # Oversold

            # EMA position (price vs 20 and 50 EMA)
            ema_20 = close.ewm(span=20).mean()
            ema_50 = close.ewm(span=50).mean()

            current_price = close.iloc[-1]
            ema_20_current = ema_20.iloc[-1]
            ema_50_current = ema_50.iloc[-1]

            ema_score = 0
            if current_price > ema_20_current > ema_50_current:
                ema_score = 9  # Strong uptrend
            elif current_price > ema_20_current:
                ema_score = 7
            elif current_price > ema_50_current:
                ema_score = 5
            elif current_price < ema_20_current < ema_50_current:
                ema_score = 1  # Strong downtrend
            elif current_price < ema_20_current:
                ema_score = 3
            else:
                ema_score = 5

            # Price change (1-day and 5-day)
            price_1d_pct = ((close.iloc[-1] / close.iloc[-2]) - 1) * 100
            price_5d_pct = ((close.iloc[-1] / close.iloc[-5]) - 1) * 100

            price_change_score = 5 + (price_5d_pct / 2)  # Max around 10 if 10% 5-day gain
            price_change_score = max(1, min(10, price_change_score))

            # Volume trend
            volume_20ma = data["Volume"].tail(20).mean()
            current_volume = data["Volume"].iloc[-1]
            volume_trend_score = 5 + (2 if current_volume > volume_20ma else -2)

            # Composite momentum score
            momentum_score = (rsi_score + ema_score + price_change_score + volume_trend_score) / 4
            momentum_score = round(momentum_score, 1)

            return {
                "symbol": symbol,
                "momentum_score": momentum_score,
                "components": {
                    "rsi": {
                        "value": round(rsi_current, 2),
                        "score": rsi_score,
                        "status": "overbought" if rsi_current > 70 else "oversold" if rsi_current < 30 else "neutral"
                    },
                    "ema": {
                        "price": round(current_price, 4),
                        "ema_20": round(ema_20_current, 4),
                        "ema_50": round(ema_50_current, 4),
                        "score": ema_score,
                        "trend": "uptrend" if ema_score >= 7 else "downtrend" if ema_score <= 3 else "ranging"
                    },
                    "price_change": {
                        "1d_pct": round(price_1d_pct, 2),
                        "5d_pct": round(price_5d_pct, 2),
                        "score": price_change_score
                    },
                    "volume": {
                        "ratio": round(current_volume / volume_20ma, 2),
                        "score": volume_trend_score
                    }
                },
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.warning(f"Error calculating momentum for {symbol}: {e}")
            return None

    def detect_market_regime(self) -> Optional[Dict]:
        """
        Classify overall market as Risk-On / Risk-Off / Mixed.
        Based on DXY, VIX, BTC, and Gold trends.

        Returns:
            Dict with regime classification and indicators
        """
        try:
            indicators = {}
            scores = []

            # DXY (Dollar Index) - higher = risk-off
            try:
                dxy_data = yf.download("DX-Y.NYB", period="3mo", progress=False)
                if not dxy_data.empty and len(dxy_data) >= 5:
                    dxy_current = dxy_data["Close"].iloc[-1]
                    dxy_ma = dxy_data["Close"].tail(20).mean()
                    dxy_trend = "up" if dxy_current > dxy_ma else "down"
                    dxy_score = 3 if dxy_trend == "up" else 7  # DXY up = risk-off
                    indicators["dxy"] = {
                        "value": round(dxy_current, 2),
                        "trend": dxy_trend,
                        "score": dxy_score
                    }
                    scores.append(dxy_score)
            except Exception as e:
                logger.debug(f"Error fetching DXY: {e}")

            # VIX (Volatility Index) - higher = risk-off
            try:
                vix_data = yf.download("^VIX", period="3mo", progress=False)
                if not vix_data.empty and len(vix_data) >= 5:
                    vix_current = vix_data["Close"].iloc[-1]
                    vix_20ma = vix_data["Close"].tail(20).mean()
                    vix_score = 3 if vix_current > vix_20ma else 7  # Higher VIX = risk-off
                    indicators["vix"] = {
                        "value": round(vix_current, 2),
                        "ma_20": round(vix_20ma, 2),
                        "score": vix_score
                    }
                    scores.append(vix_score)
            except Exception as e:
                logger.debug(f"Error fetching VIX: {e}")

            # BTC (Bitcoin) - uptrend = risk-on
            try:
                btc_data = yf.download("BTC-USD", period="3mo", progress=False)
                if not btc_data.empty and len(btc_data) >= 5:
                    btc_current = btc_data["Close"].iloc[-1]
                    btc_ma = btc_data["Close"].tail(20).mean()
                    btc_score = 7 if btc_current > btc_ma else 3  # BTC up = risk-on
                    indicators["btc"] = {
                        "value": round(btc_current, 2),
                        "trend": "up" if btc_current > btc_ma else "down",
                        "score": btc_score
                    }
                    scores.append(btc_score)
            except Exception as e:
                logger.debug(f"Error fetching BTC: {e}")

            # Gold (XAUUSD) - uptrend = risk-off
            try:
                gold_data = yf.download("XAUUSD=X", period="3mo", progress=False)
                if not gold_data.empty and len(gold_data) >= 5:
                    gold_current = gold_data["Close"].iloc[-1]
                    gold_ma = gold_data["Close"].tail(20).mean()
                    gold_score = 3 if gold_current > gold_ma else 7  # Gold up = risk-off
                    indicators["gold"] = {
                        "value": round(gold_current, 2),
                        "trend": "up" if gold_current > gold_ma else "down",
                        "score": gold_score
                    }
                    scores.append(gold_score)
            except Exception as e:
                logger.debug(f"Error fetching Gold: {e}")

            # Average score
            if scores:
                avg_score = sum(scores) / len(scores)
                if avg_score > 6:
                    regime = "Risk-On"
                elif avg_score < 4:
                    regime = "Risk-Off"
                else:
                    regime = "Mixed"
            else:
                regime = "Unknown"
                avg_score = 5

            return {
                "regime": regime,
                "score": round(avg_score, 1),
                "indicators": indicators,
                "interpretation": {
                    "Risk-On": "Equities and risk assets favored, flight-to-risk sentiment",
                    "Risk-Off": "Flight-to-safety, defensive assets favored",
                    "Mixed": "Indecisive market, mixed sentiment"
                }.get(regime, "Unknown regime"),
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error detecting market regime: {e}")
            return {
                "regime": "Unknown",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    def analyze_crypto_levels(self, symbol: str) -> Optional[Dict]:
        """
        For crypto, check if price is above/below key psychological levels.
        Compare to 200 EMA.

        Args:
            symbol: Crypto ticker (e.g., "BTC-USD")

        Returns:
            Dict with level analysis, or None if failed
        """
        try:
            if symbol not in self.CRYPTO_LEVELS:
                return None

            data = yf.download(symbol, period="1y", progress=False)

            if data.empty or len(data) < 200:
                logger.warning(f"Insufficient data for {symbol}")
                return None

            close = data["Close"]
            current_price = close.iloc[-1]

            # 200 EMA
            ema_200 = close.ewm(span=200).mean()
            ema_200_current = ema_200.iloc[-1]

            # Nearest levels
            levels = self.CRYPTO_LEVELS[symbol]
            price_above_levels = [l for l in levels if l < current_price]
            price_below_levels = [l for l in levels if l > current_price]

            nearest_resistance = price_below_levels[0] if price_below_levels else None
            nearest_support = price_above_levels[-1] if price_above_levels else None

            # Distance to levels (percentage)
            resistance_pct = None
            support_pct = None
            if nearest_resistance:
                resistance_pct = ((nearest_resistance / current_price) - 1) * 100
            if nearest_support:
                support_pct = ((current_price / nearest_support) - 1) * 100

            return {
                "symbol": symbol,
                "current_price": round(current_price, 2),
                "ema_200": round(ema_200_current, 2),
                "price_vs_ema_200": "above" if current_price > ema_200_current else "below",
                "nearest_resistance": nearest_resistance,
                "resistance_distance_pct": round(resistance_pct, 2) if resistance_pct else None,
                "nearest_support": nearest_support,
                "support_distance_pct": round(support_pct, 2) if support_pct else None,
                "levels_passed": len(price_above_levels),
                "total_levels": len(levels),
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.warning(f"Error analyzing crypto levels for {symbol}: {e}")
            return None

    def analyze(self, pairs: List[str] = None) -> Dict:
        """
        Main analysis function.

        Args:
            pairs: List of ticker symbols to analyze (default: DEFAULT_PAIRS)

        Returns:
            Dict with sentiment analysis data
        """
        if pairs is None:
            pairs = self.DEFAULT_PAIRS

        logger.info(f"Running sentiment analysis on {len(pairs)} pairs")

        try:
            analysis = {
                "timestamp": datetime.now().isoformat(),
                "fear_and_greed": self.get_fear_and_greed_index(),
                "market_regime": self.detect_market_regime(),
                "pairs": {},
                "crypto_analysis": {}
            }

            # Volume and momentum analysis for each pair
            for pair in pairs:
                try:
                    volume = self.get_volume_analysis(pair)
                    momentum = self.calculate_momentum_score(pair)

                    if volume or momentum:
                        analysis["pairs"][pair] = {
                            "volume": volume,
                            "momentum": momentum
                        }
                except Exception as e:
                    logger.debug(f"Error analyzing {pair}: {e}")

            # Crypto-specific analysis
            crypto_symbols = ["BTC-USD", "ETH-USD", "SOL-USD"]
            for symbol in crypto_symbols:
                try:
                    crypto_analysis = self.analyze_crypto_levels(symbol)
                    if crypto_analysis:
                        analysis["crypto_analysis"][symbol] = crypto_analysis
                except Exception as e:
                    logger.debug(f"Error analyzing crypto {symbol}: {e}")

            self.analysis_cache = analysis
            logger.info("Sentiment analysis complete")
            return analysis

        except Exception as e:
            logger.error(f"Error in sentiment analysis: {e}", exc_info=True)
            return {
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    def format_report(self, analysis: Dict) -> str:
        """
        Format analysis into Telegram markdown report.

        Args:
            analysis: Dict returned from analyze()

        Returns:
            Markdown-formatted report string
        """
        if "error" in analysis:
            return f"⚠️ *Sentiment Analysis Error*\n`{analysis['error']}`"

        report_lines = [
            "📊 *SENTIMENT ANALYSIS REPORT*",
            f"⏰ Time: {analysis.get('timestamp', 'N/A')[:16]}",
            ""
        ]

        # Fear & Greed Index
        fng = analysis.get("fear_and_greed")
        if fng:
            fng_emoji = "😱" if fng["current_value"] < 25 else "😟" if fng["current_value"] < 45 else "😐" if fng["current_value"] < 55 else "😊" if fng["current_value"] < 75 else "🤑"
            report_lines.append(f"😨 *Fear & Greed Index*: {fng_emoji} {fng['current_value']} ({fng['current_classification']})")
            report_lines.append("")

        # Market Regime
        regime = analysis.get("market_regime")
        if regime and "regime" in regime:
            regime_emoji = "📈" if regime["regime"] == "Risk-On" else "📉" if regime["regime"] == "Risk-Off" else "↔️"
            report_lines.append(f"{regime_emoji} *Market Regime*: {regime['regime']} (Score: {regime.get('score', 'N/A')}/10)")

            # Indicators
            if regime.get("indicators"):
                for ind_name, ind_data in regime["indicators"].items():
                    value = ind_data.get("value", "N/A")
                    trend = ind_data.get("trend", "")
                    report_lines.append(f"  • {ind_name.upper()}: {value} {trend}")
            report_lines.append("")

        # Top momentum pairs
        pairs = analysis.get("pairs", {})
        if pairs:
            momentum_pairs = [
                (pair, data["momentum"])
                for pair, data in pairs.items()
                if data.get("momentum")
            ]
            momentum_pairs.sort(
                key=lambda x: x[1]["momentum_score"],
                reverse=True
            )

            if momentum_pairs:
                report_lines.append("⚡ *TOP MOMENTUM PAIRS*")
                for pair, momentum in momentum_pairs[:5]:
                    score = momentum["momentum_score"]
                    emoji = "🔥" if score >= 8 else "⬆️" if score >= 6 else "➡️" if score >= 4 else "⬇️"
                    ema_trend = momentum["components"]["ema"]["trend"]
                    report_lines.append(
                        f"  {emoji} {pair}: {score}/10 ({ema_trend})"
                    )
                report_lines.append("")

        # Volume alerts
        high_volume_pairs = [
            (pair, data["volume"])
            for pair, data in pairs.items()
            if data.get("volume") and data["volume"].get("is_unusual")
        ]
        if high_volume_pairs:
            report_lines.append("📊 *UNUSUAL VOLUME*")
            for pair, volume in high_volume_pairs[:5]:
                ratio = volume.get("volume_ratio", 0)
                status = "🔴" if ratio > 1.5 else "🟢"
                report_lines.append(f"  {status} {pair}: {ratio}x average")
            report_lines.append("")

        # Crypto analysis
        crypto = analysis.get("crypto_analysis", {})
        if crypto:
            report_lines.append("₿ *CRYPTO TECHNICAL LEVELS*")
            for symbol, data in sorted(crypto.items()):
                price = data.get("current_price", "N/A")
                position = "🔺" if data.get("price_vs_ema_200") == "above" else "🔻"
                report_lines.append(
                    f"  {position} {symbol}: ${price} | "
                    f"Res: ${data.get('nearest_resistance', 'N/A')} | "
                    f"Sup: ${data.get('nearest_support', 'N/A')}"
                )
            report_lines.append("")

        report_lines.append("_Analysis generated by Sentiment Analyst Agent_")

        return "\n".join(report_lines)

    @staticmethod
    def _calculate_rsi(close: pd.Series, period: int = 14) -> pd.Series:
        """Calculate RSI indicator."""
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi


def main():
    """Run sentiment analysis and print report."""
    analyst = SentimentAnalyst()
    analysis = analyst.analyze()
    report = analyst.format_report(analysis)
    print(report)
    print("\n" + "="*50)
    print("Raw Analysis (JSON):")
    print(json.dumps(analysis, indent=2, default=str))


if __name__ == "__main__":
    main()
