"""
Nick Fury - Master Orchestrator / Avengers Commander

Assembles the Avengers. Runs all analysis agents in sequence, compiles
the Avengers Market Intelligence Briefing, and handles Telegram delivery
and scheduling.
"""

import logging
import argparse
import textwrap
from typing import Optional
from datetime import datetime
import requests

# Import Avenger modules
from iron_man import analyze as tech_analyze, format_report as tech_format
from captain_america import CaptainAmerica
from scarlet_witch import ScarletWitch
from thor import Thor
from black_widow import BlackWidow

logger = logging.getLogger('nick_fury')

PERSONA = "Avengers, assemble! Time to see what the world looks like today."


class NickFury:
    """Nick Fury - master orchestrator for the Avengers Market Intelligence Briefing."""

    def __init__(self, pairs: Optional[list[str]] = None):
        """
        Initialize Nick Fury with the Avengers team.

        Args:
            pairs: List of trading pairs to analyze
        """
        self.pairs = pairs or [
            'BTCUSD', 'ETHUSD', 'SOLUSD',
            'EURUSD', 'XAUUSD', 'USDCAD'
        ]

        # Assemble the team
        # Iron Man (Tony Stark) uses module-level analyze(); no class instance needed
        self.fundamental = CaptainAmerica()       # Cap - fundamentals
        self.sentiment = ScarletWitch()            # Wanda - sentiment
        self.correlation = Thor()                  # Thor - correlations
        self.trade_ideas_gen = BlackWidow()        # Natasha - trade ideas

    def _run_all_agents(self) -> tuple:
        """
        Assemble the Avengers and run all agents in sequence.

        Returns:
            Tuple of (technical, fundamental, sentiment, correlation, trade_ideas)
        """
        logger.info("Avengers, assemble! Running all agents...")

        # Iron Man - Technical analysis (module-level function, takes pair name list)
        logger.info("Stark, fire up the suit. Running tactical scan...")
        tech_result = tech_analyze(self.pairs)

        # Captain America - Fundamental analysis (class method, no pairs arg)
        logger.info("Cap, give us the ground truth...")
        fund_result = self.fundamental.analyze()

        # Scarlet Witch - Sentiment analysis
        logger.info("Wanda, read their minds...")
        sent_result = self.sentiment.analyze(self.pairs)

        # Thor - Correlation tracking
        logger.info("Thor, open the Bifrost...")
        corr_result = self.correlation.analyze()

        # Black Widow - Trade ideas generation
        logger.info("Romanoff, compile the intel...")
        ideas_result = self.trade_ideas_gen.generate(
            tech_result, fund_result, sent_result, corr_result
        )

        logger.info("All Avengers reported in. Briefing ready.")
        return tech_result, fund_result, sent_result, corr_result, ideas_result

    def _compile_briefing(self, technical: dict, fundamental: dict,
                         sentiment: dict, correlation: dict,
                         trade_ideas: dict) -> dict:
        """
        Compile all Avenger reports into the unified intelligence briefing.

        Args:
            technical: Iron Man's tactical scan output
            fundamental: Captain America's ground truth output
            sentiment: Scarlet Witch's mind read output
            correlation: Thor's Bifrost scan output
            trade_ideas: Black Widow's mission briefing output

        Returns:
            Dictionary with complete briefing structure
        """
        logger.info("Fury compiling the Avengers Market Intelligence Briefing...")

        briefing = {
            'timestamp': datetime.utcnow().isoformat(),
            'market_overview': self._generate_market_overview(
                technical, sentiment, correlation
            ),
            'technical_analysis': technical,
            'fundamental_outlook': fundamental,
            'sentiment_check': sentiment,
            'correlations': correlation,
            'trade_ideas': trade_ideas,
            'risk_calendar': self._compile_risk_calendar(fundamental)
        }

        return briefing

    def _generate_market_overview(self, technical: dict, sentiment: dict,
                                 correlation: dict) -> dict:
        """Generate market regime and key moves summary."""
        overview = {
            'regime': 'UNKNOWN',
            'key_moves': [],
            'summary': ''
        }

        # Determine regime from sentiment
        if sentiment.get('status') == 'success':
            overall_momentum = sentiment.get('overall_momentum_score', 50)
            if overall_momentum > 60:
                overview['regime'] = 'RISK-ON'
            elif overall_momentum < 40:
                overview['regime'] = 'RISK-OFF'
            else:
                overview['regime'] = 'NEUTRAL'

        # Key moves from technical
        if technical.get('status') == 'success':
            pairs_tech = technical.get('pairs', {})
            for pair, data in pairs_tech.items():
                change = data.get('daily_change_pct', 0)
                if abs(change) > 1.0:
                    direction = 'UP' if change > 0 else 'DOWN'
                    overview['key_moves'].append(f"{pair} {direction} {abs(change):.2f}%")

        # Build summary
        signals = [overview['regime']]
        if overview['key_moves']:
            signals.append(f"{len(overview['key_moves'])} notable moves")

        overview['summary'] = f"Market regime: {' | '.join(signals)}"

        return overview

    def _compile_risk_calendar(self, fundamental: dict) -> dict:
        """Compile upcoming high-impact events."""
        risk_calendar = {
            'high_impact_24h': [],
            'medium_impact_24h': [],
            'summary': ''
        }

        if fundamental.get('status') != 'success':
            return risk_calendar

        events_24h = fundamental.get('high_impact_events_24h', [])
        for event in events_24h:
            if event.get('impact') == 'HIGH':
                risk_calendar['high_impact_24h'].append({
                    'event': event.get('event'),
                    'time': event.get('time'),
                    'pairs': event.get('affected_pairs', [])
                })

        if risk_calendar['high_impact_24h']:
            risk_calendar['summary'] = (
                f"⚠️ {len(risk_calendar['high_impact_24h'])} high-impact events - "
                "expect volatility"
            )
        else:
            risk_calendar['summary'] = "No major events in next 24h"

        return risk_calendar

    def format_briefing_markdown(self, briefing: dict) -> str:
        """
        Format complete briefing as Telegram MarkdownV2.
        The Avengers Market Intelligence Briefing.

        Args:
            briefing: Compiled briefing dictionary

        Returns:
            Formatted markdown string
        """
        sections = []

        # Header
        timestamp = briefing['timestamp']
        sections.append(f"🏴 *AVENGERS MARKET INTELLIGENCE BRIEFING* \\- {timestamp[:10]}")
        sections.append(f"_{PERSONA}_")
        sections.append("")

        # Market Overview
        overview = briefing.get('market_overview', {})
        sections.append("*🏴 SITUATION ROOM*")
        sections.append(overview.get('summary', 'N/A'))
        if overview.get('key_moves'):
            sections.append("Key Moves:")
            for move in overview['key_moves'][:3]:
                sections.append(f"  • {move}")
        sections.append("")

        # Iron Man - Technical Analysis (brief)
        tech = briefing.get('technical_analysis', {})
        if tech.get('status') == 'success':
            sections.append("*🦾 STARK'S TACTICAL SCAN*")
            pairs_tech = tech.get('pairs', {})
            for pair, data in list(pairs_tech.items())[:3]:
                pair_clean = pair.replace('-', '\\-').replace('=', '\\=')
                trend = data.get('trend', 'NEUTRAL')
                price = data.get('current_price', 'N/A')
                sections.append(f"{pair_clean}: {trend} @ {price}")
            sections.append("")

        # Captain America - Fundamental Outlook
        fund = briefing.get('fundamental_outlook', {})
        if fund.get('status') == 'success':
            sections.append("*🛡️ CAP'S GROUND TRUTH*")
            events = fund.get('high_impact_events_24h', [])
            if events:
                for event in events[:2]:
                    event_name = event.get('event', 'Unknown')
                    sections.append(f"  • {event_name}")
            else:
                sections.append("No major events scheduled")
            sections.append("")

        # Scarlet Witch - Sentiment Check
        sent = briefing.get('sentiment_check', {})
        if sent.get('status') == 'success':
            sections.append("*🔮 WANDA'S MIND READ*")
            momentum = sent.get('overall_momentum_score', 50)
            sections.append(f"Momentum: {momentum}/100")
            if sent.get('fear_greed_index'):
                sections.append(f"Fear/Greed: {sent['fear_greed_index']}")
            sections.append("")

        # Thor - Correlations
        corr = briefing.get('correlations', {})
        if corr.get('status') == 'success':
            sections.append("*⚡ THOR'S BIFROST SCAN*")
            sections.append(corr.get('summary', 'See analysis'))
            divergences = corr.get('divergences', [])
            if divergences:
                sections.append(f"{len(divergences)} realm fractures detected")
            sections.append("")

        # Black Widow - Trade Ideas (main section)
        ideas = briefing.get('trade_ideas', {})
        if ideas.get('status') == 'success':
            sections.append("*🕷️ WIDOW'S MISSION BRIEF*")
            trade_list = ideas.get('trade_ideas', [])
            if trade_list:
                sections.append(f"Found {len(trade_list)} targets")
                for i, idea in enumerate(trade_list[:3], 1):
                    pair = idea['pair'].replace('-', '\\-').replace('=', '\\=')
                    direction = idea['direction']
                    confidence = idea['confidence']
                    sections.append(
                        f"{i}\\. {pair} {direction} \\({confidence}\\)"
                    )
            else:
                sections.append("No high-confluence targets at this time")
            sections.append("")

        # Risk Calendar
        risk_cal = briefing.get('risk_calendar', {})
        sections.append("*⚠️ THREAT ASSESSMENT*")
        sections.append(risk_cal.get('summary', 'No critical threats'))
        sections.append("")

        sections.append("_There was an idea... to bring together a group of remarkable people. -- Nick Fury_")

        return "\n".join(sections)

    def _split_telegram_message(self, text: str, max_length: int = 4000) -> list:
        """
        Split text into Telegram-compatible chunks.

        Args:
            text: Full text to split
            max_length: Max chars per message (Telegram limit is 4096)

        Returns:
            List of text chunks
        """
        if len(text) <= max_length:
            return [text]

        chunks = []
        current = ""

        for line in text.split("\n"):
            if len(current) + len(line) + 1 <= max_length:
                current += line + "\n"
            else:
                if current:
                    chunks.append(current)
                current = line + "\n"

        if current:
            chunks.append(current)

        return chunks

    def send_to_telegram(self, briefing: dict, telegram_token: str,
                         chat_id: str) -> bool:
        """
        Send briefing to Telegram via Bot API.

        Args:
            briefing: Compiled briefing dictionary
            telegram_token: Telegram Bot API token
            chat_id: Telegram chat ID

        Returns:
            True if successful, False otherwise
        """
        if not telegram_token or not chat_id:
            logger.error("Missing Telegram credentials")
            return False

        try:
            # Format briefing
            text = self.format_briefing_markdown(briefing)

            # Split into chunks
            chunks = self._split_telegram_message(text)

            # Send each chunk
            api_url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"

            for i, chunk in enumerate(chunks):
                logger.info(f"Sending Telegram message {i+1}/{len(chunks)}")

                payload = {
                    'chat_id': chat_id,
                    'text': chunk,
                    'parse_mode': 'MarkdownV2'
                }

                response = requests.post(api_url, json=payload, timeout=10)

                if response.status_code != 200:
                    logger.error(
                        f"Telegram API error: {response.status_code} - "
                        f"{response.text}"
                    )
                    return False

            logger.info(f"Successfully sent {len(chunks)} message(s) to Telegram")
            return True

        except Exception as e:
            logger.error(f"Error sending to Telegram: {e}")
            return False

    def run_daily_briefing(self, telegram_token: Optional[str] = None,
                          chat_id: Optional[str] = None) -> str:
        """
        Run complete Avengers Market Intelligence Briefing workflow.

        Args:
            telegram_token: Telegram Bot API token (optional)
            chat_id: Telegram chat ID (optional)

        Returns:
            Formatted briefing string
        """
        logger.info("Nick Fury initiating Avengers Market Intelligence Briefing")

        try:
            # Assemble the Avengers
            tech, fund, sent, corr, ideas = self._run_all_agents()

            # Compile briefing
            briefing = self._compile_briefing(tech, fund, sent, corr, ideas)

            # Format for display
            formatted = self.format_briefing_markdown(briefing)

            # Send to Telegram if credentials provided
            if telegram_token and chat_id:
                success = self.send_to_telegram(briefing, telegram_token, chat_id)
                if success:
                    logger.info("Briefing transmitted to Telegram successfully")
                else:
                    logger.warning("Failed to transmit briefing to Telegram")

            logger.info("Avengers briefing completed")
            return formatted

        except Exception as e:
            logger.error(f"Error in Avengers briefing: {e}", exc_info=True)
            raise

    def schedule_daily(self, hour: int = 7, minute: int = 0,
                      telegram_token: Optional[str] = None,
                      chat_id: Optional[str] = None) -> None:
        """
        Schedule daily briefing using APScheduler.

        Args:
            hour: Hour of day to run (0-23, UTC)
            minute: Minute of hour to run (0-59)
            telegram_token: Telegram Bot API token
            chat_id: Telegram chat ID

        Returns:
            None
        """
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.cron import CronTrigger

            scheduler = BackgroundScheduler()

            trigger = CronTrigger(hour=hour, minute=minute)

            scheduler.add_job(
                self.run_daily_briefing,
                trigger=trigger,
                args=[telegram_token, chat_id],
                id='daily_briefing',
                name='Avengers Daily Market Briefing'
            )

            scheduler.start()
            logger.info(f"Scheduled Avengers briefing for {hour:02d}:{minute:02d} UTC")

            return scheduler

        except ImportError:
            logger.error("APScheduler not installed. Install with: pip install apscheduler")
            raise


def main():
    """Command-line interface with argparse."""
    parser = argparse.ArgumentParser(
        description='Nick Fury - Avengers Market Intelligence Briefing orchestrator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent('''
            Examples:
              # Run briefing immediately
              python nick_fury.py --run-now

              # Schedule daily at 7 AM UTC with Telegram
              python nick_fury.py --schedule --telegram-token YOUR_TOKEN --chat-id 123456

              # Analyze specific pairs
              python nick_fury.py --run-now --pairs EURUSD=X GBPUSD=X BTC-USD
        ''')
    )

    parser.add_argument(
        '--run-now',
        action='store_true',
        help='Run briefing immediately'
    )

    parser.add_argument(
        '--schedule',
        action='store_true',
        help='Schedule daily briefing'
    )

    parser.add_argument(
        '--hour',
        type=int,
        default=7,
        help='Hour for scheduled run (0-23, UTC, default: 7)'
    )

    parser.add_argument(
        '--minute',
        type=int,
        default=0,
        help='Minute for scheduled run (0-59, default: 0)'
    )

    parser.add_argument(
        '--telegram-token',
        type=str,
        help='Telegram Bot API token'
    )

    parser.add_argument(
        '--chat-id',
        type=str,
        help='Telegram chat ID'
    )

    parser.add_argument(
        '--pairs',
        nargs='+',
        help='Trading pairs to analyze (space-separated)'
    )

    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level'
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Initialize Nick Fury
    fury = NickFury(pairs=args.pairs)

    if args.run_now:
        logger.info("Fury activating Avengers protocol...")
        try:
            briefing = fury.run_daily_briefing(args.telegram_token, args.chat_id)
            print("\n" + "="*60)
            print(briefing)
            print("="*60)
        except Exception as e:
            logger.error(f"Briefing failed: {e}")
            return 1

    elif args.schedule:
        logger.info(f"Scheduling Avengers briefing for {args.hour:02d}:{args.minute:02d} UTC")
        try:
            scheduler = fury.schedule_daily(
                hour=args.hour,
                minute=args.minute,
                telegram_token=args.telegram_token,
                chat_id=args.chat_id
            )

            logger.info("Scheduler running. Press Ctrl+C to stop.")
            scheduler.start()

            # Keep the scheduler running
            import time
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                logger.info("Standing down...")
                scheduler.shutdown()

        except Exception as e:
            logger.error(f"Scheduling failed: {e}")
            return 1

    else:
        parser.print_help()
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
