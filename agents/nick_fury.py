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
from vision import Vision
from spider_man import SpiderMan
from doctor_strange import DoctorStrange
from hulk import Hulk

logger = logging.getLogger('nick_fury')

PERSONA = "Avengers, assemble! Time to see what the world looks like today."


class NickFury:
    """Nick Fury - master orchestrator for the Avengers Market Intelligence Briefing."""

    # Crypto pairs that Vision (order flow) supports
    CRYPTO_PAIRS = {'BTCUSD', 'ETHUSD', 'SOLUSD'}

    def __init__(self, pairs: Optional[list[str]] = None,
                 run_backtest: bool = False,
                 account_size: float = 10000.0):
        """
        Initialize Nick Fury with the Avengers team.

        Args:
            pairs: List of trading pairs to analyze
            run_backtest: Whether to run Hulk's backtesting phase
            account_size: Account size for DoctorStrange risk management
        """
        self.pairs = pairs or [
            'BTCUSD', 'ETHUSD', 'SOLUSD',
            'EURUSD', 'XAUUSD', 'USDCAD'
        ]
        self.run_backtest = run_backtest
        self.account_size = account_size

        # Assemble the team
        # Iron Man (Tony Stark) uses module-level analyze(); no class instance needed
        self.fundamental = CaptainAmerica()       # Cap - fundamentals
        self.sentiment = ScarletWitch()            # Wanda - sentiment
        self.correlation = Thor()                  # Thor - correlations
        self.trade_ideas_gen = BlackWidow()        # Natasha - trade ideas
        self.order_flow = Vision()                 # Vision - order flow
        self.news = SpiderMan()                    # Spider-Man - news
        self.risk_mgr = DoctorStrange()            # Doctor Strange - risk
        self.backtester = Hulk()                   # Hulk - backtesting

    def _run_all_agents(self) -> dict:
        """
        Assemble the Avengers and run all agents in sequence.
        Each agent call is wrapped in try/except for graceful degradation.

        Pipeline phases:
          1. Data gathering (IronMan, Cap, Wanda, Thor, Vision, SpiderMan)
          2. Signal generation (BlackWidow)
          3. Risk validation (DoctorStrange)
          4. Optional backtesting (Hulk)

        Returns:
            Dictionary with all agent results keyed by role name.
        """
        logger.info("Avengers, assemble! Running all agents...")

        # ── Phase 1: Data Gathering ──────────────────────────────────────

        # Iron Man - Technical analysis (module-level function, takes pair name list)
        logger.info("Stark, fire up the suit. Running tactical scan...")
        try:
            tech_result = tech_analyze(self.pairs)
        except Exception as e:
            logger.error(f"Iron Man agent failed: {e}", exc_info=True)
            tech_result = {'status': 'error', 'error': str(e), 'pairs': {}}

        # Captain America - Fundamental analysis (class method, no pairs arg)
        logger.info("Cap, give us the ground truth...")
        try:
            fund_result = self.fundamental.analyze()
        except Exception as e:
            logger.error(f"Captain America agent failed: {e}", exc_info=True)
            fund_result = {'status': 'error', 'error': str(e)}

        # Scarlet Witch - Sentiment analysis
        logger.info("Wanda, read their minds...")
        try:
            sent_result = self.sentiment.analyze(self.pairs)
        except Exception as e:
            logger.error(f"Scarlet Witch agent failed: {e}", exc_info=True)
            sent_result = {'status': 'error', 'error': str(e)}

        # Thor - Correlation tracking
        logger.info("Thor, open the Bifrost...")
        try:
            corr_result = self.correlation.analyze()
        except Exception as e:
            logger.error(f"Thor agent failed: {e}", exc_info=True)
            corr_result = {'status': 'error', 'error': str(e)}

        # Vision - Order flow / liquidity (crypto pairs only)
        crypto_pairs = [p for p in self.pairs if p in self.CRYPTO_PAIRS]
        logger.info("Vision, scan the order books...")
        try:
            if crypto_pairs:
                vision_result = self.order_flow.analyze(crypto_pairs)
            else:
                vision_result = {
                    'status': 'skipped',
                    'reason': 'No crypto pairs in watchlist',
                }
        except Exception as e:
            logger.error(f"Vision agent failed: {e}", exc_info=True)
            vision_result = {'status': 'error', 'error': str(e)}

        # Spider-Man - News & events
        logger.info("Parker, check the Daily Bugle...")
        try:
            news_result = self.news.analyze(self.pairs)
        except Exception as e:
            logger.error(f"Spider-Man agent failed: {e}", exc_info=True)
            news_result = {'status': 'error', 'error': str(e)}

        # ── Phase 2: Signal Generation ───────────────────────────────────

        # Black Widow - Trade ideas generation
        logger.info("Romanoff, compile the intel...")
        try:
            ideas_result = self.trade_ideas_gen.generate(
                tech_result, fund_result, sent_result, corr_result
            )
        except Exception as e:
            logger.error(f"Black Widow agent failed: {e}", exc_info=True)
            ideas_result = {'status': 'error', 'error': str(e), 'trade_ideas': []}

        # ── Phase 3: Risk Validation ─────────────────────────────────────

        # Doctor Strange - Risk management check on trade ideas
        logger.info("Strange, consult the timelines...")
        try:
            risk_result = self.risk_mgr.analyze(
                trade_ideas=ideas_result,
                account_size=self.account_size,
                open_positions=[],          # TODO: feed live positions
                correlation_data=corr_result,
            )
        except Exception as e:
            logger.error(f"Doctor Strange agent failed: {e}", exc_info=True)
            risk_result = {'status': 'error', 'error': str(e)}

        # ── Phase 4: Optional Backtesting ────────────────────────────────

        backtest_result = None
        if self.run_backtest:
            logger.info("HULK SMASH... historical data...")
            try:
                backtest_result = self.backtester.analyze(
                    self.pairs, strategies=None
                )
            except Exception as e:
                logger.error(f"Hulk agent failed: {e}", exc_info=True)
                backtest_result = {'status': 'error', 'error': str(e)}

        logger.info("All Avengers reported in. Briefing ready.")
        return {
            'technical': tech_result,
            'fundamental': fund_result,
            'sentiment': sent_result,
            'correlation': corr_result,
            'order_flow': vision_result,
            'news': news_result,
            'trade_ideas': ideas_result,
            'risk': risk_result,
            'backtest': backtest_result,
        }

    def _compile_briefing(self, results: dict) -> dict:
        """
        Compile all Avenger reports into the unified intelligence briefing.

        Args:
            results: Dictionary of all agent outputs (keyed by role name).

        Returns:
            Dictionary with complete briefing structure
        """
        logger.info("Fury compiling the Avengers Market Intelligence Briefing...")

        technical = results['technical']
        fundamental = results['fundamental']
        sentiment = results['sentiment']
        correlation = results['correlation']

        briefing = {
            'timestamp': datetime.utcnow().isoformat(),
            'market_overview': self._generate_market_overview(
                technical, sentiment, correlation
            ),
            'technical_analysis': technical,
            'fundamental_outlook': fundamental,
            'sentiment_check': sentiment,
            'correlations': correlation,
            'order_flow': results['order_flow'],
            'news': results['news'],
            'trade_ideas': results['trade_ideas'],
            'risk': results['risk'],
            'backtest': results.get('backtest'),
            'risk_calendar': self._compile_risk_calendar(fundamental),
        }

        return briefing

    def _generate_market_overview(self, technical: dict, sentiment: dict,
                                 correlation: dict) -> dict:
        """Generate market regime and key moves summary.

        ScarletWitch returns per-pair momentum in:
          sentiment['pairs'][ticker]['momentum']['momentum_score'] (1-10 scale)
        and market_regime in:
          sentiment['market_regime']['regime'] ('Risk-On'/'Risk-Off'/'Mixed')

        IronMan returns pairs keyed by friendly name in:
          technical['pairs'][pair_name]['timeframes']['1d'] etc.
        """
        overview = {
            'regime': 'UNKNOWN',
            'key_moves': [],
            'summary': ''
        }

        # Determine regime from sentiment
        if sentiment.get('status') == 'success':
            # Use market_regime if available (from ScarletWitch)
            market_regime = sentiment.get('market_regime', {})
            if market_regime and 'regime' in market_regime:
                regime_str = market_regime['regime']
                if regime_str == 'Risk-On':
                    overview['regime'] = 'RISK-ON'
                elif regime_str == 'Risk-Off':
                    overview['regime'] = 'RISK-OFF'
                else:
                    overview['regime'] = 'NEUTRAL'
            else:
                # Fallback: calculate overall momentum from per-pair scores
                pairs_sent = sentiment.get('pairs', {})
                momentum_scores = []
                for pair_key, pair_data in pairs_sent.items():
                    mom = pair_data.get('momentum')
                    if mom and 'momentum_score' in mom:
                        momentum_scores.append(mom['momentum_score'])

                if momentum_scores:
                    avg_momentum = sum(momentum_scores) / len(momentum_scores)
                    # ScarletWitch uses 1-10 scale; > 6 = bullish, < 4 = bearish
                    if avg_momentum > 6:
                        overview['regime'] = 'RISK-ON'
                    elif avg_momentum < 4:
                        overview['regime'] = 'RISK-OFF'
                    else:
                        overview['regime'] = 'NEUTRAL'

        # Key moves from technical (IronMan)
        # IronMan returns {'status': 'success', 'pairs': {'BTCUSD': {'timeframes': {'1d': {'price': ...}}}}}
        if technical.get('status') == 'success':
            pairs_tech = technical.get('pairs', {})
            for pair, data in pairs_tech.items():
                # Calculate daily change from the 1d timeframe data
                tf_1d = data.get('timeframes', {}).get('1d', {})
                price = tf_1d.get('price')
                ema_9 = tf_1d.get('ema', {}).get('9')

                if price and ema_9:
                    # Approximate daily change from price vs EMA9
                    change_pct = ((price - ema_9) / ema_9) * 100
                    if abs(change_pct) > 1.0:
                        direction = 'UP' if change_pct > 0 else 'DOWN'
                        overview['key_moves'].append(
                            f"{pair} {direction} {abs(change_pct):.2f}%"
                        )

        # Build summary
        signals = [overview['regime']]
        if overview['key_moves']:
            signals.append(f"{len(overview['key_moves'])} notable moves")

        overview['summary'] = f"Market regime: {' | '.join(signals)}"

        return overview

    def _compile_risk_calendar(self, fundamental: dict) -> dict:
        """Compile upcoming high-impact events.

        CaptainAmerica returns:
          fundamental['today_events'] = [{'name': 'NFP', 'impact': 5, 'currency': 'USD', 'time': '13:30 UTC'}]
          fundamental['week_events'] = [{'name': ..., 'impact': ..., 'days_away': ...}]
          fundamental['high_impact_pairs'] = {'BTCUSD': [{'event': ..., 'impact': 4}]}
        """
        risk_calendar = {
            'high_impact_24h': [],
            'medium_impact_24h': [],
            'summary': ''
        }

        if fundamental.get('status') != 'success':
            return risk_calendar

        # Use today_events for immediate risk
        today_events = fundamental.get('today_events', [])
        for event in today_events:
            impact = event.get('impact', 0)
            if impact >= 4:
                risk_calendar['high_impact_24h'].append({
                    'event': event.get('name'),
                    'time': event.get('time'),
                    'currency': event.get('currency', 'N/A'),
                })
            elif impact >= 3:
                risk_calendar['medium_impact_24h'].append({
                    'event': event.get('name'),
                    'time': event.get('time'),
                    'currency': event.get('currency', 'N/A'),
                })

        # Also include tomorrow's events from week_events (days_away == 1)
        week_events = fundamental.get('week_events', [])
        for event in week_events:
            if event.get('days_away', 99) == 1 and event.get('impact', 0) >= 4:
                risk_calendar['high_impact_24h'].append({
                    'event': event.get('name'),
                    'time': event.get('time'),
                    'currency': event.get('currency', 'N/A'),
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
                # IronMan stores trend/price inside timeframes
                tf_1d = data.get('timeframes', {}).get('1d', {})
                trend = tf_1d.get('trend', 'N/A')
                price = tf_1d.get('price', 'N/A')
                sections.append(f"{pair_clean}: {trend} @ {price}")
            sections.append("")

        # Captain America - Fundamental Outlook
        fund = briefing.get('fundamental_outlook', {})
        if fund.get('status') == 'success':
            sections.append("*🛡️ CAP'S GROUND TRUTH*")
            # CaptainAmerica uses 'today_events'
            today_events = fund.get('today_events', [])
            high_events = [e for e in today_events if e.get('impact', 0) >= 4]
            if high_events:
                for event in high_events[:2]:
                    event_name = event.get('name', 'Unknown')
                    event_time = event.get('time', '')
                    sections.append(f"  • {event_name} @ {event_time}")
            else:
                sections.append("No major events scheduled")
            sections.append("")

        # Scarlet Witch - Sentiment Check
        sent = briefing.get('sentiment_check', {})
        if sent.get('status') == 'success':
            sections.append("*🔮 WANDA'S MIND READ*")
            # Calculate overall momentum from per-pair scores
            pairs_sent = sent.get('pairs', {})
            momentum_scores = []
            for pair_key, pair_data in pairs_sent.items():
                mom = pair_data.get('momentum')
                if mom and 'momentum_score' in mom:
                    momentum_scores.append(mom['momentum_score'])
            if momentum_scores:
                avg_momentum = sum(momentum_scores) / len(momentum_scores)
                sections.append(f"Momentum: {avg_momentum:.1f}/10")
            # Fear & Greed from top-level
            fng = sent.get('fear_and_greed')
            if fng:
                fng_val = fng.get('current_value', 'N/A')
                fng_class = fng.get('current_classification', '')
                sections.append(f"Fear/Greed: {fng_val} ({fng_class})")
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

        # Vision - Order Flow (crypto only)
        order_flow = briefing.get('order_flow', {})
        if order_flow.get('status') == 'success':
            sections.append("*👁️ VISION'S ORDER FLOW*")
            of_pairs = order_flow.get('pairs', order_flow)
            if isinstance(of_pairs, dict):
                for pair, data in list(of_pairs.items())[:3]:
                    if isinstance(data, dict):
                        bid_pressure = data.get('bid_pressure', 'N/A')
                        ask_pressure = data.get('ask_pressure', 'N/A')
                        oi_signal = data.get('oi_signal', data.get('open_interest_signal', ''))
                        pair_clean = pair.replace('-', '\\-').replace('=', '\\=')
                        sections.append(
                            f"{pair_clean}: Bid {bid_pressure} / Ask {ask_pressure}"
                        )
                        if oi_signal:
                            sections.append(f"  OI: {oi_signal}")
            summary = order_flow.get('summary')
            if summary:
                sections.append(summary)
            sections.append("")
        elif order_flow.get('status') == 'skipped':
            sections.append("*👁️ VISION'S ORDER FLOW*")
            sections.append(f"Skipped: {order_flow.get('reason', 'N/A')}")
            sections.append("")

        # Spider-Man - News & Events
        news = briefing.get('news', {})
        if news.get('status') == 'success':
            sections.append("*🕷️ SPIDER\\-MAN'S INTEL*")
            headlines = news.get('headlines', news.get('alerts', []))
            if headlines:
                for headline in headlines[:3]:
                    if isinstance(headline, dict):
                        title = headline.get('title', headline.get('headline', ''))
                        sections.append(f"  • {title}")
                    else:
                        sections.append(f"  • {headline}")
            overall_sentiment = news.get('overall_sentiment', news.get('sentiment'))
            if overall_sentiment:
                sections.append(f"News Sentiment: {overall_sentiment}")
            sections.append("")

        # Black Widow - Trade Ideas (main section)
        ideas = briefing.get('trade_ideas', {})
        if ideas.get('status') == 'success':
            sections.append("*🕸️ WIDOW'S MISSION BRIEF*")
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

        # Doctor Strange - Risk Assessment
        risk = briefing.get('risk', {})
        if risk.get('status') == 'success':
            sections.append("*🔮 STRANGE'S RISK CHECK*")
            approved = risk.get('approved_trades', risk.get('approved', []))
            vetoed = risk.get('vetoed_trades', risk.get('vetoed', []))
            if isinstance(approved, list):
                sections.append(f"Approved: {len(approved)} trade(s)")
            if isinstance(vetoed, list) and vetoed:
                sections.append(f"Vetoed: {len(vetoed)} trade(s)")
                for v in vetoed[:2]:
                    if isinstance(v, dict):
                        reason = v.get('reason', v.get('veto_reason', 'risk limit'))
                        pair = v.get('pair', 'Unknown')
                        sections.append(f"  ✗ {pair}: {reason}")
            portfolio_risk = risk.get('portfolio_risk', risk.get('total_risk'))
            if portfolio_risk is not None:
                sections.append(f"Portfolio Risk: {portfolio_risk}")
            sections.append("")
        elif risk.get('status') == 'error':
            sections.append("*🔮 STRANGE'S RISK CHECK*")
            sections.append(f"Error: {risk.get('error', 'Unknown')}")
            sections.append("")

        # Hulk - Backtest Results (only if backtest ran)
        backtest = briefing.get('backtest')
        if backtest and backtest.get('status') == 'success':
            sections.append("*💪 HULK'S BATTLE RECORD*")
            bt_pairs = backtest.get('pairs', backtest.get('results', {}))
            if isinstance(bt_pairs, dict):
                for pair, data in list(bt_pairs.items())[:3]:
                    if isinstance(data, dict):
                        win_rate = data.get('win_rate', 'N/A')
                        sharpe = data.get('sharpe_ratio', data.get('sharpe', 'N/A'))
                        pair_clean = pair.replace('-', '\\-').replace('=', '\\=')
                        sections.append(
                            f"{pair_clean}: WR {win_rate} | Sharpe {sharpe}"
                        )
            overall_sharpe = backtest.get('overall_sharpe', backtest.get('sharpe_ratio'))
            if overall_sharpe is not None:
                sections.append(f"Overall Sharpe: {overall_sharpe}")
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
            # Assemble the Avengers — returns a dict keyed by role
            results = self._run_all_agents()

            # Compile briefing
            briefing = self._compile_briefing(results)

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
        '--backtest',
        action='store_true',
        help='Enable Hulk backtesting phase (slower, more thorough)'
    )

    parser.add_argument(
        '--account-size',
        type=float,
        default=10000.0,
        help='Account size in USD for risk management (default: 10000)'
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
    fury = NickFury(
        pairs=args.pairs,
        run_backtest=args.backtest,
        account_size=args.account_size,
    )

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
            # Note: scheduler.start() is already called inside schedule_daily()
            # Do NOT call it again here to avoid duplicate start error

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
