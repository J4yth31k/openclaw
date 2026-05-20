"""
Nick Fury - Master Orchestrator / Avengers Commander

Assembles the Avengers. Runs all analysis agents in sequence, compiles
the Avengers Market Intelligence Briefing, and handles Telegram delivery
and scheduling.

Extended capabilities:
  - Session Management (Asian/London/NY/Overlap with pair affinity)
  - News Event Protocol (suspend/clear/normal around high-impact releases)
  - Agent & Team Grading System (5-category rubric, weekly reports)
  - Account Configuration (auto-detect type from balance)
"""

import logging
import argparse
import textwrap
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
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

# ======================================================================
# Session Definitions
# ======================================================================

SESSION_CONFIG: Dict[str, Dict[str, Any]] = {
    'Asian': {
        'start_utc': 0,
        'end_utc': 9,
        'best_pairs': ['USDJPY', 'AUDUSD', 'NZDUSD', 'AUDJPY', 'NZDJPY'],
        'description': 'Range-bound, JPY/AUD driven',
    },
    'London': {
        'start_utc': 8,
        'end_utc': 17,
        'best_pairs': ['GBPUSD', 'EURUSD', 'EURGBP', 'GBPJPY', 'EURJPY'],
        'description': 'Trend initiation, EUR/GBP driven',
    },
    'New York': {
        'start_utc': 13,
        'end_utc': 22,
        'best_pairs': ['EURUSD', 'GBPUSD', 'USDCAD', 'USDCHF'],
        'description': 'Continuation/reversal, USD driven',
    },
    'Overlap': {
        'start_utc': 13,
        'end_utc': 17,
        'best_pairs': ['EURUSD', 'GBPUSD', 'USDCAD', 'USDCHF',
                        'GBPJPY', 'EURJPY'],
        'description': 'London-NY overlap, highest confluence window',
    },
}

# ======================================================================
# Account Type Definitions (mirrors DoctorStrange for convenience)
# ======================================================================

ACCOUNT_TYPES: List[Dict[str, Any]] = [
    {'name': 'Micro',         'min_balance': 0,        'max_balance': 999.99,
     'max_risk_pct': 1.0, 'max_positions': 2},
    {'name': 'Mini',          'min_balance': 1_000,    'max_balance': 9_999.99,
     'max_risk_pct': 2.0, 'max_positions': 3},
    {'name': 'Standard',      'min_balance': 10_000,   'max_balance': 49_999.99,
     'max_risk_pct': 2.0, 'max_positions': 5},
    {'name': 'Professional',  'min_balance': 50_000,   'max_balance': 249_999.99,
     'max_risk_pct': 1.0, 'max_positions': 10},
    {'name': 'Institutional', 'min_balance': 250_000,  'max_balance': float('inf'),
     'max_risk_pct': 0.5, 'max_positions': 15},
]

# ======================================================================
# High-Impact News Events
# ======================================================================

HIGH_IMPACT_EVENTS = {
    'NFP', 'CPI', 'FOMC', 'ECB', 'BOE', 'BOJ', 'RBA', 'RBNZ', 'BOC',
    'Non-Farm Payrolls', 'Consumer Price Index',
    'Federal Open Market Committee', 'Central Bank Rate Decision',
    'Interest Rate Decision', 'GDP', 'Retail Sales',
}


# ======================================================================
# Agent Grading System
# ======================================================================

class AgentGrader:
    """Grades individual agents on a 100-point rubric across 5 categories."""

    GRADE_SCALE = [
        (95, 'S'), (85, 'A'), (75, 'B'), (65, 'C'), (50, 'D'),
    ]

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _clamp(value: float, lo: float = 0.0, hi: float = 20.0) -> float:
        return max(lo, min(hi, value))

    @classmethod
    def letter_grade(cls, score: float) -> str:
        for threshold, letter in cls.GRADE_SCALE:
            if score >= threshold:
                return letter
        return 'F'

    # ── category scorers ─────────────────────────────────────────────────

    @staticmethod
    def _score_rule_compliance(data: dict) -> float:
        """Category 1 -- Rule Compliance (20 pts).

        Expected keys:
          rules_followed_pct (0-100), format_correct (bool), clean_handoffs (bool)
        """
        score = 0.0
        # Followed all rules without exception (10 pts)
        rules_pct = data.get('rules_followed_pct', 0)
        score += (rules_pct / 100.0) * 10.0
        # Correct structured format (5 pts)
        if data.get('format_correct', False):
            score += 5.0
        # Clean handoffs (5 pts)
        if data.get('clean_handoffs', False):
            score += 5.0
        return score

    @staticmethod
    def _score_signal_quality(data: dict) -> float:
        """Category 2 -- Signal Quality (20 pts).

        Expected keys:
          avg_confluence (0-100), win_rate_pct (0-100)
        """
        score = 0.0
        # Avg confluence score: 90+=10, 75-89=8, 65-74=6, 50-64=4, <50=0
        ac = data.get('avg_confluence', 0)
        if ac >= 90:
            score += 10
        elif ac >= 75:
            score += 8
        elif ac >= 65:
            score += 6
        elif ac >= 50:
            score += 4
        # Win rate: 70%+=10, 60-69=8, 50-59=6, 40-49=4, <40=0
        wr = data.get('win_rate_pct', 0)
        if wr >= 70:
            score += 10
        elif wr >= 60:
            score += 8
        elif wr >= 50:
            score += 6
        elif wr >= 40:
            score += 4
        return score

    @staticmethod
    def _score_risk_management(data: dict) -> float:
        """Category 3 -- Risk Management (20 pts).

        Expected keys:
          risk_thresholds_respected (bool), position_sizes_correct (bool),
          drawdown_lockouts_respected (bool)
        """
        score = 0.0
        if data.get('risk_thresholds_respected', False):
            score += 10.0
        if data.get('position_sizes_correct', False):
            score += 5.0
        if data.get('drawdown_lockouts_respected', False):
            score += 5.0
        return score

    @staticmethod
    def _score_timeliness(data: dict) -> float:
        """Category 4 -- Timeliness (20 pts).

        Expected keys:
          signals_in_session (bool), handoffs_on_time (bool),
          journal_immediate (bool), escalations_prompt (bool)
        """
        score = 0.0
        if data.get('signals_in_session', False):
            score += 5.0
        if data.get('handoffs_on_time', False):
            score += 5.0
        if data.get('journal_immediate', False):
            score += 5.0
        if data.get('escalations_prompt', False):
            score += 5.0
        return score

    @staticmethod
    def _score_adaptability(data: dict) -> float:
        """Category 5 -- Adaptability (20 pts).

        Expected keys:
          adjusted_htf_bias (bool), responded_news (bool),
          updated_tf_shifts (bool), used_handoff_data (bool)
        """
        score = 0.0
        if data.get('adjusted_htf_bias', False):
            score += 5.0
        if data.get('responded_news', False):
            score += 5.0
        if data.get('updated_tf_shifts', False):
            score += 5.0
        if data.get('used_handoff_data', False):
            score += 5.0
        return score

    # ── public API ───────────────────────────────────────────────────────

    def grade_agent(self, agent_name: str, journal_data: dict) -> dict:
        """Grade a single agent across all 5 categories.

        Args:
            agent_name: Display name / role of the agent.
            journal_data: Dict with sub-dicts keyed by category name:
                {
                  'rule_compliance': { ... },
                  'signal_quality': { ... },
                  'risk_management': { ... },
                  'timeliness': { ... },
                  'adaptability': { ... },
                }

        Returns:
            {
              'agent': str,
              'categories': {cat_name: score, ...},
              'total': float,
              'grade': str,
            }
        """
        cats = {
            'rule_compliance': self._clamp(
                self._score_rule_compliance(
                    journal_data.get('rule_compliance', {}))),
            'signal_quality': self._clamp(
                self._score_signal_quality(
                    journal_data.get('signal_quality', {}))),
            'risk_management': self._clamp(
                self._score_risk_management(
                    journal_data.get('risk_management', {}))),
            'timeliness': self._clamp(
                self._score_timeliness(
                    journal_data.get('timeliness', {}))),
            'adaptability': self._clamp(
                self._score_adaptability(
                    journal_data.get('adaptability', {}))),
        }
        total = sum(cats.values())
        return {
            'agent': agent_name,
            'categories': cats,
            'total': round(total, 2),
            'grade': self.letter_grade(total),
        }


# ======================================================================
# WarMachine stub (trade journal) -- lightweight in-memory journal so
# NickFury can log signals without requiring a separate module file.
# Replace with a real WarMachine import when the module is available.
# ======================================================================

class _WarMachineStub:
    """Minimal in-memory trade journal used when war_machine module is absent."""

    def __init__(self):
        self.entries: List[dict] = []

    def log_signal(self, signal: dict) -> None:
        entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            **signal,
        }
        self.entries.append(entry)
        logger.info(f"WarMachine journal logged signal: {signal.get('pair', 'N/A')}")

    def get_entries(self) -> List[dict]:
        return list(self.entries)


def _get_war_machine():
    """Try to import real WarMachine; fall back to stub."""
    try:
        from war_machine import WarMachine  # type: ignore
        return WarMachine()
    except ImportError:
        logger.warning("war_machine module not found -- using in-memory journal stub")
        return _WarMachineStub()


class NickFury:
    """Nick Fury - master orchestrator for the Avengers Market Intelligence Briefing."""

    # Crypto pairs that Vision (order flow) supports
    CRYPTO_PAIRS = {'BTCUSD', 'ETHUSD', 'SOLUSD'}

    def __init__(self, pairs: Optional[list[str]] = None,
                 run_backtest: bool = False,
                 account_size: float = 10000.0,
                 account_balance: Optional[float] = None):
        """
        Initialize Nick Fury with the Avengers team.

        Args:
            pairs: List of trading pairs to analyze
            run_backtest: Whether to run Hulk's backtesting phase
            account_size: Account size for DoctorStrange risk management
            account_balance: If provided, used by configure_account() to set
                             risk parameters.  Falls back to *account_size*.
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

        # New subsystems
        self.journal = _get_war_machine()          # WarMachine - trade journal
        self.grader = AgentGrader()                # Agent grading system

        # Account configuration
        balance = account_balance if account_balance is not None else account_size
        self.account_config = self.configure_account(balance)

        # Session state
        self._previous_grades: Dict[str, float] = {}  # agent -> last total

    # ==================================================================
    # Session Management System
    # ==================================================================

    @staticmethod
    def get_current_session(now_utc: Optional[datetime] = None) -> dict:
        """Determine which trading session(s) are active based on UTC time.

        Args:
            now_utc: Override for current UTC time (useful for testing).

        Returns:
            {
              'active_sessions': [str, ...],
              'is_overlap': bool,
              'best_pairs': [str, ...],
              'current_utc': str (ISO),
            }
        """
        if now_utc is None:
            now_utc = datetime.now(timezone.utc)
        hour = now_utc.hour

        active: List[str] = []
        best_pairs: List[str] = []

        for name, cfg in SESSION_CONFIG.items():
            if cfg['start_utc'] <= hour < cfg['end_utc']:
                active.append(name)
                for p in cfg['best_pairs']:
                    if p not in best_pairs:
                        best_pairs.append(p)

        is_overlap = 'Overlap' in active

        return {
            'active_sessions': active,
            'is_overlap': is_overlap,
            'best_pairs': best_pairs,
            'current_utc': now_utc.isoformat(),
        }

    def set_session_bias(self, session_info: dict,
                         htf_trend: Optional[dict] = None,
                         key_levels: Optional[dict] = None,
                         pending_news: Optional[list] = None,
                         correlated_markets: Optional[dict] = None) -> dict:
        """Assess bias at session start from HTF trend, levels, news, correlations.

        Args:
            session_info: Output of get_current_session().
            htf_trend: Per-pair trend dict, e.g. {'EURUSD': 'bullish', ...}.
            key_levels: Per-pair support/resistance levels.
            pending_news: List of upcoming news event dicts.
            correlated_markets: Correlation snapshot from Thor.

        Returns:
            Bias dict suitable for passing into BlackWidow.
        """
        bias: Dict[str, Any] = {
            'sessions': session_info.get('active_sessions', []),
            'is_overlap': session_info.get('is_overlap', False),
            'best_pairs': session_info.get('best_pairs', []),
            'htf_trend': htf_trend or {},
            'key_levels': key_levels or {},
            'pending_news': pending_news or [],
            'correlated_markets': correlated_markets or {},
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }

        # Determine directional bias per best pair from HTF trend
        pair_biases: Dict[str, str] = {}
        for pair in bias['best_pairs']:
            trend = (htf_trend or {}).get(pair, 'neutral')
            pair_biases[pair] = trend
        bias['pair_biases'] = pair_biases

        logger.info(
            f"Session bias set: sessions={bias['sessions']}, "
            f"overlap={bias['is_overlap']}, pairs={len(pair_biases)}"
        )
        return bias

    def handle_session_handoff(self, outgoing_session: str,
                               incoming_session: str,
                               active_signals: Optional[list] = None,
                               key_levels: Optional[dict] = None,
                               bias: Optional[dict] = None,
                               invalidated_signals: Optional[list] = None) -> dict:
        """Transfer state from one session to the next.

        Args:
            outgoing_session: Name of session ending (e.g. 'London').
            incoming_session: Name of session starting (e.g. 'New York').
            active_signals: Still-valid signals to carry over.
            key_levels: Key S/R levels to carry over.
            bias: Current bias dict.
            invalidated_signals: Signals that should NOT carry over.

        Returns:
            Handoff packet for the incoming session.
        """
        handoff = {
            'outgoing_session': outgoing_session,
            'incoming_session': incoming_session,
            'active_signals': active_signals or [],
            'key_levels': key_levels or {},
            'bias': bias or {},
            'invalidated_signals': invalidated_signals or [],
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        logger.info(
            f"Session handoff: {outgoing_session} -> {incoming_session}, "
            f"{len(handoff['active_signals'])} active signals carried over, "
            f"{len(handoff['invalidated_signals'])} invalidated"
        )
        return handoff

    # ==================================================================
    # News Event Protocol
    # ==================================================================

    @staticmethod
    def check_news_events(upcoming_events: List[dict],
                          now_utc: Optional[datetime] = None) -> dict:
        """Evaluate upcoming news events and return action recommendation.

        Each event dict should have at minimum:
          {'name': str, 'time_utc': datetime or ISO str, 'impact': str|int}

        Rules:
          - High-impact event within 15 min -> suspend all signals
          - After event, wait 5 min for stabilization
          - Then re-score confluence before re-entering

        Returns:
            {
              'action': 'suspend' | 'clear' | 'normal',
              'event': str | None,
              'minutes_until': int | None,
            }
        """
        if now_utc is None:
            now_utc = datetime.now(timezone.utc)

        for ev in upcoming_events:
            # Parse event time
            ev_time = ev.get('time_utc')
            if isinstance(ev_time, str):
                try:
                    ev_time = datetime.fromisoformat(ev_time)
                except (ValueError, TypeError):
                    continue
            if ev_time is None:
                continue
            if ev_time.tzinfo is None:
                ev_time = ev_time.replace(tzinfo=timezone.utc)

            # Determine impact level
            impact = ev.get('impact', '')
            is_high = False
            if isinstance(impact, int) and impact >= 4:
                is_high = True
            elif isinstance(impact, str):
                if impact.lower() in ('high', 'critical'):
                    is_high = True
                elif ev.get('name', '').upper() in {e.upper() for e in HIGH_IMPACT_EVENTS}:
                    is_high = True

            if not is_high:
                continue

            delta = ev_time - now_utc
            minutes_until = delta.total_seconds() / 60.0

            if -5.0 <= minutes_until <= 0:
                # Event just happened within last 5 min -- stabilization window
                return {
                    'action': 'clear',
                    'event': ev.get('name', 'Unknown'),
                    'minutes_until': int(minutes_until),
                }
            elif 0 < minutes_until <= 15:
                # High-impact event imminent -- suspend
                return {
                    'action': 'suspend',
                    'event': ev.get('name', 'Unknown'),
                    'minutes_until': int(minutes_until),
                }

        return {'action': 'normal', 'event': None, 'minutes_until': None}

    # ==================================================================
    # Account Configuration
    # ==================================================================

    @staticmethod
    def configure_account(balance: float) -> dict:
        """Determine account type and risk parameters from balance.

        Args:
            balance: Current account balance in USD.

        Returns:
            Account configuration dict with type, limits, and initial
            dollar risk per trade.
        """
        acct_type = ACCOUNT_TYPES[-1]  # default to Institutional
        for at in ACCOUNT_TYPES:
            if at['min_balance'] <= balance <= at['max_balance']:
                acct_type = at
                break

        dollar_risk = round(balance * (acct_type['max_risk_pct'] / 100.0), 2)

        config = {
            'balance': balance,
            'account_type': acct_type['name'],
            'max_risk_pct': acct_type['max_risk_pct'],
            'max_positions': acct_type['max_positions'],
            'dollar_risk_per_trade': dollar_risk,
        }
        logger.info(
            f"Account configured: type={config['account_type']}, "
            f"balance=${balance:,.2f}, risk/trade=${dollar_risk:,.2f}"
        )
        return config

    # ==================================================================
    # Team Grading
    # ==================================================================

    def grade_team(self, agent_grades: List[dict],
                   weekly_pnl_pct: float,
                   weekly_drawdown_pct: float) -> dict:
        """Compute a weighted team grade.

        Weights:
          60% -- average of individual agent scores
          20% -- weekly P&L performance
          20% -- drawdown discipline

        Args:
            agent_grades: List of dicts from AgentGrader.grade_agent().
            weekly_pnl_pct: Net P&L for the week as a percentage.
            weekly_drawdown_pct: Max drawdown during the week as a percentage.

        Returns:
            Team grade dict.
        """
        # Individual average (60%)
        if agent_grades:
            avg_individual = sum(g['total'] for g in agent_grades) / len(agent_grades)
        else:
            avg_individual = 0.0

        # Weekly P&L score (0-20)
        if weekly_pnl_pct >= 2.0:
            pnl_score = 20
        elif weekly_pnl_pct >= 1.0:
            pnl_score = 16
        elif weekly_pnl_pct >= 0.0:
            pnl_score = 12
        elif weekly_pnl_pct >= -3.0:
            pnl_score = 8
        else:
            pnl_score = 0

        # Drawdown discipline score (0-20)
        if weekly_drawdown_pct <= 2.0:
            dd_score = 20
        elif weekly_drawdown_pct <= 5.0:
            dd_score = 15
        elif weekly_drawdown_pct <= 7.0:
            dd_score = 10
        elif weekly_drawdown_pct <= 10.0:
            dd_score = 5
        else:
            dd_score = 0  # lockout territory

        team_score = round(
            (avg_individual * 0.60) + (pnl_score * 1.0) + (dd_score * 1.0), 2
        )
        team_grade = AgentGrader.letter_grade(team_score)

        return {
            'avg_individual_score': round(avg_individual, 2),
            'pnl_score': pnl_score,
            'drawdown_score': dd_score,
            'team_score': team_score,
            'team_grade': team_grade,
            'agent_grades': agent_grades,
        }

    # ==================================================================
    # Weekly Grade Report
    # ==================================================================

    def format_weekly_grade_report(self,
                                   team_result: dict,
                                   week_start: Optional[str] = None,
                                   week_end: Optional[str] = None,
                                   account_growth_usd: float = 0.0,
                                   account_growth_pct: float = 0.0) -> str:
        """Produce a formatted weekly grade report string.

        Args:
            team_result: Output of grade_team().
            week_start: Start date string (e.g. '2025-05-12').
            week_end: End date string (e.g. '2025-05-18').
            account_growth_usd: Dollar growth over the week.
            account_growth_pct: Percentage growth over the week.

        Returns:
            Multi-line formatted report.
        """
        now = datetime.now(timezone.utc)
        if not week_start:
            ws = now - timedelta(days=now.weekday())
            week_start = ws.strftime('%Y-%m-%d')
        if not week_end:
            we = now - timedelta(days=now.weekday()) + timedelta(days=6)
            week_end = we.strftime('%Y-%m-%d')

        agent_grades: List[dict] = team_result.get('agent_grades', [])

        lines = [f"Week of: {week_start} - {week_end}"]
        lines.append("Individual Agent Grades:")

        lowest = None
        highest = None
        category_totals: Dict[str, float] = {}
        category_counts: Dict[str, int] = {}

        for ag in agent_grades:
            agent_name = ag['agent']
            total = ag['total']
            grade = ag['grade']

            # Determine trend vs previous grades
            prev = self._previous_grades.get(agent_name)
            if prev is not None:
                if total > prev + 2:
                    trend = '↑'
                elif total < prev - 2:
                    trend = '↓'
                else:
                    trend = '→'
            else:
                trend = '→'
            self._previous_grades[agent_name] = total

            lines.append(
                f"  {agent_name} -> Score: {total}/100 -> "
                f"Grade: {grade} -> Trend: {trend}"
            )

            # Track lowest / highest
            if lowest is None or total < lowest['total']:
                lowest = ag
            if highest is None or total > highest['total']:
                highest = ag

            # Accumulate category averages
            for cat, score in ag.get('categories', {}).items():
                category_totals[cat] = category_totals.get(cat, 0.0) + score
                category_counts[cat] = category_counts.get(cat, 0) + 1

        # Team overall
        team_score = team_result['team_score']
        team_grade = team_result['team_grade']
        team_prev = self._previous_grades.get('__team__')
        if team_prev is not None:
            if team_score > team_prev + 2:
                team_trend = '↑'
            elif team_score < team_prev - 2:
                team_trend = '↓'
            else:
                team_trend = '→'
        else:
            team_trend = '→'
        self._previous_grades['__team__'] = team_score

        lines.append(f"Team Overall Score: {team_score}/100")
        lines.append(f"Team Grade: {team_grade}")
        lines.append(f"Team Trend: {team_trend}")

        # Lowest / highest agents
        if lowest:
            lowest_cats = lowest.get('categories', {})
            weakest_cat = min(lowest_cats, key=lowest_cats.get) if lowest_cats else 'N/A'
            lines.append(
                f"Lowest scoring agent: {lowest['agent']} -- "
                f"flagged for: {weakest_cat}"
            )
        if highest:
            highest_cats = highest.get('categories', {})
            best_cat = max(highest_cats, key=highest_cats.get) if highest_cats else 'N/A'
            lines.append(
                f"Highest scoring agent: {highest['agent']} -- "
                f"standout: {best_cat}"
            )

        # Key weakness across team
        if category_totals and category_counts:
            cat_avgs = {
                cat: category_totals[cat] / category_counts[cat]
                for cat in category_totals
            }
            key_weakness = min(cat_avgs, key=cat_avgs.get)
            lines.append(f"Key weakness: {key_weakness}")

            # Recommended action
            action_map = {
                'rule_compliance': 'Reinforce rule-following protocols and review checklists',
                'signal_quality': 'Raise confluence threshold or review indicator alignment',
                'risk_management': 'Audit position sizing and drawdown lockout adherence',
                'timeliness': 'Tighten signal and journal latency requirements',
                'adaptability': 'Improve responsiveness to HTF bias shifts and news events',
            }
            lines.append(
                f"Recommended action: {action_map.get(key_weakness, 'Review overall process')}"
            )
        else:
            lines.append("Key weakness: N/A")
            lines.append("Recommended action: N/A")

        # Account growth
        sign = '+' if account_growth_usd >= 0 else ''
        lines.append(
            f"Account growth: {sign}${account_growth_usd:,.2f} "
            f"({sign}{account_growth_pct:.2f}%)"
        )

        return "\n".join(lines)

    # ==================================================================
    # Pipeline
    # ==================================================================

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

        # ── Phase 0: Session Context ────────────────────────────────────

        session_info = self.get_current_session()
        logger.info(
            f"Active sessions: {session_info['active_sessions']}, "
            f"overlap={session_info['is_overlap']}"
        )

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

        # ── Phase 1.5: Session Bias ──────────────────────────────────────

        session_bias = self.set_session_bias(
            session_info=session_info,
            htf_trend=tech_result.get('pairs', {}) if tech_result.get('status') == 'success' else None,
            key_levels=None,
            pending_news=news_result.get('headlines', []) if news_result.get('status') == 'success' else None,
            correlated_markets=corr_result if corr_result.get('status') == 'success' else None,
        )

        # ── Phase 2: Signal Generation ───────────────────────────────────

        # Black Widow - Trade ideas generation (with session context)
        logger.info("Romanoff, compile the intel...")
        try:
            ideas_result = self.trade_ideas_gen.generate(
                tech_result, fund_result, sent_result, corr_result,
                session_info=session_info,
            )
        except TypeError:
            # Fallback if BlackWidow.generate() doesn't accept session_info yet
            try:
                ideas_result = self.trade_ideas_gen.generate(
                    tech_result, fund_result, sent_result, corr_result
                )
            except Exception as e:
                logger.error(f"Black Widow agent failed: {e}", exc_info=True)
                ideas_result = {'status': 'error', 'error': str(e), 'trade_ideas': []}
        except Exception as e:
            logger.error(f"Black Widow agent failed: {e}", exc_info=True)
            ideas_result = {'status': 'error', 'error': str(e), 'trade_ideas': []}

        # ── Phase 3: Risk Validation ─────────────────────────────────────

        # Doctor Strange - Risk management check on trade ideas
        # Pass each signal through with confluence-scaled risk
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

        # ── Phase 3.5: Journal Logging ───────────────────────────────────

        # Log every approved signal to WarMachine journal
        approved_trades = []
        if risk_result.get('status') == 'success':
            approved_trades = risk_result.get(
                'approved_trades', risk_result.get('approved', [])
            )
            if isinstance(approved_trades, list):
                for trade in approved_trades:
                    self.journal.log_signal({
                        'pair': trade.get('pair', 'Unknown'),
                        'direction': trade.get('direction', 'N/A'),
                        'confluence': trade.get('confluence_score',
                                                trade.get('confidence', 0)),
                        'session': session_info.get('active_sessions', []),
                        'risk_pct': trade.get('risk_pct',
                                              self.account_config.get(
                                                  'max_risk_pct', 0)),
                    })

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
            'session': session_info,
            'session_bias': session_bias,
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
