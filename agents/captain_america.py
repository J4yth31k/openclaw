"""
Captain America (Steve Rogers) - Fundamental Analysis Agent for Forex Market

The steady foundation. Monitors economic calendar, interest rates, and central bank bias.
Uses free APIs and static calendar data for major economic events.
Here's the ground truth, soldier.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json

logger = logging.getLogger('captain_america')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

PERSONA = "Here's the ground truth, soldier. No shortcuts, no lies -- just the fundamentals."


class CaptainAmerica:
    """Steve Rogers analyzes fundamental factors affecting currency pairs. The steady foundation."""

    # Static calendar of major 2026 economic events
    ECONOMIC_CALENDAR_2026 = {
        "NFP": {  # Non-Farm Payroll (US)
            "dates": ["2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03",
                     "2026-05-08", "2026-06-05", "2026-07-10", "2026-08-07",
                     "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04"],
            "time": "13:30 UTC",
            "impact": 5,
            "currency": "USD"
        },
        "CPI": {  # Consumer Price Index
            "dates": ["2026-01-13", "2026-02-12", "2026-03-12", "2026-04-10",
                     "2026-05-12", "2026-06-11", "2026-07-14", "2026-08-12",
                     "2026-09-11", "2026-10-13", "2026-11-12", "2026-12-10"],
            "time": "13:30 UTC",
            "impact": 5,
            "currency": "USD"
        },
        "FOMC": {  # Federal Reserve Meeting
            "dates": ["2026-01-28", "2026-03-18", "2026-05-06", "2026-06-17",
                     "2026-07-29", "2026-09-16", "2026-11-03", "2026-12-16"],
            "time": "19:00 UTC",
            "impact": 5,
            "currency": "USD"
        },
        "ECB": {  # European Central Bank Meeting
            "dates": ["2026-01-29", "2026-03-12", "2026-04-16", "2026-06-04",
                     "2026-07-16", "2026-09-03", "2026-10-29", "2026-12-17"],
            "time": "13:45 UTC",
            "impact": 5,
            "currency": "EUR"
        },
        "BOJ": {  # Bank of Japan Meeting
            "dates": ["2026-01-23", "2026-03-20", "2026-04-29", "2026-06-19",
                     "2026-07-31", "2026-09-24", "2026-10-30", "2026-12-18"],
            "time": "10:30 JST",
            "impact": 4,
            "currency": "JPY"
        },
        "BOC": {  # Bank of Canada Meeting
            "dates": ["2026-01-27", "2026-03-03", "2026-04-21", "2026-06-02",
                     "2026-07-14", "2026-09-01", "2026-10-27", "2026-12-08"],
            "time": "15:00 UTC",
            "impact": 4,
            "currency": "CAD"
        },
        "Retail Sales": {
            "dates": ["2026-01-16", "2026-02-17", "2026-03-17", "2026-04-17",
                     "2026-05-16", "2026-06-16", "2026-07-17", "2026-08-18",
                     "2026-09-17", "2026-10-16", "2026-11-17", "2026-12-16"],
            "time": "13:30 UTC",
            "impact": 3,
            "currency": "USD"
        },
        "Unemployment": {
            "dates": ["2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03",
                     "2026-05-08", "2026-06-05", "2026-07-10", "2026-08-07",
                     "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04"],
            "time": "13:30 UTC",
            "impact": 4,
            "currency": "USD"
        },
    }

    # Current interest rates (hardcoded - update manually or fetch from API)
    # Source: As of April 2026
    INTEREST_RATES = {
        "FED": {
            "rate": 4.25,  # Updated April 2026
            "last_update": "2026-04-29",
            "bias": "neutral",  # hawkish/neutral/dovish
            "next_meeting": "2026-06-17"
        },
        "ECB": {
            "rate": 3.75,
            "last_update": "2026-04-29",
            "bias": "neutral",
            "next_meeting": "2026-06-04"
        },
        "BOJ": {
            "rate": -0.10,
            "last_update": "2026-04-29",
            "bias": "dovish",
            "next_meeting": "2026-06-19"
        },
        "BOC": {
            "rate": 3.75,
            "last_update": "2026-04-29",
            "bias": "neutral",
            "next_meeting": "2026-06-02"
        },
        "BOE": {
            "rate": 4.75,
            "last_update": "2026-04-29",
            "bias": "neutral",
            "next_meeting": "2026-05-15"
        }
    }

    # Macro impact matrix for major pairs
    PAIR_IMPACT_MATRIX = {
        "EURUSD": {
            "NFP": 4, "CPI": 4, "FOMC": 5, "ECB": 5, "Retail Sales": 3, "Unemployment": 4
        },
        "GBPUSD": {
            "NFP": 3, "CPI": 3, "FOMC": 4, "ECB": 3, "BOE": 5, "Retail Sales": 3
        },
        "USDJPY": {
            "NFP": 4, "CPI": 4, "FOMC": 5, "BOJ": 5, "Retail Sales": 2, "Unemployment": 3
        },
        "USDCAD": {
            "NFP": 4, "CPI": 4, "FOMC": 5, "BOC": 5, "Retail Sales": 3, "Unemployment": 4
        },
        "AUDUSD": {
            "NFP": 3, "CPI": 3, "FOMC": 4, "RBA": 5, "Retail Sales": 2, "Unemployment": 3
        },
        "NZDUSD": {
            "NFP": 3, "CPI": 3, "FOMC": 4, "RBNZ": 5, "Retail Sales": 2, "Unemployment": 2
        },
        "XAUUSD": {  # Gold
            "NFP": 4, "CPI": 5, "FOMC": 5, "ECB": 3, "Retail Sales": 2, "Unemployment": 4
        },
        "BTCUSD": {  # Bitcoin
            "NFP": 2, "CPI": 3, "FOMC": 4, "ECB": 2, "Retail Sales": 1, "Unemployment": 2
        }
    }

    def __init__(self):
        """Initialize Captain America - the fundamental analyst."""
        logger.info("Captain America reporting for duty. Analyzing the fundamentals.")
        self.today = datetime.now().date()
        self.analysis_cache = {}

    def get_todays_events(self) -> List[Dict]:
        """Get all economic events for today."""
        today_str = self.today.isoformat()
        events = []

        for event_name, event_data in self.ECONOMIC_CALENDAR_2026.items():
            if today_str in event_data.get("dates", []):
                events.append({
                    "name": event_name,
                    "time": event_data.get("time"),
                    "impact": event_data.get("impact"),
                    "currency": event_data.get("currency"),
                    "date": today_str
                })

        return sorted(events, key=lambda x: x.get("time", ""))

    def get_week_events(self) -> List[Dict]:
        """Get all economic events for this week."""
        events = []
        today = self.today
        week_end = today + timedelta(days=7)

        current_date = today
        while current_date <= week_end:
            date_str = current_date.isoformat()

            for event_name, event_data in self.ECONOMIC_CALENDAR_2026.items():
                if date_str in event_data.get("dates", []):
                    events.append({
                        "name": event_name,
                        "time": event_data.get("time"),
                        "impact": event_data.get("impact"),
                        "currency": event_data.get("currency"),
                        "date": date_str,
                        "days_away": (current_date - today).days
                    })

            current_date += timedelta(days=1)

        return sorted(events, key=lambda x: (x.get("days_away"), x.get("time", "")))

    def get_interest_rate_differentials(self, pair: str) -> Optional[Dict]:
        """
        Calculate interest rate differential for a currency pair.
        Example: EURUSD differential = EUR rate - USD rate
        """
        try:
            # Map pairs to central banks
            base_currency = pair[:3].upper()
            quote_currency = pair[3:6].upper()

            # Map currency codes to central bank keys
            cb_map = {
                "EUR": "ECB",
                "USD": "FED",
                "JPY": "BOJ",
                "CAD": "BOC",
                "GBP": "BOE",
                "AUD": "RBA",
                "NZD": "RBNZ"
            }

            base_cb = cb_map.get(base_currency)
            quote_cb = cb_map.get(quote_currency)

            if not base_cb or not quote_cb:
                return None

            base_rate = self.INTEREST_RATES.get(base_cb, {}).get("rate", 0)
            quote_rate = self.INTEREST_RATES.get(quote_cb, {}).get("rate", 0)

            differential = base_rate - quote_rate

            return {
                "pair": pair,
                "base_currency": base_currency,
                "quote_currency": quote_currency,
                "base_rate": base_rate,
                "quote_rate": quote_rate,
                "differential": differential,
                "direction": "positive" if differential > 0 else "negative" if differential < 0 else "neutral"
            }
        except Exception as e:
            logger.warning(f"Error calculating interest rate differential for {pair}: {e}")
            return None

    def get_macro_impact_for_pair(self, pair: str, event_name: str) -> int:
        """Get macro impact score (1-5) for a specific pair and event."""
        pair_upper = pair.upper()
        impact_matrix = self.PAIR_IMPACT_MATRIX.get(pair_upper, {})
        return impact_matrix.get(event_name, 1)  # Default to 1 if not found

    def get_central_bank_bias(self) -> Dict:
        """Get current bias for each major central bank."""
        bias = {}
        for cb, data in self.INTEREST_RATES.items():
            bias[cb] = {
                "bias": data.get("bias"),
                "rate": data.get("rate"),
                "next_meeting": data.get("next_meeting"),
                "last_update": data.get("last_update")
            }
        return bias

    def analyze(self) -> Dict:
        """
        Main analysis function. Returns comprehensive fundamental data.

        Returns:
            Dict with keys:
            - today_events: List of events happening today
            - week_events: List of events happening this week
            - interest_rates: Current rates for major CBs
            - central_bank_bias: Hawkish/neutral/dovish stance
            - high_impact_pairs: Pairs with high-impact events this week
            - rate_differentials: Interest rate differentials for pairs
        """
        try:
            logger.info(f"Cap running fundamental recon for {self.today}")

            today_events = self.get_todays_events()
            week_events = self.get_week_events()

            # Identify pairs with high-impact events this week
            high_impact_pairs = {}
            for event in week_events:
                if event.get("impact", 1) >= 4:
                    for pair, impact_matrix in self.PAIR_IMPACT_MATRIX.items():
                        event_impact = impact_matrix.get(event["name"], 0)
                        if event_impact >= 4:
                            if pair not in high_impact_pairs:
                                high_impact_pairs[pair] = []
                            high_impact_pairs[pair].append({
                                "event": event["name"],
                                "impact": event_impact,
                                "date": event["date"],
                                "time": event.get("time")
                            })

            # Calculate rate differentials for major pairs
            major_pairs = [
                "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD"
            ]
            rate_differentials = {}
            for pair in major_pairs:
                diff = self.get_interest_rate_differentials(pair)
                if diff:
                    rate_differentials[pair] = diff

            analysis = {
                "timestamp": datetime.now().isoformat(),
                "analysis_date": self.today.isoformat(),
                "today_events": today_events,
                "week_events": week_events,
                "interest_rates": self.INTEREST_RATES,
                "central_bank_bias": self.get_central_bank_bias(),
                "high_impact_pairs": high_impact_pairs,
                "rate_differentials": rate_differentials,
                "event_count": {
                    "today": len(today_events),
                    "week": len(week_events),
                    "high_impact": len(high_impact_pairs)
                }
            }

            self.analysis_cache = analysis
            logger.info(f"Fundamental recon complete. Found {len(today_events)} events today, "
                       f"{len(week_events)} this week")
            return analysis

        except Exception as e:
            logger.error(f"Error in fundamental analysis: {e}", exc_info=True)
            return {
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    def format_report(self, analysis: Dict) -> str:
        """
        Format analysis into Telegram markdown report.
        Cap's ground truth briefing.

        Args:
            analysis: Dict returned from analyze()

        Returns:
            Markdown-formatted report string
        """
        if "error" in analysis:
            return f"⚠️ *Ground Truth Report Error*\n`{analysis['error']}`"

        report_lines = [
            "🛡️ *CAP'S GROUND TRUTH REPORT*",
            f"📅 Date: {analysis.get('analysis_date', 'N/A')}",
            f"_{PERSONA}_",
            ""
        ]

        # Today's events
        today_events = analysis.get("today_events", [])
        if today_events:
            report_lines.append("🔔 *TODAY'S BATTLEFIELD EVENTS*")
            for event in today_events:
                impact_emoji = "🔴" * event.get("impact", 1)
                report_lines.append(
                    f"  {impact_emoji} {event['name']} ({event['currency']}) "
                    f"@ {event.get('time', 'N/A')}"
                )
            report_lines.append("")
        else:
            report_lines.append("✅ All clear on the front lines today\n")

        # Week events summary
        week_events = analysis.get("week_events", [])
        if week_events:
            report_lines.append("📈 *THIS WEEK'S OPERATIONS*")
            event_summary = {}
            for event in week_events:
                if event.get("impact", 1) >= 4:
                    event_summary[event["name"]] = event_summary.get(event["name"], 0) + 1

            for event_name, count in sorted(event_summary.items()):
                report_lines.append(f"  • {event_name} ({count}x)")
            report_lines.append("")

        # Interest rates
        rates = analysis.get("interest_rates", {})
        if rates:
            report_lines.append("💰 *CURRENT INTEREST RATES*")
            for cb, data in sorted(rates.items()):
                bias_emoji = "📈" if data.get("bias") == "hawkish" else "📉" if data.get("bias") == "dovish" else "➡️"
                report_lines.append(
                    f"  {bias_emoji} {cb}: {data.get('rate', 'N/A')}% ({data.get('bias', 'N/A')})"
                )
            report_lines.append("")

        # High impact pairs
        high_impact = analysis.get("high_impact_pairs", {})
        if high_impact:
            report_lines.append("⚡ *HIGH-IMPACT PAIRS THIS WEEK*")
            for pair, events in sorted(high_impact.items()):
                max_impact = max(e.get("impact", 1) for e in events)
                impact_emoji = "🔴" * max_impact
                report_lines.append(f"  {impact_emoji} {pair} ({len(events)} events)")
                for event in events[:2]:  # Show top 2
                    report_lines.append(f"     - {event['event']} ({event['date']})")
            report_lines.append("")

        # Rate differentials
        differentials = analysis.get("rate_differentials", {})
        if differentials:
            report_lines.append("💱 *INTEREST RATE DIFFERENTIALS*")
            sorted_diffs = sorted(
                differentials.items(),
                key=lambda x: abs(x[1].get("differential", 0)),
                reverse=True
            )
            for pair, diff in sorted_diffs[:5]:
                diff_val = diff.get("differential", 0)
                direction = "🔼" if diff_val > 0 else "🔽" if diff_val < 0 else "➡️"
                report_lines.append(f"  {direction} {pair}: {diff_val:+.2f}%")
            report_lines.append("")

        report_lines.append("_I can do this all day. -- Captain America_")

        return "\n".join(report_lines)


def main():
    """Run fundamental analysis and print report."""
    analyst = CaptainAmerica()
    analysis = analyst.analyze()
    report = analyst.format_report(analysis)
    print(report)
    print("\n" + "="*50)
    print("Raw Analysis (JSON):")
    print(json.dumps(analysis, indent=2, default=str))


if __name__ == "__main__":
    main()
