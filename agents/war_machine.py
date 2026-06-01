"""
War Machine (James Rhodes) - Trade Journaling Agent for Forex/Crypto Scalper Bot

"Boom! You looking for this?" -- James Rhodes

War Machine logs everything: every trade, every decision, every outcome.
He maintains a comprehensive trade journal with pre-trade entries, during-trade
updates, post-trade close records, automated trade reviews, session summaries,
and weekly performance reports.

Trade ID format: YYYYMMDD-INSTRUMENT-### (e.g., 20260519-EURUSD-001)
"""

import csv
import json
import logging
import os
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger('war_machine')

PERSONA = "Boom! You looking for this? Every trade, every decision — logged and accounted for."

# Valid event types for during-trade updates
VALID_EVENT_TYPES = {
    'price_at_50pct_tp',
    'stop_to_breakeven',
    'partial_close',
    'invalidation_approach',
    'htf_bias_change',
    'news_event',
}

# Valid exit reasons
VALID_EXIT_REASONS = {
    'TP Hit',
    'SL Hit',
    'Manual Close',
    'Invalidation',
    'News',
    'Drawdown Lockout',
}

MAX_JOURNAL_ENTRIES = 5000


class WarMachine:
    """James Rhodes' trade journaling engine. Logs every trade, every decision, every outcome."""

    def __init__(self, journal_dir: Optional[str] = None):
        if journal_dir is None:
            journal_dir = os.path.join(os.path.dirname(__file__), '..')
        self.journal_dir = os.path.abspath(journal_dir)

        self.journal_json_path = os.path.join(self.journal_dir, 'trade_journal.json')
        self.journal_csv_path = os.path.join(self.journal_dir, 'trade_journal.csv')
        self.session_summaries_path = os.path.join(self.journal_dir, 'session_summaries.json')
        self.weekly_reports_path = os.path.join(self.journal_dir, 'weekly_reports.json')

        self._ensure_files()

        # In-memory index for fast trade lookup
        self._trades: Dict[str, dict] = {}
        self._load_trades()

    # ------------------------------------------------------------------
    # File initialization
    # ------------------------------------------------------------------

    def _ensure_files(self):
        """Create storage files if they don't exist."""
        os.makedirs(self.journal_dir, exist_ok=True)

        if not os.path.exists(self.journal_json_path):
            with open(self.journal_json_path, 'w') as f:
                json.dump([], f, indent=2)

        if not os.path.exists(self.journal_csv_path):
            with open(self.journal_csv_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'trade_id', 'instrument', 'session', 'signal_direction',
                    'signal_timeframe', 'htf_bias', 'confluence_score',
                    'entry_price', 'stop_loss_price', 'take_profit_prices',
                    'stop_loss_pips', 'dollar_risk', 'position_size',
                    'account_balance_at_entry', 'account_type', 'risk_pct_used',
                    'generating_agent', 'timestamp_utc',
                    'exit_price', 'exit_reason', 'trade_duration',
                    'realized_pnl_pips', 'realized_pnl_dollars',
                    'account_balance_at_close', 'rr_achieved', 'rr_planned',
                    'slippage', 'outcome', 'status',
                ])

        if not os.path.exists(self.session_summaries_path):
            with open(self.session_summaries_path, 'w') as f:
                json.dump([], f, indent=2)

        if not os.path.exists(self.weekly_reports_path):
            with open(self.weekly_reports_path, 'w') as f:
                json.dump([], f, indent=2)

    def _load_trades(self):
        """Load trades from JSON into in-memory index."""
        try:
            with open(self.journal_json_path, 'r') as f:
                entries = json.load(f)
            for entry in entries:
                tid = entry.get('trade_id')
                if tid:
                    self._trades[tid] = entry
        except (json.JSONDecodeError, FileNotFoundError):
            logger.warning("Could not load trade journal — starting fresh")
            self._trades = {}

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _save_journal(self):
        """Write the in-memory trade index back to JSON, capped at MAX_JOURNAL_ENTRIES."""
        entries = list(self._trades.values())
        # Sort by timestamp descending, keep most recent
        entries.sort(key=lambda e: e.get('timestamp_utc', ''), reverse=True)
        if len(entries) > MAX_JOURNAL_ENTRIES:
            entries = entries[:MAX_JOURNAL_ENTRIES]
            # Rebuild index
            self._trades = {e['trade_id']: e for e in entries}
        with open(self.journal_json_path, 'w') as f:
            json.dump(entries, f, indent=2)

    def _append_csv(self, trade: dict):
        """Append a single trade row to the CSV journal."""
        tp_prices = trade.get('take_profit_prices', [])
        tp_str = '|'.join(str(p) for p in tp_prices) if isinstance(tp_prices, list) else str(tp_prices)

        row = [
            trade.get('trade_id', ''),
            trade.get('instrument', ''),
            trade.get('session', ''),
            trade.get('signal_direction', ''),
            trade.get('signal_timeframe', ''),
            trade.get('htf_bias', ''),
            trade.get('confluence_score', ''),
            trade.get('entry_price', ''),
            trade.get('stop_loss_price', ''),
            tp_str,
            trade.get('stop_loss_pips', ''),
            trade.get('dollar_risk', ''),
            trade.get('position_size', ''),
            trade.get('account_balance_at_entry', ''),
            trade.get('account_type', ''),
            trade.get('risk_pct_used', ''),
            trade.get('generating_agent', ''),
            trade.get('timestamp_utc', ''),
            trade.get('exit_price', ''),
            trade.get('exit_reason', ''),
            trade.get('trade_duration', ''),
            trade.get('realized_pnl_pips', ''),
            trade.get('realized_pnl_dollars', ''),
            trade.get('account_balance_at_close', ''),
            trade.get('rr_achieved', ''),
            trade.get('rr_planned', ''),
            trade.get('slippage', ''),
            trade.get('outcome', ''),
            trade.get('status', ''),
        ]
        with open(self.journal_csv_path, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(row)

    def _update_csv_row(self, trade: dict):
        """Re-write the CSV row for a closed trade (append updated row)."""
        self._append_csv(trade)

    def _save_session_summaries(self, summary: dict):
        """Append a session summary to the summaries file."""
        try:
            with open(self.session_summaries_path, 'r') as f:
                summaries = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            summaries = []
        summaries.append(summary)
        with open(self.session_summaries_path, 'w') as f:
            json.dump(summaries, f, indent=2)

    def _save_weekly_report(self, report: dict):
        """Append a weekly report to the weekly reports file."""
        try:
            with open(self.weekly_reports_path, 'r') as f:
                reports = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            reports = []
        reports.append(report)
        with open(self.weekly_reports_path, 'w') as f:
            json.dump(reports, f, indent=2)

    # ------------------------------------------------------------------
    # Trade ID generation
    # ------------------------------------------------------------------

    def _generate_trade_id(self, instrument: str, date_str: Optional[str] = None) -> str:
        """Generate a unique trade ID in YYYYMMDD-INSTRUMENT-### format."""
        if date_str is None:
            date_str = datetime.now(timezone.utc).strftime('%Y%m%d')

        instrument_upper = instrument.upper().replace('/', '')
        prefix = f"{date_str}-{instrument_upper}-"

        # Find the next sequence number for this date+instrument
        existing = [
            tid for tid in self._trades
            if tid.startswith(prefix)
        ]
        seq = len(existing) + 1
        return f"{prefix}{seq:03d}"

    # ------------------------------------------------------------------
    # Pre-Trade Entry
    # ------------------------------------------------------------------

    def log_signal(self, signal_data: dict) -> str:
        """
        Log a new trade signal that passed confluence scoring.

        Required signal_data keys:
            instrument, session, signal_direction, signal_timeframe, htf_bias,
            confluence_score, confirming_factors, entry_price, stop_loss_price,
            take_profit_prices, stop_loss_pips, dollar_risk, position_size,
            account_balance_at_entry, account_type, risk_pct_used, generating_agent

        Returns:
            trade_id (str)
        """
        now_utc = datetime.now(timezone.utc).isoformat()
        instrument = signal_data.get('instrument', 'UNKNOWN')
        trade_id = self._generate_trade_id(instrument)

        entry = {
            'trade_id': trade_id,
            'instrument': instrument,
            'session': signal_data.get('session', ''),
            'signal_direction': signal_data.get('signal_direction', ''),
            'signal_timeframe': signal_data.get('signal_timeframe', ''),
            'htf_bias': signal_data.get('htf_bias', ''),
            'confluence_score': signal_data.get('confluence_score', 0),
            'confirming_factors': signal_data.get('confirming_factors', []),
            'entry_price': signal_data.get('entry_price', 0.0),
            'stop_loss_price': signal_data.get('stop_loss_price', 0.0),
            'take_profit_prices': signal_data.get('take_profit_prices', []),
            'stop_loss_pips': signal_data.get('stop_loss_pips', 0.0),
            'dollar_risk': signal_data.get('dollar_risk', 0.0),
            'position_size': signal_data.get('position_size', 0.0),
            'account_balance_at_entry': signal_data.get('account_balance_at_entry', 0.0),
            'account_type': signal_data.get('account_type', ''),
            'risk_pct_used': signal_data.get('risk_pct_used', 0.0),
            'generating_agent': signal_data.get('generating_agent', ''),
            'timestamp_utc': now_utc,
            'status': 'open',
            'events': [],
            'review': None,
        }

        self._trades[trade_id] = entry
        self._save_journal()
        self._append_csv(entry)

        logger.info(f"[WarMachine] Signal logged — {trade_id} | {instrument} | "
                     f"{signal_data.get('signal_direction', '')} | "
                     f"Confluence: {signal_data.get('confluence_score', 0)}")
        return trade_id

    # ------------------------------------------------------------------
    # During-Trade Updates
    # ------------------------------------------------------------------

    def log_trade_event(self, trade_id: str, event_type: str, event_data: dict) -> None:
        """
        Log an event that occurred during an open trade.

        event_type must be one of:
            price_at_50pct_tp, stop_to_breakeven, partial_close,
            invalidation_approach, htf_bias_change, news_event

        event_data varies by type:
            price_at_50pct_tp  -> {price, open_pnl}
            stop_to_breakeven  -> {new_stop, reason}
            partial_close      -> {size_closed, price, realized_pnl, remaining_size}
            invalidation_approach -> {warning_msg, current_price, distance_pips}
            htf_bias_change    -> {old_bias, new_bias, action_taken}
            news_event         -> {event_name, price_reaction, decision}
        """
        if trade_id not in self._trades:
            logger.error(f"[WarMachine] Trade {trade_id} not found — cannot log event")
            return

        if event_type not in VALID_EVENT_TYPES:
            logger.error(f"[WarMachine] Invalid event type: {event_type}")
            return

        trade = self._trades[trade_id]
        if trade.get('status') != 'open':
            logger.warning(f"[WarMachine] Trade {trade_id} is already closed — event ignored")
            return

        event_record = {
            'event_type': event_type,
            'timestamp_utc': datetime.now(timezone.utc).isoformat(),
            **event_data,
        }

        trade.setdefault('events', []).append(event_record)
        self._save_journal()

        logger.info(f"[WarMachine] Event logged — {trade_id} | {event_type}")

    # ------------------------------------------------------------------
    # Post-Trade Close
    # ------------------------------------------------------------------

    def log_trade_close(self, trade_id: str, close_data: dict) -> dict:
        """
        Close a trade and log the final results.

        Required close_data keys:
            exit_price, exit_reason, trade_duration,
            realized_pnl_pips, realized_pnl_dollars,
            account_balance_at_close, rr_achieved, rr_planned,
            slippage, confluence_score_at_close

        Optional:
            consecutive_trade_count

        Returns:
            The complete journal entry for the closed trade.
        """
        if trade_id not in self._trades:
            logger.error(f"[WarMachine] Trade {trade_id} not found — cannot close")
            return {}

        trade = self._trades[trade_id]

        exit_reason = close_data.get('exit_reason', '')
        if exit_reason and exit_reason not in VALID_EXIT_REASONS:
            logger.warning(f"[WarMachine] Non-standard exit reason: {exit_reason}")

        pnl_pips = close_data.get('realized_pnl_pips', 0.0)

        # Determine outcome
        if pnl_pips > 0:
            outcome = 'Win'
        elif pnl_pips < 0:
            outcome = 'Loss'
        else:
            outcome = 'Breakeven'

        trade.update({
            'exit_price': close_data.get('exit_price', 0.0),
            'exit_reason': exit_reason,
            'trade_duration': close_data.get('trade_duration', ''),
            'realized_pnl_pips': pnl_pips,
            'realized_pnl_dollars': close_data.get('realized_pnl_dollars', 0.0),
            'account_balance_at_close': close_data.get('account_balance_at_close', 0.0),
            'rr_achieved': close_data.get('rr_achieved', 0.0),
            'rr_planned': close_data.get('rr_planned', 0.0),
            'slippage': close_data.get('slippage', 0.0),
            'confluence_score_at_close': close_data.get('confluence_score_at_close', 0),
            'outcome': outcome,
            'consecutive_trade_count': close_data.get('consecutive_trade_count', 0),
            'status': 'closed',
            'closed_at_utc': datetime.now(timezone.utc).isoformat(),
        })

        self._save_journal()
        self._update_csv_row(trade)

        logger.info(f"[WarMachine] Trade closed — {trade_id} | {outcome} | "
                     f"P&L: {pnl_pips} pips / ${close_data.get('realized_pnl_dollars', 0.0)}")
        return dict(trade)

    # ------------------------------------------------------------------
    # Post-Trade Review
    # ------------------------------------------------------------------

    def generate_trade_review(self, trade_id: str) -> dict:
        """
        Auto-generate a post-trade review for a closed trade.

        Returns a review dict with:
            what_went_right, what_went_wrong,
            entry_valid (bool + reason), exit_valid (bool + reason),
            confluence_accuracy, would_take_again, lessons_learned
        """
        if trade_id not in self._trades:
            logger.error(f"[WarMachine] Trade {trade_id} not found — cannot review")
            return {}

        trade = self._trades[trade_id]
        if trade.get('status') != 'closed':
            logger.warning(f"[WarMachine] Trade {trade_id} is still open — close before review")
            return {}

        outcome = trade.get('outcome', 'Unknown')
        rr_achieved = trade.get('rr_achieved', 0.0)
        rr_planned = trade.get('rr_planned', 0.0)
        confluence = trade.get('confluence_score', 0)
        confluence_at_close = trade.get('confluence_score_at_close', 0)
        exit_reason = trade.get('exit_reason', '')
        slippage = trade.get('slippage', 0.0)
        events = trade.get('events', [])

        # --- what_went_right ---
        went_right = []
        if outcome == 'Win':
            went_right.append('Trade reached profit target')
        if rr_achieved >= rr_planned and rr_planned > 0:
            went_right.append(f'Achieved planned R:R ({rr_achieved:.2f} vs {rr_planned:.2f})')
        if confluence >= 7:
            went_right.append(f'Strong confluence score at entry ({confluence})')
        if abs(slippage) < 0.5:
            went_right.append('Minimal slippage on execution')
        for ev in events:
            if ev.get('event_type') == 'stop_to_breakeven':
                went_right.append('Stop moved to breakeven — risk eliminated')
            if ev.get('event_type') == 'partial_close':
                went_right.append('Partial profits secured during trade')
        if not went_right:
            went_right.append('Trade was executed per plan')

        # --- what_went_wrong ---
        went_wrong = []
        if outcome == 'Loss':
            went_wrong.append('Trade hit stop loss')
        if rr_achieved < rr_planned and outcome != 'Win':
            went_wrong.append(f'R:R underperformed ({rr_achieved:.2f} vs {rr_planned:.2f})')
        if abs(slippage) >= 1.0:
            went_wrong.append(f'Significant slippage: {slippage} pips')
        for ev in events:
            if ev.get('event_type') == 'invalidation_approach':
                went_wrong.append('Price approached invalidation level')
            if ev.get('event_type') == 'htf_bias_change':
                went_wrong.append(f"HTF bias shifted during trade: {ev.get('action_taken', '')}")
            if ev.get('event_type') == 'news_event':
                went_wrong.append(f"News event impacted trade: {ev.get('event_name', 'unknown')}")
        if not went_wrong:
            went_wrong.append('No significant issues identified')

        # --- entry_valid ---
        entry_valid = confluence >= 6
        entry_reason = (
            f"Confluence score {confluence} {'meets' if entry_valid else 'below'} threshold"
        )

        # --- exit_valid ---
        planned_exits = {'TP Hit', 'SL Hit'}
        exit_valid = exit_reason in planned_exits
        exit_reason_text = (
            f"Exit via {exit_reason} — {'planned' if exit_valid else 'unplanned'} exit"
        )

        # --- confluence_accuracy ---
        predicted_win = confluence >= 7
        actual_win = outcome == 'Win'
        if predicted_win and actual_win:
            confluence_accuracy = 'Accurate — high score predicted win'
        elif not predicted_win and not actual_win:
            confluence_accuracy = 'Accurate — low score predicted non-win'
        elif predicted_win and not actual_win:
            confluence_accuracy = 'Inaccurate — high score but trade lost'
        else:
            confluence_accuracy = 'Unexpected — low score but trade won'

        # --- would_take_again ---
        if outcome == 'Win' and entry_valid:
            would_take_again = 'Yes'
            would_take_reason = 'Setup was valid and trade was profitable'
        elif outcome == 'Loss' and entry_valid and exit_reason == 'SL Hit':
            would_take_again = 'Yes'
            would_take_reason = 'Setup was valid; loss was within plan'
        elif not entry_valid:
            would_take_again = 'No'
            would_take_reason = f'Confluence too low ({confluence}) — should have skipped'
        else:
            would_take_again = 'Modified'
            would_take_reason = 'Would adjust stop or sizing based on events'

        # --- lessons_learned ---
        lessons = []
        if outcome == 'Loss' and confluence < 6:
            lessons.append('Avoid entries with confluence below 6')
        if abs(slippage) >= 1.0:
            lessons.append('Consider tighter execution or limit orders')
        if any(ev.get('event_type') == 'news_event' for ev in events):
            lessons.append('Factor news calendar into trade timing')
        if any(ev.get('event_type') == 'htf_bias_change' for ev in events):
            lessons.append('Monitor HTF bias more closely during trade')
        if outcome == 'Win' and rr_achieved > rr_planned:
            lessons.append('Consider extending TP targets when momentum is strong')
        if not lessons:
            lessons.append('Continue following the plan — execution was solid')

        review = {
            'trade_id': trade_id,
            'reviewed_at_utc': datetime.now(timezone.utc).isoformat(),
            'what_went_right': went_right,
            'what_went_wrong': went_wrong,
            'entry_valid': entry_valid,
            'entry_valid_reason': entry_reason,
            'exit_valid': exit_valid,
            'exit_valid_reason': exit_reason_text,
            'confluence_accuracy': confluence_accuracy,
            'would_take_again': would_take_again,
            'would_take_again_reason': would_take_reason,
            'lessons_learned': lessons,
        }

        # Attach review to the trade record
        trade['review'] = review
        self._save_journal()

        logger.info(f"[WarMachine] Review generated — {trade_id} | "
                     f"Would take again: {would_take_again}")
        return review

    # ------------------------------------------------------------------
    # Session Summary
    # ------------------------------------------------------------------

    def generate_session_summary(self, session: str, date: str) -> dict:
        """
        Generate a summary for a trading session on a given date.

        Args:
            session: Session name (e.g., 'London', 'New York', 'Asian')
            date: Date string in YYYY-MM-DD format

        Returns:
            Session summary dict.
        """
        date_compact = date.replace('-', '')

        # Gather trades for this session and date
        session_trades = [
            t for t in self._trades.values()
            if t.get('session', '').lower() == session.lower()
            and t.get('trade_id', '').startswith(date_compact)
        ]

        closed_trades = [t for t in session_trades if t.get('status') == 'closed']
        total = len(session_trades)
        wins = sum(1 for t in closed_trades if t.get('outcome') == 'Win')
        losses = sum(1 for t in closed_trades if t.get('outcome') == 'Loss')
        breakevens = sum(1 for t in closed_trades if t.get('outcome') == 'Breakeven')
        win_rate = (wins / len(closed_trades) * 100) if closed_trades else 0.0

        total_pips = sum(t.get('realized_pnl_pips', 0.0) for t in closed_trades)
        total_dollars = sum(t.get('realized_pnl_dollars', 0.0) for t in closed_trades)

        balances = [t.get('account_balance_at_entry', 0.0) for t in session_trades if t.get('account_balance_at_entry')]
        close_balances = [t.get('account_balance_at_close', 0.0) for t in closed_trades if t.get('account_balance_at_close')]
        balance_open = balances[0] if balances else 0.0
        balance_close = close_balances[-1] if close_balances else balance_open

        # Daily drawdown
        daily_drawdown = 0.0
        if balance_open > 0:
            min_balance = min(close_balances) if close_balances else balance_open
            daily_drawdown = round((balance_open - min_balance) / balance_open * 100, 2)

        # Best / worst trade
        best_trade = max(closed_trades, key=lambda t: t.get('realized_pnl_dollars', 0.0), default=None)
        worst_trade = min(closed_trades, key=lambda t: t.get('realized_pnl_dollars', 0.0), default=None)

        # Avg confluence
        confluence_scores = [t.get('confluence_score', 0) for t in session_trades if t.get('confluence_score')]
        avg_confluence = round(sum(confluence_scores) / len(confluence_scores), 2) if confluence_scores else 0.0

        # Most active instrument
        instruments = [t.get('instrument', '') for t in session_trades]
        instrument_counts = Counter(instruments)
        most_active = instrument_counts.most_common(1)[0][0] if instrument_counts else ''

        # Session bias accuracy
        bias_matches = sum(
            1 for t in closed_trades
            if (t.get('htf_bias', '').lower() == 'bullish' and t.get('signal_direction', '').lower() == 'long'
                and t.get('outcome') == 'Win')
            or (t.get('htf_bias', '').lower() == 'bearish' and t.get('signal_direction', '').lower() == 'short'
                and t.get('outcome') == 'Win')
        )
        session_bias_accuracy = round(bias_matches / len(closed_trades) * 100, 2) if closed_trades else 0.0

        # Signals generated vs acted on
        signals_generated = total
        signals_acted_on = len(closed_trades)

        # UTC range from timestamps
        timestamps = [t.get('timestamp_utc', '') for t in session_trades if t.get('timestamp_utc')]
        utc_start = min(timestamps) if timestamps else ''
        utc_end = max(timestamps) if timestamps else ''

        summary = {
            'session': session,
            'date': date,
            'utc_range': f"{utc_start} — {utc_end}",
            'balance_open': balance_open,
            'balance_close': balance_close,
            'total_trades': total,
            'wins': wins,
            'losses': losses,
            'breakevens': breakevens,
            'win_rate': round(win_rate, 2),
            'total_pips': round(total_pips, 2),
            'total_dollar_pnl': round(total_dollars, 2),
            'daily_drawdown_pct': daily_drawdown,
            'best_trade': best_trade.get('trade_id', '') if best_trade else '',
            'best_trade_pnl': best_trade.get('realized_pnl_dollars', 0.0) if best_trade else 0.0,
            'worst_trade': worst_trade.get('trade_id', '') if worst_trade else '',
            'worst_trade_pnl': worst_trade.get('realized_pnl_dollars', 0.0) if worst_trade else 0.0,
            'avg_confluence_score': avg_confluence,
            'most_active_instrument': most_active,
            'session_bias_accuracy': session_bias_accuracy,
            'signals_generated': signals_generated,
            'signals_acted_on': signals_acted_on,
            'generated_at_utc': datetime.now(timezone.utc).isoformat(),
        }

        self._save_session_summaries(summary)
        logger.info(f"[WarMachine] Session summary — {session} {date} | "
                     f"{total} trades | Win rate: {win_rate:.1f}%")
        return summary

    # ------------------------------------------------------------------
    # Weekly Report
    # ------------------------------------------------------------------

    def generate_weekly_report(self, week_start: str, week_end: str) -> dict:
        """
        Generate a weekly performance report.

        Args:
            week_start: Start date in YYYY-MM-DD format
            week_end: End date in YYYY-MM-DD format

        Returns:
            Weekly report dict.
        """
        start_compact = week_start.replace('-', '')
        end_compact = week_end.replace('-', '')

        # Gather trades in the date range by trade_id prefix
        week_trades = [
            t for t in self._trades.values()
            if start_compact <= t.get('trade_id', '')[:8] <= end_compact
        ]

        closed = [t for t in week_trades if t.get('status') == 'closed']
        total = len(closed)
        wins = sum(1 for t in closed if t.get('outcome') == 'Win')
        losses = sum(1 for t in closed if t.get('outcome') == 'Loss')
        win_rate = (wins / total * 100) if total else 0.0

        total_pnl_dollars = sum(t.get('realized_pnl_dollars', 0.0) for t in closed)
        total_pnl_pips = sum(t.get('realized_pnl_pips', 0.0) for t in closed)

        # Starting / ending balance
        entry_balances = [t.get('account_balance_at_entry', 0.0) for t in week_trades if t.get('account_balance_at_entry')]
        close_balances = [t.get('account_balance_at_close', 0.0) for t in closed if t.get('account_balance_at_close')]
        starting_balance = entry_balances[0] if entry_balances else 0.0
        ending_balance = close_balances[-1] if close_balances else starting_balance
        weekly_pct = round((total_pnl_dollars / starting_balance * 100), 2) if starting_balance else 0.0

        # Weekly drawdown
        weekly_drawdown = 0.0
        if starting_balance > 0 and close_balances:
            min_bal = min(close_balances)
            weekly_drawdown = round((starting_balance - min_bal) / starting_balance * 100, 2)
            if weekly_drawdown < 0:
                weekly_drawdown = 0.0

        # Best / worst instrument
        instrument_pnl: Dict[str, float] = {}
        for t in closed:
            inst = t.get('instrument', 'UNKNOWN')
            instrument_pnl[inst] = instrument_pnl.get(inst, 0.0) + t.get('realized_pnl_dollars', 0.0)
        best_instrument = max(instrument_pnl, key=instrument_pnl.get, default='') if instrument_pnl else ''
        worst_instrument = min(instrument_pnl, key=instrument_pnl.get, default='') if instrument_pnl else ''

        # Best session
        session_pnl: Dict[str, float] = {}
        for t in closed:
            sess = t.get('session', 'Unknown')
            session_pnl[sess] = session_pnl.get(sess, 0.0) + t.get('realized_pnl_dollars', 0.0)
        best_session = max(session_pnl, key=session_pnl.get, default='') if session_pnl else ''

        # Avg R:R achieved vs planned
        rr_achieved_list = [t.get('rr_achieved', 0.0) for t in closed if t.get('rr_achieved') is not None]
        rr_planned_list = [t.get('rr_planned', 0.0) for t in closed if t.get('rr_planned') is not None]
        avg_rr_achieved = round(sum(rr_achieved_list) / len(rr_achieved_list), 2) if rr_achieved_list else 0.0
        avg_rr_planned = round(sum(rr_planned_list) / len(rr_planned_list), 2) if rr_planned_list else 0.0

        # Confluence
        confluence_scores = [t.get('confluence_score', 0) for t in closed if t.get('confluence_score')]
        avg_confluence = round(sum(confluence_scores) / len(confluence_scores), 2) if confluence_scores else 0.0

        # Confluence accuracy: high score trades that won
        high_conf = [t for t in closed if t.get('confluence_score', 0) >= 7]
        high_conf_wins = sum(1 for t in high_conf if t.get('outcome') == 'Win')
        confluence_accuracy = round(high_conf_wins / len(high_conf) * 100, 2) if high_conf else 0.0

        # Top 3 lessons from reviews
        all_lessons: List[str] = []
        for t in closed:
            review = t.get('review')
            if review and review.get('lessons_learned'):
                all_lessons.extend(review['lessons_learned'])
        lesson_counts = Counter(all_lessons)
        top_lessons = [lesson for lesson, _ in lesson_counts.most_common(3)]

        # Recommended adjustments
        adjustments = []
        if win_rate < 50:
            adjustments.append('Tighten entry criteria — win rate below 50%')
        if avg_rr_achieved < avg_rr_planned and avg_rr_planned > 0:
            adjustments.append(f'R:R underperforming ({avg_rr_achieved:.2f} vs {avg_rr_planned:.2f}) — review TP levels')
        if confluence_accuracy < 60:
            adjustments.append('Confluence scoring needs recalibration — accuracy below 60%')
        if weekly_drawdown > 5:
            adjustments.append(f'Weekly drawdown {weekly_drawdown:.1f}% — consider reducing position sizes')
        if not adjustments:
            adjustments.append('Performance within targets — maintain current approach')

        report = {
            'week_start': week_start,
            'week_end': week_end,
            'starting_balance': starting_balance,
            'ending_balance': ending_balance,
            'total_weekly_pnl_dollars': round(total_pnl_dollars, 2),
            'total_weekly_pnl_pct': weekly_pct,
            'weekly_drawdown_pct': weekly_drawdown,
            'total_trades': total,
            'wins': wins,
            'losses': losses,
            'win_rate': round(win_rate, 2),
            'total_pips': round(total_pnl_pips, 2),
            'best_instrument': best_instrument,
            'worst_instrument': worst_instrument,
            'best_session': best_session,
            'avg_rr_achieved': avg_rr_achieved,
            'avg_rr_planned': avg_rr_planned,
            'avg_confluence_score': avg_confluence,
            'confluence_accuracy_pct': confluence_accuracy,
            'top_3_lessons': top_lessons,
            'recommended_adjustments': adjustments,
            'generated_at_utc': datetime.now(timezone.utc).isoformat(),
        }

        self._save_weekly_report(report)
        logger.info(f"[WarMachine] Weekly report — {week_start} to {week_end} | "
                     f"{total} trades | P&L: ${total_pnl_dollars:.2f}")
        return report

    # ------------------------------------------------------------------
    # Data Scraper — feeds structured intelligence into the pipeline
    # ------------------------------------------------------------------

    def _safe_get(self, url: str, params: Optional[dict] = None, timeout: int = 8) -> Optional[dict]:
        """HTTP GET with error swallowing — returns None on any failure."""
        try:
            resp = requests.get(url, params=params, timeout=timeout,
                                headers={'User-Agent': 'OpenClaw/3.0 (trading research bot)'})
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning(f"[WarMachine] HTTP fetch failed {url}: {e}")
            return None

    def scrape_onchain(self) -> dict:
        """
        Pull live on-chain metrics for BTC and ETH from free public APIs.

        Sources:
          - blockchain.info  → BTC network stats (hash rate, mempool, difficulty)
          - coincap.io       → BTC + ETH price, market cap, 24h change, volume
          - blockchain.info/q → supply metrics

        Returns structured dict with 'btc' and 'eth' sub-dicts.
        """
        result: dict = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'btc': {},
            'eth': {},
            'status': 'partial',
        }

        # ── BTC network stats ─────────────────────────────────────────
        stats = self._safe_get('https://blockchain.info/stats', params={'format': 'json'})
        if stats:
            result['btc']['hash_rate_th'] = round(stats.get('hash_rate', 0) / 1e12, 2)
            result['btc']['difficulty'] = stats.get('difficulty', 0)
            result['btc']['n_tx_24h'] = stats.get('n_tx', 0)
            result['btc']['miners_revenue_usd'] = stats.get('miners_revenue_usd', 0)
            result['btc']['mempool_size'] = stats.get('mempool_size', 0)
            result['btc']['estimated_btc_sent'] = stats.get('estimated_btc_sent', 0)

        # ── CoinCap prices ────────────────────────────────────────────
        btc_data = self._safe_get('https://api.coincap.io/v2/assets/bitcoin')
        if btc_data and btc_data.get('data'):
            d = btc_data['data']
            result['btc']['price_usd'] = float(d.get('priceUsd', 0))
            result['btc']['market_cap_usd'] = float(d.get('marketCapUsd', 0))
            result['btc']['change_pct_24h'] = float(d.get('changePercent24Hr', 0))
            result['btc']['volume_24h_usd'] = float(d.get('volumeUsd24Hr', 0))

        eth_data = self._safe_get('https://api.coincap.io/v2/assets/ethereum')
        if eth_data and eth_data.get('data'):
            d = eth_data['data']
            result['eth']['price_usd'] = float(d.get('priceUsd', 0))
            result['eth']['market_cap_usd'] = float(d.get('marketCapUsd', 0))
            result['eth']['change_pct_24h'] = float(d.get('changePercent24Hr', 0))
            result['eth']['volume_24h_usd'] = float(d.get('volumeUsd24Hr', 0))

        # ── Whale signal: large 24h BTC volume vs 7d avg ─────────────
        if result['btc'].get('volume_24h_usd') and result['btc'].get('market_cap_usd'):
            vol_to_cap = result['btc']['volume_24h_usd'] / result['btc']['market_cap_usd']
            result['btc']['volume_to_cap_ratio'] = round(vol_to_cap, 4)
            result['btc']['whale_signal'] = 'elevated' if vol_to_cap > 0.05 else 'normal'

        if result['btc'] or result['eth']:
            result['status'] = 'success'

        logger.info(f"[WarMachine] On-chain scrape: BTC ${result['btc'].get('price_usd', 0):,.0f}, "
                    f"ETH ${result['eth'].get('price_usd', 0):,.0f}")
        return result

    def scrape_sec_filings(self, keywords: Optional[List[str]] = None) -> dict:
        """
        Query SEC EDGAR full-text search for recent 8-K and 10-K filings
        mentioning crypto/forex-relevant keywords.

        Uses the free EDGAR full-text search API (no auth required).
        Returns a list of the most recent matching filings.
        """
        if keywords is None:
            keywords = ['bitcoin', 'cryptocurrency', 'digital asset', 'stablecoin',
                        'central bank digital currency', 'forex', 'foreign exchange']

        result: dict = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'filings': [],
            'status': 'error',
        }

        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

        all_filings: List[dict] = []

        for keyword in keywords[:4]:    # limit to 4 keywords to avoid rate-limiting
            data = self._safe_get(
                'https://efts.sec.gov/LATEST/search-index',
                params={
                    'q': f'"{keyword}"',
                    'forms': '8-K',
                    'dateRange': 'custom',
                    'startdt': since,
                    'enddt': today,
                },
            )
            if not data:
                continue

            hits = data.get('hits', {}).get('hits', [])
            for h in hits[:3]:
                src = h.get('_source', {})
                filing = {
                    'keyword': keyword,
                    'company': src.get('entity_name', ''),
                    'form': src.get('file_type', '8-K'),
                    'filed_at': src.get('period_of_report', src.get('file_date', '')),
                    'description': src.get('period_of_report', ''),
                    'url': f"https://www.sec.gov/Archives/{src.get('file_name', '')}",
                }
                if filing['company'] and filing not in all_filings:
                    all_filings.append(filing)

        result['filings'] = all_filings[:15]
        result['total_found'] = len(all_filings)
        result['keywords_searched'] = keywords[:4]
        result['status'] = 'success'

        logger.info(f"[WarMachine] SEC scrape: {len(all_filings)} filings found "
                    f"across {len(keywords[:4])} keywords")
        return result

    def scrape_macro_snapshot(self) -> dict:
        """
        Pull DXY, VIX, Gold, and 10Y Treasury yield via yfinance.
        These are key macro drivers that contextualize forex and crypto signals.
        """
        try:
            import yfinance as yf
        except ImportError:
            logger.warning("[WarMachine] yfinance not installed — macro snapshot skipped")
            return {'status': 'error', 'error': 'yfinance not available'}

        tickers = {
            'DXY':   'DX-Y.NYB',
            'Gold':  'GC=F',
            'VIX':   '^VIX',
            'US10Y': '^TNX',
            'SP500': '^GSPC',
        }

        result: dict = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'assets': {},
            'signals': [],
            'status': 'partial',
        }

        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            for label, ticker in tickers.items():
                try:
                    df = yf.download(ticker, period='5d', interval='1d', progress=False)
                    if df.empty:
                        continue
                    if isinstance(df.columns, __import__('pandas').MultiIndex):
                        df.columns = [c[0] for c in df.columns]
                    df.columns = [str(c).lower() for c in df.columns]
                    if len(df) >= 2:
                        last  = float(df['close'].iloc[-1])
                        prev  = float(df['close'].iloc[-2])
                        chg   = round((last - prev) / prev * 100, 3)
                        result['assets'][label] = {
                            'price': round(last, 4),
                            'change_pct': chg,
                            'direction': 'up' if chg > 0 else 'down',
                        }
                except Exception as e:
                    logger.debug(f"[WarMachine] {label} ({ticker}) failed: {e}")

        assets = result['assets']

        # ── Derive macro signals ──────────────────────────────────────
        if 'DXY' in assets:
            dxy_chg = assets['DXY']['change_pct']
            if dxy_chg > 0.3:
                result['signals'].append({'signal': 'DXY_RISING', 'note': f'DXY +{dxy_chg:.2f}% → USD strength, headwind for risk assets'})
            elif dxy_chg < -0.3:
                result['signals'].append({'signal': 'DXY_FALLING', 'note': f'DXY {dxy_chg:.2f}% → USD weakness, tailwind for commodities/crypto'})

        if 'VIX' in assets:
            vix = assets['VIX']['price']
            if vix > 25:
                result['signals'].append({'signal': 'HIGH_VIX', 'note': f'VIX {vix:.1f} — fear elevated, reduce risk exposure'})
            elif vix < 15:
                result['signals'].append({'signal': 'LOW_VIX', 'note': f'VIX {vix:.1f} — complacency, watch for reversal'})

        if 'Gold' in assets:
            gold_chg = assets['Gold']['change_pct']
            if gold_chg > 0.5:
                result['signals'].append({'signal': 'GOLD_UP', 'note': f'Gold +{gold_chg:.2f}% — risk-off / inflation hedge bid'})

        if 'US10Y' in assets:
            y10 = assets['US10Y']['price']
            y10_chg = assets['US10Y']['change_pct']
            if y10 > 4.5:
                result['signals'].append({'signal': 'YIELDS_HIGH', 'note': f'10Y at {y10:.2f}% — restrictive financial conditions'})
            elif y10_chg < -0.5:
                result['signals'].append({'signal': 'YIELDS_FALLING', 'note': f'10Y -0.5% → flight to safety'})

        if assets:
            result['status'] = 'success'

        logger.info(f"[WarMachine] Macro snapshot: DXY={assets.get('DXY', {}).get('price', 'N/A')}, "
                    f"VIX={assets.get('VIX', {}).get('price', 'N/A')}, "
                    f"Gold={assets.get('Gold', {}).get('price', 'N/A')}")
        return result

    def collect_intelligence(self) -> dict:
        """
        Master data collection. Runs all scrapers in sequence and returns
        a unified intelligence packet for Nick Fury's pipeline.

        Returns:
            {
              'onchain':   { btc, eth metrics },
              'sec':       { recent filings },
              'macro':     { DXY, VIX, Gold, 10Y },
              'timestamp': ISO string,
              'status':    'success' | 'partial' | 'error',
            }
        """
        logger.info("[WarMachine] Intelligence collection cycle starting...")

        onchain = self.scrape_onchain()
        sec     = self.scrape_sec_filings()
        macro   = self.scrape_macro_snapshot()

        # Overall status
        statuses = [onchain.get('status'), sec.get('status'), macro.get('status')]
        if all(s == 'success' for s in statuses):
            overall = 'success'
        elif all(s == 'error' for s in statuses):
            overall = 'error'
        else:
            overall = 'partial'

        packet = {
            'onchain':   onchain,
            'sec':       sec,
            'macro':     macro,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'status':    overall,
        }

        logger.info(f"[WarMachine] Intelligence collected — status={overall}, "
                    f"macro_signals={len(macro.get('signals', []))}, "
                    f"sec_filings={len(sec.get('filings', []))}")
        return packet

    # ------------------------------------------------------------------
    # Lookups and stats
    # ------------------------------------------------------------------

    def get_trade(self, trade_id: str) -> dict:
        """Retrieve a single trade by its ID."""
        return dict(self._trades.get(trade_id, {}))

    def get_recent_trades(self, count: int = 20) -> list:
        """Return the most recent trades, sorted by timestamp descending."""
        trades = sorted(
            self._trades.values(),
            key=lambda t: t.get('timestamp_utc', ''),
            reverse=True,
        )
        return [dict(t) for t in trades[:count]]

    def get_stats(self) -> dict:
        """Return aggregate statistics across all logged trades."""
        all_trades = list(self._trades.values())
        closed = [t for t in all_trades if t.get('status') == 'closed']
        open_trades = [t for t in all_trades if t.get('status') == 'open']

        total = len(closed)
        wins = sum(1 for t in closed if t.get('outcome') == 'Win')
        losses = sum(1 for t in closed if t.get('outcome') == 'Loss')
        breakevens = sum(1 for t in closed if t.get('outcome') == 'Breakeven')
        win_rate = (wins / total * 100) if total else 0.0

        total_pnl_dollars = sum(t.get('realized_pnl_dollars', 0.0) for t in closed)
        total_pnl_pips = sum(t.get('realized_pnl_pips', 0.0) for t in closed)

        avg_win = 0.0
        avg_loss = 0.0
        winning_trades = [t for t in closed if t.get('outcome') == 'Win']
        losing_trades = [t for t in closed if t.get('outcome') == 'Loss']
        if winning_trades:
            avg_win = sum(t.get('realized_pnl_dollars', 0.0) for t in winning_trades) / len(winning_trades)
        if losing_trades:
            avg_loss = sum(t.get('realized_pnl_dollars', 0.0) for t in losing_trades) / len(losing_trades)

        profit_factor = abs(avg_win * wins / (avg_loss * losses)) if (losses and avg_loss != 0) else float('inf')

        confluence_scores = [t.get('confluence_score', 0) for t in closed if t.get('confluence_score')]
        avg_confluence = round(sum(confluence_scores) / len(confluence_scores), 2) if confluence_scores else 0.0

        rr_achieved_list = [t.get('rr_achieved', 0.0) for t in closed if t.get('rr_achieved') is not None]
        avg_rr = round(sum(rr_achieved_list) / len(rr_achieved_list), 2) if rr_achieved_list else 0.0

        return {
            'total_trades': len(all_trades),
            'open_trades': len(open_trades),
            'closed_trades': total,
            'wins': wins,
            'losses': losses,
            'breakevens': breakevens,
            'win_rate': round(win_rate, 2),
            'total_pnl_dollars': round(total_pnl_dollars, 2),
            'total_pnl_pips': round(total_pnl_pips, 2),
            'avg_win_dollars': round(avg_win, 2),
            'avg_loss_dollars': round(avg_loss, 2),
            'profit_factor': round(profit_factor, 2) if profit_factor != float('inf') else 'inf',
            'avg_confluence_score': avg_confluence,
            'avg_rr_achieved': avg_rr,
        }
