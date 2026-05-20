"""
Doctor Strange (Stephen Strange) - Risk Management Agent

"I've seen 14 million futures... and there's only one way to manage this risk."

Stephen Strange sees all possible futures and calculates the probability of each
outcome. He handles position sizing, portfolio risk exposure, drawdown management,
and risk-adjusted trade validation. Every trade idea from BlackWidow passes through
Strange's scrutiny -- he approves, modifies, or vetoes based on cold mathematical
reality.
"""

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple

import numpy as np

logger = logging.getLogger('doctor_strange')

PERSONA = (
    "I've seen 14 million futures... and there's only one way to manage this risk. "
    "The math doesn't lie, and neither do I."
)

# ======================================================================
# Futures Contract Specifications
# ======================================================================

FUTURES_SPECS: Dict[str, Dict[str, float]] = {
    'ES': {'tick_value': 12.50, 'description': 'E-mini S&P 500'},
    'NQ': {'tick_value': 5.00, 'description': 'E-mini Nasdaq 100'},
    'YM': {'tick_value': 5.00, 'description': 'E-mini Dow'},
    'GC': {'tick_value': 10.00, 'description': 'Gold'},
    'SI': {'tick_value': 25.00, 'description': 'Silver'},
    'CL': {'tick_value': 10.00, 'description': 'Crude Oil'},
    'NG': {'tick_value': 10.00, 'description': 'Natural Gas'},
    'ZB': {'tick_value': 31.25, 'description': '30-Year Treasury Bond'},
    'ZN': {'tick_value': 15.625, 'description': '10-Year Treasury Note'},
}

# ======================================================================
# Account Type Definitions
# ======================================================================

ACCOUNT_TYPES: List[Dict] = [
    {'name': 'Micro',         'min_balance': 0,       'max_balance': 999.99,    'max_risk_pct': 1.0, 'max_positions': 2},
    {'name': 'Mini',          'min_balance': 1_000,    'max_balance': 9_999.99,  'max_risk_pct': 2.0, 'max_positions': 3},
    {'name': 'Standard',      'min_balance': 10_000,   'max_balance': 49_999.99, 'max_risk_pct': 2.0, 'max_positions': 5},
    {'name': 'Professional',  'min_balance': 50_000,   'max_balance': 249_999.99,'max_risk_pct': 1.0, 'max_positions': 10},
    {'name': 'Institutional', 'min_balance': 250_000,  'max_balance': float('inf'), 'max_risk_pct': 0.5, 'max_positions': 15},
]


# ======================================================================
# Account State Tracking
# ======================================================================

class AccountState:
    """Tracks running account state including P&L, drawdown, and streak info."""

    def __init__(self, starting_balance: float):
        self.starting_balance: float = starting_balance
        self.current_balance: float = starting_balance

        self.daily_pnl: float = 0.0
        self.weekly_pnl: float = 0.0

        self.daily_high: float = starting_balance
        self.weekly_high: float = starting_balance

        self.open_positions: int = 0
        self.consecutive_losses: int = 0

        self._loss_streak_risk_multiplier: float = 1.0

    # --- derived drawdown percentages ---

    @property
    def daily_drawdown_pct(self) -> float:
        if self.daily_high <= 0:
            return 0.0
        return max(0.0, (self.daily_high - self.current_balance) / self.daily_high * 100)

    @property
    def weekly_drawdown_pct(self) -> float:
        if self.weekly_high <= 0:
            return 0.0
        return max(0.0, (self.weekly_high - self.current_balance) / self.weekly_high * 100)

    @property
    def risk_multiplier(self) -> float:
        """Current risk multiplier accounting for losing streaks."""
        return self._loss_streak_risk_multiplier

    # --- mutators ---

    def update_after_trade(self, pnl: float) -> None:
        """Update state after a closed trade.

        Args:
            pnl: Profit (positive) or loss (negative) in USD.
        """
        self.current_balance += pnl
        self.daily_pnl += pnl
        self.weekly_pnl += pnl

        # Track highs for drawdown calculation
        if self.current_balance > self.daily_high:
            self.daily_high = self.current_balance
        if self.current_balance > self.weekly_high:
            self.weekly_high = self.current_balance

        # Consecutive loss tracking
        if pnl < 0:
            self.consecutive_losses += 1
            if self.consecutive_losses >= 3:
                self._loss_streak_risk_multiplier = 0.5
                logger.warning(
                    "AccountState: %d consecutive losses -- risk reduced to 50%%",
                    self.consecutive_losses,
                )
        else:
            self.consecutive_losses = 0
            self._loss_streak_risk_multiplier = 1.0

        logger.info(
            "AccountState update: pnl=%.2f, balance=%.2f, daily_dd=%.2f%%, consec_losses=%d",
            pnl, self.current_balance, self.daily_drawdown_pct, self.consecutive_losses,
        )

    def reset_daily(self) -> None:
        """Reset daily tracking counters (call at start of each trading day)."""
        self.daily_pnl = 0.0
        self.daily_high = self.current_balance
        logger.info("AccountState: daily counters reset, balance=%.2f", self.current_balance)

    def reset_weekly(self) -> None:
        """Reset weekly tracking counters (call at start of each trading week)."""
        self.weekly_pnl = 0.0
        self.weekly_high = self.current_balance
        logger.info("AccountState: weekly counters reset, balance=%.2f", self.current_balance)

    def calculate_dollar_risk(self, risk_pct: float) -> float:
        """Recalculate dollar risk based on current balance and risk percentage."""
        return self.current_balance * (risk_pct / 100.0)

    def to_dict(self) -> dict:
        return {
            'starting_balance': self.starting_balance,
            'current_balance': self.current_balance,
            'daily_pnl': round(self.daily_pnl, 2),
            'weekly_pnl': round(self.weekly_pnl, 2),
            'daily_drawdown_pct': round(self.daily_drawdown_pct, 2),
            'weekly_drawdown_pct': round(self.weekly_drawdown_pct, 2),
            'open_positions': self.open_positions,
            'consecutive_losses': self.consecutive_losses,
            'risk_multiplier': self._loss_streak_risk_multiplier,
        }


class DoctorStrange:
    """Stephen Strange sees all possible futures and manages risk."""

    DEFAULT_CONFIG = {
        'max_risk_per_trade_pct': 1.0,       # Max 1% of account per trade
        'max_portfolio_risk_pct': 5.0,        # Max 5% total open risk
        'max_correlated_risk_pct': 3.0,       # Max 3% in correlated positions
        'max_drawdown_pct': 10.0,             # Stop trading at 10% drawdown
        'max_positions': 5,                    # Max concurrent positions
        'min_risk_reward': 1.5,                # Minimum 1:1.5 RR required
        'default_account_size': 10000,         # Default account size USD
        'kelly_fraction': 0.25,                # Quarter-Kelly for safety
    }

    def __init__(self, config: dict = None, account_size: float = None):
        """
        Initialize Doctor Strange with risk parameters.

        Args:
            config: Override any key in DEFAULT_CONFIG.
            account_size: Starting account size in USD.
        """
        self.config = {**self.DEFAULT_CONFIG, **(config or {})}
        self.account_size = account_size or self.config['default_account_size']
        self.account_state = AccountState(self.account_size)
        self.account_type_info = self.determine_account_type(self.account_size)
        logger.info(
            "Doctor Strange initialized -- account_size=%.2f, account_type=%s, "
            "max_risk_per_trade=%.1f%%",
            self.account_size, self.account_type_info['account_type'],
            self.config['max_risk_per_trade_pct'],
        )

    # ------------------------------------------------------------------
    # Position Sizing
    # ------------------------------------------------------------------

    def calculate_position_size(
        self,
        account_size: float,
        risk_pct: float,
        entry: float,
        stop_loss: float,
        atr: float = None,
    ) -> dict:
        """
        Calculate the optimal position size for a trade.

        If *atr* is supplied the stop distance is widened to at least 1.5x ATR
        so the position isn't shaken out by normal volatility.

        Args:
            account_size: Current account balance in USD.
            risk_pct: Percentage of account to risk (e.g. 1.0 for 1%).
            entry: Planned entry price.
            stop_loss: Stop-loss price.
            atr: Average True Range value (optional).

        Returns:
            dict with position_size_units, dollar_risk, lot_size, and
            risk_per_unit.
        """
        try:
            dollar_risk = account_size * (risk_pct / 100.0)
            raw_distance = abs(entry - stop_loss)

            if raw_distance == 0:
                logger.warning("Entry == stop_loss; cannot size position.")
                return {
                    'position_size_units': 0,
                    'dollar_risk': 0,
                    'lot_size': 0,
                    'risk_per_unit': 0,
                    'atr_adjusted': False,
                    'error': 'Entry and stop_loss are equal',
                }

            # ATR-adjusted stop distance
            if atr and atr > 0:
                min_distance = 1.5 * atr
                risk_per_unit = max(raw_distance, min_distance)
                atr_adjusted = risk_per_unit != raw_distance
            else:
                risk_per_unit = raw_distance
                atr_adjusted = False

            position_size_units = dollar_risk / risk_per_unit
            lot_size = position_size_units / 100_000  # forex convention

            return {
                'position_size_units': round(position_size_units, 6),
                'dollar_risk': round(dollar_risk, 2),
                'lot_size': round(lot_size, 4),
                'risk_per_unit': round(risk_per_unit, 6),
                'atr_adjusted': atr_adjusted,
            }
        except Exception as exc:
            logger.error("Position sizing error: %s", exc)
            return {
                'position_size_units': 0,
                'dollar_risk': 0,
                'lot_size': 0,
                'risk_per_unit': 0,
                'atr_adjusted': False,
                'error': str(exc),
            }

    # ------------------------------------------------------------------
    # Kelly Criterion
    # ------------------------------------------------------------------

    def calculate_kelly_criterion(
        self,
        win_rate: float,
        avg_win: float,
        avg_loss: float,
    ) -> dict:
        """
        Calculate Kelly criterion bet sizing.

        Args:
            win_rate: Historical win rate as a decimal (e.g. 0.55).
            avg_win: Average winning trade in USD.
            avg_loss: Average losing trade in USD (positive number).

        Returns:
            dict with full_kelly_pct, half_kelly_pct, quarter_kelly_pct,
            and expected_value.
        """
        try:
            if avg_loss == 0:
                return {
                    'full_kelly_pct': 0,
                    'half_kelly_pct': 0,
                    'quarter_kelly_pct': 0,
                    'expected_value': 0,
                    'error': 'avg_loss cannot be zero',
                }

            win_loss_ratio = avg_win / avg_loss
            lose_rate = 1.0 - win_rate

            # Kelly formula: K% = W - (L / R)
            full_kelly = win_rate - (lose_rate / win_loss_ratio)
            full_kelly = max(full_kelly, 0.0)  # never negative

            expected_value = (win_rate * avg_win) - (lose_rate * avg_loss)

            return {
                'full_kelly_pct': round(full_kelly * 100, 2),
                'half_kelly_pct': round(full_kelly * 50, 2),
                'quarter_kelly_pct': round(full_kelly * 25, 2),
                'recommended_pct': round(
                    full_kelly * self.config['kelly_fraction'] * 100, 2
                ),
                'expected_value': round(expected_value, 2),
                'win_loss_ratio': round(win_loss_ratio, 2),
            }
        except Exception as exc:
            logger.error("Kelly criterion error: %s", exc)
            return {
                'full_kelly_pct': 0,
                'half_kelly_pct': 0,
                'quarter_kelly_pct': 0,
                'recommended_pct': 0,
                'expected_value': 0,
                'error': str(exc),
            }

    # ------------------------------------------------------------------
    # Portfolio Risk Assessment
    # ------------------------------------------------------------------

    def assess_portfolio_risk(
        self,
        open_positions: List[dict],
        correlation_data: Dict[str, Dict[str, float]] = None,
    ) -> dict:
        """
        Assess total portfolio risk including correlation effects.

        Each position in *open_positions* should have at minimum:
            {'pair': str, 'risk_pct': float, 'direction': str}

        *correlation_data* maps pair-pair keys to correlation coefficients,
        e.g. {'BTCUSD': {'ETHUSD': 0.85}}.

        Returns:
            dict with total_risk_pct, correlation_adjusted_risk_pct,
            diversification_score, can_open_new, and correlated_groups.
        """
        try:
            if not open_positions:
                return {
                    'total_risk_pct': 0.0,
                    'correlation_adjusted_risk_pct': 0.0,
                    'diversification_score': 10.0,
                    'can_open_new': True,
                    'positions_open': 0,
                    'positions_available': self.config['max_positions'],
                    'correlated_groups': [],
                }

            total_risk = sum(pos.get('risk_pct', 0) for pos in open_positions)

            # Correlation-adjusted risk
            correlated_risk = total_risk
            correlated_groups = []

            if correlation_data:
                pairs = [pos['pair'] for pos in open_positions]
                risk_map = {pos['pair']: pos.get('risk_pct', 0) for pos in open_positions}

                for i, pair_a in enumerate(pairs):
                    for pair_b in pairs[i + 1:]:
                        corr = (
                            correlation_data.get(pair_a, {}).get(pair_b, 0)
                            or correlation_data.get(pair_b, {}).get(pair_a, 0)
                        )
                        if abs(corr) >= 0.7:
                            # Amplify risk for highly correlated positions
                            overlap = min(risk_map.get(pair_a, 0), risk_map.get(pair_b, 0))
                            correlated_risk += overlap * abs(corr) * 0.5
                            correlated_groups.append({
                                'pairs': [pair_a, pair_b],
                                'correlation': round(corr, 2),
                                'added_risk_pct': round(overlap * abs(corr) * 0.5, 2),
                            })

            # Diversification score: 10 = fully diversified, 0 = concentrated
            unique_pairs = len(set(pos['pair'] for pos in open_positions))
            max_corr = 0
            if correlation_data:
                for group in correlated_groups:
                    max_corr = max(max_corr, abs(group['correlation']))

            diversity = min(10.0, unique_pairs * 2.5) * (1 - max_corr * 0.5)
            diversity = max(0, round(diversity, 1))

            positions_available = self.config['max_positions'] - len(open_positions)
            can_open_new = (
                positions_available > 0
                and correlated_risk < self.config['max_portfolio_risk_pct']
            )

            return {
                'total_risk_pct': round(total_risk, 2),
                'correlation_adjusted_risk_pct': round(correlated_risk, 2),
                'diversification_score': diversity,
                'can_open_new': can_open_new,
                'positions_open': len(open_positions),
                'positions_available': max(positions_available, 0),
                'correlated_groups': correlated_groups,
            }
        except Exception as exc:
            logger.error("Portfolio risk assessment error: %s", exc)
            return {
                'total_risk_pct': 0,
                'correlation_adjusted_risk_pct': 0,
                'diversification_score': 0,
                'can_open_new': False,
                'positions_open': len(open_positions) if open_positions else 0,
                'positions_available': 0,
                'correlated_groups': [],
                'error': str(exc),
            }

    # ------------------------------------------------------------------
    # Drawdown Management
    # ------------------------------------------------------------------

    def calculate_drawdown_status(
        self,
        account_size: float,
        peak_balance: float,
        current_balance: float,
    ) -> dict:
        """
        Determine drawdown severity and whether trading should pause.

        Severity levels:
            GREEN    : <3%   drawdown
            YELLOW   : 3-6%  drawdown
            RED      : 6-10% drawdown
            CRITICAL : >=10% drawdown (trading paused)

        Returns:
            dict with drawdown_pct, severity, trading_allowed, and
            recovery_needed_pct.
        """
        try:
            if peak_balance <= 0:
                return {
                    'drawdown_pct': 0,
                    'severity': 'GREEN',
                    'trading_allowed': True,
                    'recovery_needed_pct': 0,
                    'error': 'peak_balance must be > 0',
                }

            drawdown_pct = ((peak_balance - current_balance) / peak_balance) * 100
            drawdown_pct = max(drawdown_pct, 0.0)

            # Recovery math: if down 10%, need ~11.1% gain to recover
            if current_balance > 0:
                recovery_needed_pct = ((peak_balance - current_balance) / current_balance) * 100
            else:
                recovery_needed_pct = 100.0

            max_dd = self.config['max_drawdown_pct']

            if drawdown_pct < 3:
                severity = 'GREEN'
            elif drawdown_pct < 6:
                severity = 'YELLOW'
            elif drawdown_pct < max_dd:
                severity = 'RED'
            else:
                severity = 'CRITICAL'

            trading_allowed = drawdown_pct < max_dd

            return {
                'drawdown_pct': round(drawdown_pct, 2),
                'severity': severity,
                'trading_allowed': trading_allowed,
                'recovery_needed_pct': round(max(recovery_needed_pct, 0), 2),
            }
        except Exception as exc:
            logger.error("Drawdown calculation error: %s", exc)
            return {
                'drawdown_pct': 0,
                'severity': 'GREEN',
                'trading_allowed': False,
                'recovery_needed_pct': 0,
                'error': str(exc),
            }

    # ------------------------------------------------------------------
    # Trade Validation (the main gate)
    # ------------------------------------------------------------------

    def validate_trade(
        self,
        trade_idea: dict,
        account_size: float,
        open_positions: List[dict] = None,
        correlation_data: Dict[str, Dict[str, float]] = None,
    ) -> dict:
        """
        Validate a single trade idea against all risk parameters.

        *trade_idea* expected keys:
            pair, direction, entry, stop_loss, take_profit, confidence

        Returns:
            dict with verdict (APPROVED / MODIFIED / VETOED), reasons,
            position_size, dollar_risk, risk_reward, and optional
            modifications.
        """
        open_positions = open_positions or []
        reasons = []
        modifications = None
        verdict = 'APPROVED'

        try:
            pair = trade_idea.get('pair', 'UNKNOWN')
            entry = trade_idea.get('entry', 0)
            stop_loss = trade_idea.get('stop_loss', 0)
            take_profit = trade_idea.get('take_profit', 0)
            direction = trade_idea.get('direction', 'LONG')
            confidence = trade_idea.get('confidence', 'MEDIUM')

            # --- Risk:Reward ratio ---
            risk_distance = abs(entry - stop_loss)
            reward_distance = abs(take_profit - entry)

            if risk_distance == 0:
                return {
                    'pair': pair,
                    'direction': direction,
                    'original_confidence': confidence,
                    'verdict': 'VETOED',
                    'position_size': 0,
                    'dollar_risk': 0,
                    'risk_reward': 0,
                    'reasons': ['Invalid entry/stop_loss -- zero risk distance'],
                    'modifications': None,
                }

            risk_reward = reward_distance / risk_distance

            if risk_reward < self.config['min_risk_reward']:
                verdict = 'VETOED'
                reasons.append(
                    f"RR {risk_reward:.2f} below minimum {self.config['min_risk_reward']}"
                )

            # --- Position sizing ---
            risk_pct = min(
                self.config['max_risk_per_trade_pct'],
                self._confidence_to_risk_pct(confidence),
            )
            sizing = self.calculate_position_size(
                account_size, risk_pct, entry, stop_loss,
                atr=trade_idea.get('atr'),
            )

            if sizing.get('error'):
                verdict = 'VETOED'
                reasons.append(f"Sizing error: {sizing['error']}")

            # --- Portfolio risk check ---
            portfolio = self.assess_portfolio_risk(open_positions, correlation_data)

            if not portfolio['can_open_new'] and len(open_positions) >= self.config['max_positions']:
                verdict = 'VETOED'
                reasons.append(
                    f"Max positions reached ({self.config['max_positions']})"
                )

            projected_total = portfolio['total_risk_pct'] + risk_pct
            if projected_total > self.config['max_portfolio_risk_pct']:
                if verdict != 'VETOED':
                    # Try to reduce size instead of full veto
                    available_risk = self.config['max_portfolio_risk_pct'] - portfolio['total_risk_pct']
                    if available_risk > 0.2:  # at least 0.2% risk to be worthwhile
                        verdict = 'MODIFIED'
                        risk_pct = available_risk
                        sizing = self.calculate_position_size(
                            account_size, risk_pct, entry, stop_loss,
                            atr=trade_idea.get('atr'),
                        )
                        modifications = {
                            'risk_pct': round(risk_pct, 2),
                            'reason': (
                                f"Reduced risk from {self.config['max_risk_per_trade_pct']}% "
                                f"to {risk_pct:.2f}% to stay within portfolio limit"
                            ),
                        }
                        reasons.append('Position size reduced for portfolio risk limit')
                    else:
                        verdict = 'VETOED'
                        reasons.append(
                            f"Portfolio risk {projected_total:.1f}% would exceed "
                            f"max {self.config['max_portfolio_risk_pct']}%"
                        )

            # --- Correlation check ---
            if correlation_data and verdict != 'VETOED':
                pair_corrs = correlation_data.get(pair, {})
                for pos in open_positions:
                    corr = pair_corrs.get(pos['pair'], 0)
                    if abs(corr) >= 0.8 and pos.get('direction') == direction:
                        corr_risk = portfolio['correlation_adjusted_risk_pct'] + risk_pct
                        if corr_risk > self.config['max_correlated_risk_pct']:
                            if verdict == 'APPROVED':
                                verdict = 'MODIFIED'
                                new_sl = self._tighten_stop(entry, stop_loss, direction, 0.7)
                                modifications = modifications or {}
                                modifications['stop_loss'] = round(new_sl, 6)
                                modifications['reason'] = (
                                    modifications.get('reason', '')
                                    + f' Tightened SL due to {corr:.0%} correlation with {pos["pair"]}.'
                                ).strip()
                            reasons.append(
                                f"High correlation ({corr:.2f}) with open {pos['pair']}"
                            )

            if verdict == 'APPROVED' and not reasons:
                reasons.append('Good RR ratio')
                reasons.append('Portfolio has room')

            return {
                'pair': pair,
                'direction': direction,
                'original_confidence': confidence,
                'verdict': verdict,
                'position_size': sizing.get('position_size_units', 0),
                'dollar_risk': sizing.get('dollar_risk', 0),
                'risk_reward': round(risk_reward, 2),
                'reasons': reasons,
                'modifications': modifications,
            }
        except Exception as exc:
            logger.error("Trade validation error for %s: %s", trade_idea.get('pair'), exc)
            return {
                'pair': trade_idea.get('pair', 'UNKNOWN'),
                'direction': trade_idea.get('direction', ''),
                'original_confidence': trade_idea.get('confidence', ''),
                'verdict': 'VETOED',
                'position_size': 0,
                'dollar_risk': 0,
                'risk_reward': 0,
                'reasons': [f'Validation error: {exc}'],
                'modifications': None,
            }

    # ------------------------------------------------------------------
    # Monte Carlo Simulation
    # ------------------------------------------------------------------

    def run_monte_carlo(
        self,
        win_rate: float,
        avg_rr: float,
        num_trades: int = 1000,
        simulations: int = 1000,
    ) -> dict:
        """
        Run Monte Carlo simulations to estimate risk of ruin,
        expected max drawdown, and return confidence intervals.

        Args:
            win_rate: Probability of winning a trade (0-1).
            avg_rr: Average risk:reward ratio.
            num_trades: Number of trades per simulation.
            simulations: Number of simulation runs.

        Returns:
            dict with probability_of_ruin, expected_max_drawdown,
            confidence_95_return, confidence_5_return, median_return.
        """
        try:
            rng = np.random.default_rng(seed=42)

            risk_per_trade = self.config['max_risk_per_trade_pct'] / 100.0
            starting_balance = 1.0  # normalised

            final_balances = np.empty(simulations)
            max_drawdowns = np.empty(simulations)
            ruin_count = 0
            ruin_threshold = 0.5  # 50% loss = ruin

            for sim in range(simulations):
                balance = starting_balance
                peak = starting_balance

                # Generate all trade outcomes at once
                outcomes = rng.random(num_trades)
                for outcome in outcomes:
                    if outcome < win_rate:
                        balance += balance * risk_per_trade * avg_rr
                    else:
                        balance -= balance * risk_per_trade

                    if balance > peak:
                        peak = balance

                    if balance <= starting_balance * ruin_threshold:
                        ruin_count += 1
                        break

                dd = ((peak - balance) / peak) * 100 if peak > 0 else 0
                max_drawdowns[sim] = dd
                final_balances[sim] = balance

            returns = ((final_balances - starting_balance) / starting_balance) * 100

            return {
                'probability_of_ruin': round(ruin_count / simulations, 4),
                'expected_max_drawdown': round(float(np.mean(max_drawdowns)), 2),
                'median_return': round(float(np.median(returns)), 2),
                'confidence_95_return': round(float(np.percentile(returns, 95)), 2),
                'confidence_5_return': round(float(np.percentile(returns, 5)), 2),
                'simulations_run': simulations,
                'trades_per_sim': num_trades,
            }
        except Exception as exc:
            logger.error("Monte Carlo error: %s", exc)
            return {
                'probability_of_ruin': 0,
                'expected_max_drawdown': 0,
                'median_return': 0,
                'confidence_95_return': 0,
                'confidence_5_return': 0,
                'error': str(exc),
            }

    # ------------------------------------------------------------------
    # Main Analyze Method
    # ------------------------------------------------------------------

    def analyze(
        self,
        trade_ideas: List[dict],
        account_size: float = None,
        open_positions: List[dict] = None,
        correlation_data: Dict[str, Dict[str, float]] = None,
    ) -> dict:
        """
        Review all trade ideas from BlackWidow and return risk-adjusted
        portfolio recommendations.

        Args:
            trade_ideas: List of trade idea dicts from BlackWidow.
            account_size: Current account balance (uses default if None).
            open_positions: Currently open positions.
            correlation_data: Pair correlation matrix.

        Returns:
            Full risk analysis dict with status, account_status,
            trade_reviews, portfolio_summary, and monte_carlo.
        """
        account_size = account_size or self.account_size
        open_positions = open_positions or []

        try:
            # Drawdown status (use account_size as both peak and current
            # if no separate peak is tracked)
            peak_balance = max(account_size, self.config['default_account_size'])
            dd_status = self.calculate_drawdown_status(
                account_size, peak_balance, account_size,
            )

            portfolio = self.assess_portfolio_risk(open_positions, correlation_data)

            # Validate each trade idea
            trade_reviews = []
            for idea in trade_ideas:
                if not dd_status['trading_allowed']:
                    trade_reviews.append({
                        'pair': idea.get('pair', 'UNKNOWN'),
                        'direction': idea.get('direction', ''),
                        'original_confidence': idea.get('confidence', ''),
                        'verdict': 'VETOED',
                        'position_size': 0,
                        'dollar_risk': 0,
                        'risk_reward': 0,
                        'reasons': [
                            f"Trading paused -- drawdown at {dd_status['drawdown_pct']}% "
                            f"(severity: {dd_status['severity']})"
                        ],
                        'modifications': None,
                    })
                    continue

                review = self.validate_trade(
                    idea, account_size, open_positions, correlation_data,
                )
                trade_reviews.append(review)

                # If approved/modified, add to running position list for
                # subsequent validations within this batch
                if review['verdict'] in ('APPROVED', 'MODIFIED'):
                    sizing = self.calculate_position_size(
                        account_size,
                        self._confidence_to_risk_pct(idea.get('confidence', 'MEDIUM')),
                        idea.get('entry', 0),
                        idea.get('stop_loss', 0),
                    )
                    open_positions = open_positions + [{
                        'pair': idea.get('pair', 'UNKNOWN'),
                        'risk_pct': sizing['dollar_risk'] / account_size * 100 if account_size else 0,
                        'direction': idea.get('direction', 'LONG'),
                    }]

            # Re-assess portfolio after adding approved trades
            updated_portfolio = self.assess_portfolio_risk(open_positions, correlation_data)

            # Monte Carlo with reasonable defaults
            mc = self.run_monte_carlo(win_rate=0.55, avg_rr=1.8)

            approved = sum(1 for r in trade_reviews if r['verdict'] == 'APPROVED')
            modified = sum(1 for r in trade_reviews if r['verdict'] == 'MODIFIED')
            vetoed = sum(1 for r in trade_reviews if r['verdict'] == 'VETOED')

            logger.info(
                "Analysis complete: %d approved, %d modified, %d vetoed out of %d ideas",
                approved, modified, vetoed, len(trade_ideas),
            )

            return {
                'status': 'success',
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'account_status': {
                    'account_size': account_size,
                    'drawdown_pct': dd_status['drawdown_pct'],
                    'drawdown_severity': dd_status['severity'],
                    'trading_allowed': dd_status['trading_allowed'],
                    'positions_open': portfolio['positions_open'],
                    'positions_available': portfolio['positions_available'],
                    'total_risk_pct': portfolio['total_risk_pct'],
                },
                'trade_reviews': trade_reviews,
                'portfolio_summary': {
                    'total_risk_after_trades': updated_portfolio['correlation_adjusted_risk_pct'],
                    'diversification_score': updated_portfolio['diversification_score'],
                    'correlation_warning': len(updated_portfolio['correlated_groups']) > 0,
                },
                'monte_carlo': {
                    'probability_of_ruin': mc['probability_of_ruin'],
                    'expected_max_drawdown': mc['expected_max_drawdown'],
                    'confidence_95_return': mc['confidence_95_return'],
                },
            }
        except Exception as exc:
            logger.error("Analysis failed: %s", exc)
            return {
                'status': 'error',
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'error': str(exc),
                'trade_reviews': [],
            }

    # ------------------------------------------------------------------
    # Report Formatting (Telegram MarkdownV2)
    # ------------------------------------------------------------------

    def format_report(self, analysis: dict) -> str:
        """
        Format analysis results as a Telegram MarkdownV2 message.

        Escapes special characters per the MarkdownV2 spec.
        """
        if analysis.get('status') != 'success':
            err = self._esc(analysis.get('error', 'Unknown error'))
            return f"*Doctor Strange* \\| Risk Report\n\n`ERROR: {err}`"

        acct = analysis['account_status']
        mc = analysis.get('monte_carlo', {})
        ps = analysis.get('portfolio_summary', {})

        acct_size_str = f"{acct['account_size']:,.2f}"
        dd_str = f"{acct['drawdown_pct']:.1f}"
        risk_str = f"{acct['total_risk_pct']:.1f}"
        trading_str = 'Allowed' if acct['trading_allowed'] else 'PAUSED'
        pos_total = acct['positions_open'] + acct['positions_available']

        lines = [
            "*Doctor Strange* \\| Risk Report",
            f"_{self._esc(PERSONA)}_",
            "",
            f"*Account*: ${self._esc(acct_size_str)}",
            f"*Drawdown*: {self._esc(dd_str)}% \\({self._esc(acct['drawdown_severity'])}\\)",
            f"*Trading*: {trading_str}",
            f"*Positions*: {acct['positions_open']}/{pos_total}",
            f"*Total Risk*: {self._esc(risk_str)}%",
            "",
        ]

        # Trade reviews
        for review in analysis.get('trade_reviews', []):
            verdict = review['verdict']
            icon = {'APPROVED': 'APPROVED', 'MODIFIED': 'MODIFIED', 'VETOED': 'VETOED'}.get(verdict, verdict)

            lines.append(
                f"*{self._esc(review['pair'])}* {self._esc(review['direction'])} "
                f"\\[{self._esc(icon)}\\]"
            )
            dollar_risk_str = f"{review['dollar_risk']:.2f}"
            lines.append(
                f"  RR: {self._esc(str(review['risk_reward']))} \\| "
                f"Risk: ${self._esc(dollar_risk_str)}"
            )
            if review.get('reasons'):
                for reason in review['reasons']:
                    lines.append(f"  \\- {self._esc(reason)}")
            if review.get('modifications'):
                mod = review['modifications']
                lines.append(f"  _Mod: {self._esc(mod.get('reason', ''))}_")
            lines.append("")

        # Portfolio summary
        total_risk_str = f"{ps.get('total_risk_after_trades', 0):.1f}"
        div_score_str = f"{ps.get('diversification_score', 0):.1f}"
        lines.append("*Portfolio Summary*")
        lines.append(f"Total risk after trades: {self._esc(total_risk_str)}%")
        lines.append(f"Diversification: {self._esc(div_score_str)}/10")
        if ps.get('correlation_warning'):
            lines.append("Correlation warning active")
        lines.append("")

        # Monte Carlo
        ruin_str = f"{mc.get('probability_of_ruin', 0):.2%}"
        max_dd_str = f"{mc.get('expected_max_drawdown', 0):.1f}"
        conf_str = f"{mc.get('confidence_95_return', 0):.1f}"
        lines.append("*Monte Carlo* \\(1000 sims\\)")
        lines.append(f"P\\(ruin\\): {self._esc(ruin_str)}")
        lines.append(f"Expected max DD: {self._esc(max_dd_str)}%")
        lines.append(f"95th pctl return: {self._esc(conf_str)}%")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Account Type System
    # ------------------------------------------------------------------

    @staticmethod
    def determine_account_type(balance: float) -> dict:
        """
        Determine the account type and associated risk parameters based
        on current balance.

        Args:
            balance: Current account balance in USD.

        Returns:
            dict with account_type, max_risk_pct, and max_positions.
        """
        for acct in ACCOUNT_TYPES:
            if acct['min_balance'] <= balance <= acct['max_balance']:
                return {
                    'account_type': acct['name'],
                    'max_risk_pct': acct['max_risk_pct'],
                    'max_positions': acct['max_positions'],
                }
        # Fallback (should never hit due to inf upper bound)
        return {
            'account_type': 'Micro',
            'max_risk_pct': 1.0,
            'max_positions': 2,
        }

    # ------------------------------------------------------------------
    # Drawdown Lockout System
    # ------------------------------------------------------------------

    @staticmethod
    def check_lockouts(account_state: 'AccountState') -> Optional[dict]:
        """
        Enforce drawdown-based lockout rules.  Returns the most severe
        lockout action triggered, or None if no lockout applies.

        Lockout thresholds (checked most-severe first):
            - Weekly DD >= 10%  -> halt_week
            - Daily  DD >=  5% -> halt_session
            - Weekly DD >=  7% -> reduce_size_50_week
            - Daily  DD >=  3% -> reduce_size_50

        Lockouts cannot be overridden without orchestrator approval.

        Args:
            account_state: Current AccountState instance.

        Returns:
            dict with 'action', 'reason', and 'requires_orchestrator_override'
            or None when no lockout is active.
        """
        daily_dd = account_state.daily_drawdown_pct
        weekly_dd = account_state.weekly_drawdown_pct

        # Check most severe first so the caller gets the right directive
        if weekly_dd >= 10:
            return {
                'action': 'halt_week',
                'reason': f'Weekly drawdown {weekly_dd:.2f}% hit 10% limit -- trading halted for the week',
                'requires_orchestrator_override': True,
            }
        if daily_dd >= 5:
            return {
                'action': 'halt_session',
                'reason': f'Daily drawdown {daily_dd:.2f}% hit 5% limit -- session halted',
                'requires_orchestrator_override': True,
            }
        if weekly_dd >= 7:
            return {
                'action': 'reduce_size_50_week',
                'reason': f'Weekly drawdown {weekly_dd:.2f}% hit 7% -- position sizes reduced 50% for the week',
                'requires_orchestrator_override': True,
            }
        if daily_dd >= 3:
            return {
                'action': 'reduce_size_50',
                'reason': f'Daily drawdown {daily_dd:.2f}% hit 3% -- position sizes reduced 50%',
                'requires_orchestrator_override': True,
            }

        return None

    # ------------------------------------------------------------------
    # Confluence-Scaled Risk
    # ------------------------------------------------------------------

    @staticmethod
    def scale_risk_by_confluence(base_risk_pct: float, confluence_score: float) -> dict:
        """
        Scale the base risk percentage according to the confluence score
        produced by the signal/strategy layer.

        Scaling rules:
            50-64  -> 50% of base risk
            65-74  -> 75% of base risk
            75-89  -> 100% of base risk
            90+    -> 100% of base risk, flagged for orchestrator approval

        Args:
            base_risk_pct: The unscaled risk percentage (e.g. 1.0 for 1%).
            confluence_score: Numeric score from 0-100.

        Returns:
            dict with scaled_risk_pct, scale_factor, and
            requires_orchestrator_approval flag.
        """
        if confluence_score >= 90:
            scale_factor = 1.0
            requires_approval = True
        elif confluence_score >= 75:
            scale_factor = 1.0
            requires_approval = False
        elif confluence_score >= 65:
            scale_factor = 0.75
            requires_approval = False
        elif confluence_score >= 50:
            scale_factor = 0.50
            requires_approval = False
        else:
            # Below 50 -- no trade should be taken
            scale_factor = 0.0
            requires_approval = False

        return {
            'scaled_risk_pct': round(base_risk_pct * scale_factor, 4),
            'scale_factor': scale_factor,
            'confluence_score': confluence_score,
            'requires_orchestrator_approval': requires_approval,
        }

    # ------------------------------------------------------------------
    # Enhanced Position Sizing (Futures support)
    # ------------------------------------------------------------------

    def calculate_position_size_futures(
        self,
        account_size: float,
        risk_pct: float,
        symbol: str,
        stop_loss_ticks: float,
        margin_per_contract: float = None,
    ) -> dict:
        """
        Calculate position size for futures contracts.

        Contracts = Dollar risk / (Stop loss in ticks x Tick value)
        Always rounds DOWN.  Rejects if required margin > 110% of account.

        Args:
            account_size: Current account balance in USD.
            risk_pct: Percentage of account to risk.
            symbol: Futures symbol (e.g. 'ES', 'NQ').
            stop_loss_ticks: Stop loss distance in ticks.
            margin_per_contract: Margin required per contract (optional).

        Returns:
            dict with contracts, dollar_risk, tick_value, and margin info.
        """
        try:
            spec = FUTURES_SPECS.get(symbol.upper())
            if spec is None:
                return {
                    'contracts': 0,
                    'dollar_risk': 0,
                    'tick_value': 0,
                    'error': f"Unknown futures symbol: {symbol}",
                }

            if stop_loss_ticks <= 0:
                return {
                    'contracts': 0,
                    'dollar_risk': 0,
                    'tick_value': spec['tick_value'],
                    'error': 'stop_loss_ticks must be > 0',
                }

            tick_value = spec['tick_value']
            dollar_risk = account_size * (risk_pct / 100.0)
            raw_contracts = dollar_risk / (stop_loss_ticks * tick_value)
            contracts = math.floor(raw_contracts)

            # Margin check
            margin_ok = True
            margin_warning = None
            if margin_per_contract is not None and margin_per_contract > 0:
                required_margin = contracts * margin_per_contract
                margin_limit = account_size * 1.10  # 110% of account
                if required_margin > margin_limit:
                    margin_ok = False
                    margin_warning = (
                        f"Required margin ${required_margin:,.2f} exceeds "
                        f"110% of account (${margin_limit:,.2f})"
                    )
                    # Reduce contracts until within margin
                    while contracts > 0 and (contracts * margin_per_contract) > margin_limit:
                        contracts -= 1

            return {
                'contracts': contracts,
                'dollar_risk': round(dollar_risk, 2),
                'tick_value': tick_value,
                'stop_loss_ticks': stop_loss_ticks,
                'risk_per_contract': round(stop_loss_ticks * tick_value, 2),
                'total_risk': round(contracts * stop_loss_ticks * tick_value, 2),
                'margin_ok': margin_ok,
                'margin_warning': margin_warning,
                'symbol': symbol.upper(),
            }
        except Exception as exc:
            logger.error("Futures position sizing error: %s", exc)
            return {
                'contracts': 0,
                'dollar_risk': 0,
                'tick_value': 0,
                'error': str(exc),
            }

    def calculate_position_size_forex(
        self,
        account_size: float,
        risk_pct: float,
        stop_loss_pips: float,
        pip_value: float = 10.0,
        margin_per_lot: float = None,
    ) -> dict:
        """
        Calculate forex position size using pip-based math.

        Lot size = Dollar risk / (Stop loss in pips x Pip value)
        Always rounds DOWN to nearest micro-lot (0.01).

        Args:
            account_size: Current account balance in USD.
            risk_pct: Percentage of account to risk.
            stop_loss_pips: Stop distance in pips.
            pip_value: Value per pip per standard lot (default $10 for most USD pairs).
            margin_per_lot: Margin required per standard lot (optional).

        Returns:
            dict with lot_size, dollar_risk, pip info, and margin check.
        """
        try:
            if stop_loss_pips <= 0:
                return {
                    'lot_size': 0.0,
                    'dollar_risk': 0,
                    'error': 'stop_loss_pips must be > 0',
                }

            dollar_risk = account_size * (risk_pct / 100.0)
            raw_lots = dollar_risk / (stop_loss_pips * pip_value)
            lot_size = math.floor(raw_lots * 100) / 100.0  # round down to 0.01

            margin_ok = True
            margin_warning = None
            if margin_per_lot is not None and margin_per_lot > 0:
                required_margin = lot_size * margin_per_lot
                margin_limit = account_size * 1.10
                if required_margin > margin_limit:
                    margin_ok = False
                    margin_warning = (
                        f"Required margin ${required_margin:,.2f} exceeds "
                        f"110% of account (${margin_limit:,.2f})"
                    )
                    while lot_size > 0 and (lot_size * margin_per_lot) > margin_limit:
                        lot_size = round(lot_size - 0.01, 2)

            return {
                'lot_size': lot_size,
                'dollar_risk': round(dollar_risk, 2),
                'stop_loss_pips': stop_loss_pips,
                'pip_value': pip_value,
                'total_risk': round(lot_size * stop_loss_pips * pip_value, 2),
                'margin_ok': margin_ok,
                'margin_warning': margin_warning,
            }
        except Exception as exc:
            logger.error("Forex position sizing error: %s", exc)
            return {
                'lot_size': 0.0,
                'dollar_risk': 0,
                'error': str(exc),
            }

    # ------------------------------------------------------------------
    # Full Trade Validation Gate
    # ------------------------------------------------------------------

    def validate_trade_full(
        self,
        trade_idea: dict,
        account_state: 'AccountState' = None,
        open_positions: List[dict] = None,
        correlation_data: Dict[str, Dict[str, float]] = None,
    ) -> dict:
        """
        Comprehensive trade validation gate that checks ALL risk rules:

        1. Account type risk limits respected
        2. Drawdown lockouts not triggered
        3. Confluence score >= 50
        4. Risk scaled by confluence
        5. Position size within margin limits
        6. Max positions not exceeded
        7. Consecutive loss adjustment applied

        Returns:
            dict with verdict (APPROVED / MODIFIED / VETOED),
            reasons, position_size, dollar_risk, risk_reward,
            modifications, and lockout info.
        """
        account_state = account_state or self.account_state
        open_positions = open_positions or []
        reasons: List[str] = []
        modifications: Dict = {}
        verdict = 'APPROVED'

        try:
            pair = trade_idea.get('pair', 'UNKNOWN')
            entry = trade_idea.get('entry', 0)
            stop_loss = trade_idea.get('stop_loss', 0)
            take_profit = trade_idea.get('take_profit', 0)
            direction = trade_idea.get('direction', 'LONG')
            confidence = trade_idea.get('confidence', 'MEDIUM')
            confluence_score = trade_idea.get('confluence_score', 0)

            balance = account_state.current_balance

            # --- 1. Account type risk limits ---
            acct_info = self.determine_account_type(balance)
            max_risk_pct = acct_info['max_risk_pct']
            max_positions = acct_info['max_positions']

            # --- 2. Drawdown lockouts ---
            lockout = self.check_lockouts(account_state)
            if lockout is not None:
                action = lockout['action']
                if action in ('halt_session', 'halt_week'):
                    return {
                        'pair': pair,
                        'direction': direction,
                        'original_confidence': confidence,
                        'verdict': 'VETOED',
                        'position_size': 0,
                        'dollar_risk': 0,
                        'risk_reward': 0,
                        'reasons': [lockout['reason']],
                        'modifications': None,
                        'lockout': lockout,
                        'account_type': acct_info['account_type'],
                    }
                elif action in ('reduce_size_50', 'reduce_size_50_week'):
                    # Halve the allowed risk
                    max_risk_pct *= 0.5
                    verdict = 'MODIFIED'
                    modifications['lockout_risk_reduction'] = lockout['reason']
                    reasons.append(lockout['reason'])

            # --- 3. Confluence score >= 50 ---
            if confluence_score < 50:
                return {
                    'pair': pair,
                    'direction': direction,
                    'original_confidence': confidence,
                    'verdict': 'VETOED',
                    'position_size': 0,
                    'dollar_risk': 0,
                    'risk_reward': 0,
                    'reasons': [f'Confluence score {confluence_score} below minimum 50'],
                    'modifications': None,
                    'lockout': lockout,
                    'account_type': acct_info['account_type'],
                }

            # --- 4. Scale risk by confluence ---
            conf_risk = self._confidence_to_risk_pct(confidence)
            base_risk_pct = min(conf_risk, max_risk_pct)
            scaled = self.scale_risk_by_confluence(base_risk_pct, confluence_score)
            effective_risk_pct = scaled['scaled_risk_pct']

            if scaled['requires_orchestrator_approval']:
                modifications['requires_orchestrator_approval'] = True
                reasons.append(
                    f'Confluence {confluence_score} >= 90 -- requires orchestrator approval'
                )

            # --- 7. Consecutive loss adjustment ---
            effective_risk_pct *= account_state.risk_multiplier
            if account_state.risk_multiplier < 1.0:
                if verdict == 'APPROVED':
                    verdict = 'MODIFIED'
                modifications['consecutive_loss_adjustment'] = (
                    f'Risk reduced to {account_state.risk_multiplier:.0%} '
                    f'after {account_state.consecutive_losses} consecutive losses'
                )
                reasons.append(modifications['consecutive_loss_adjustment'])

            # --- Risk:Reward ratio ---
            risk_distance = abs(entry - stop_loss)
            reward_distance = abs(take_profit - entry)

            if risk_distance == 0:
                return {
                    'pair': pair,
                    'direction': direction,
                    'original_confidence': confidence,
                    'verdict': 'VETOED',
                    'position_size': 0,
                    'dollar_risk': 0,
                    'risk_reward': 0,
                    'reasons': ['Invalid entry/stop_loss -- zero risk distance'],
                    'modifications': None,
                    'lockout': lockout,
                    'account_type': acct_info['account_type'],
                }

            risk_reward = reward_distance / risk_distance
            if risk_reward < self.config['min_risk_reward']:
                return {
                    'pair': pair,
                    'direction': direction,
                    'original_confidence': confidence,
                    'verdict': 'VETOED',
                    'position_size': 0,
                    'dollar_risk': 0,
                    'risk_reward': round(risk_reward, 2),
                    'reasons': [
                        f"RR {risk_reward:.2f} below minimum {self.config['min_risk_reward']}"
                    ],
                    'modifications': None,
                    'lockout': lockout,
                    'account_type': acct_info['account_type'],
                }

            # --- 5. Position sizing (forex vs futures) ---
            futures_symbol = trade_idea.get('futures_symbol')
            if futures_symbol:
                stop_loss_ticks = trade_idea.get('stop_loss_ticks', 0)
                margin_per_contract = trade_idea.get('margin_per_contract')
                sizing = self.calculate_position_size_futures(
                    balance, effective_risk_pct, futures_symbol,
                    stop_loss_ticks, margin_per_contract,
                )
                position_size = sizing.get('contracts', 0)
                if not sizing.get('margin_ok', True):
                    if verdict == 'APPROVED':
                        verdict = 'MODIFIED'
                    modifications['margin_warning'] = sizing.get('margin_warning', '')
                    reasons.append(sizing.get('margin_warning', 'Margin limit exceeded'))
            else:
                sizing = self.calculate_position_size(
                    balance, effective_risk_pct, entry, stop_loss,
                    atr=trade_idea.get('atr'),
                )
                position_size = sizing.get('position_size_units', 0)

            dollar_risk = sizing.get('dollar_risk', 0)

            if sizing.get('error'):
                return {
                    'pair': pair,
                    'direction': direction,
                    'original_confidence': confidence,
                    'verdict': 'VETOED',
                    'position_size': 0,
                    'dollar_risk': 0,
                    'risk_reward': round(risk_reward, 2),
                    'reasons': [f"Sizing error: {sizing['error']}"],
                    'modifications': None,
                    'lockout': lockout,
                    'account_type': acct_info['account_type'],
                }

            # --- 6. Max positions not exceeded ---
            current_open = account_state.open_positions
            if current_open >= max_positions:
                return {
                    'pair': pair,
                    'direction': direction,
                    'original_confidence': confidence,
                    'verdict': 'VETOED',
                    'position_size': 0,
                    'dollar_risk': 0,
                    'risk_reward': round(risk_reward, 2),
                    'reasons': [
                        f"Max positions ({max_positions}) for "
                        f"{acct_info['account_type']} account reached "
                        f"({current_open} open)"
                    ],
                    'modifications': None,
                    'lockout': lockout,
                    'account_type': acct_info['account_type'],
                }

            # --- Portfolio risk check (reuse existing method) ---
            portfolio = self.assess_portfolio_risk(open_positions, correlation_data)
            projected_total = portfolio['total_risk_pct'] + effective_risk_pct
            if projected_total > self.config['max_portfolio_risk_pct']:
                available_risk = self.config['max_portfolio_risk_pct'] - portfolio['total_risk_pct']
                if available_risk > 0.2:
                    if verdict == 'APPROVED':
                        verdict = 'MODIFIED'
                    effective_risk_pct = available_risk
                    modifications['risk_pct_reduced'] = round(effective_risk_pct, 2)
                    reasons.append(
                        f"Risk reduced to {effective_risk_pct:.2f}% to stay within portfolio limit"
                    )
                    # Recalculate sizing with reduced risk
                    if futures_symbol:
                        sizing = self.calculate_position_size_futures(
                            balance, effective_risk_pct, futures_symbol,
                            trade_idea.get('stop_loss_ticks', 0),
                            trade_idea.get('margin_per_contract'),
                        )
                        position_size = sizing.get('contracts', 0)
                    else:
                        sizing = self.calculate_position_size(
                            balance, effective_risk_pct, entry, stop_loss,
                            atr=trade_idea.get('atr'),
                        )
                        position_size = sizing.get('position_size_units', 0)
                    dollar_risk = sizing.get('dollar_risk', 0)
                else:
                    return {
                        'pair': pair,
                        'direction': direction,
                        'original_confidence': confidence,
                        'verdict': 'VETOED',
                        'position_size': 0,
                        'dollar_risk': 0,
                        'risk_reward': round(risk_reward, 2),
                        'reasons': [
                            f"Portfolio risk {projected_total:.1f}% would exceed "
                            f"max {self.config['max_portfolio_risk_pct']}%"
                        ],
                        'modifications': None,
                        'lockout': lockout,
                        'account_type': acct_info['account_type'],
                    }

            if verdict == 'APPROVED' and not reasons:
                reasons.append('All risk checks passed')

            return {
                'pair': pair,
                'direction': direction,
                'original_confidence': confidence,
                'verdict': verdict,
                'position_size': position_size,
                'dollar_risk': round(dollar_risk, 2),
                'risk_reward': round(risk_reward, 2),
                'effective_risk_pct': round(effective_risk_pct, 4),
                'confluence_score': confluence_score,
                'reasons': reasons,
                'modifications': modifications if modifications else None,
                'lockout': lockout,
                'account_type': acct_info['account_type'],
            }
        except Exception as exc:
            logger.error("Full trade validation error for %s: %s", trade_idea.get('pair'), exc)
            return {
                'pair': trade_idea.get('pair', 'UNKNOWN'),
                'direction': trade_idea.get('direction', ''),
                'original_confidence': trade_idea.get('confidence', ''),
                'verdict': 'VETOED',
                'position_size': 0,
                'dollar_risk': 0,
                'risk_reward': 0,
                'reasons': [f'Validation error: {exc}'],
                'modifications': None,
                'lockout': None,
                'account_type': 'Unknown',
            }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _esc(text: str) -> str:
        """Escape special characters for Telegram MarkdownV2."""
        special = r'_*[]()~`>#+-=|{}.!'
        escaped = []
        for ch in str(text):
            if ch in special:
                escaped.append(f'\\{ch}')
            else:
                escaped.append(ch)
        return ''.join(escaped)

    def _confidence_to_risk_pct(self, confidence: str) -> float:
        """Map trade confidence to risk percentage."""
        mapping = {
            'HIGH': self.config['max_risk_per_trade_pct'],
            'MEDIUM': self.config['max_risk_per_trade_pct'] * 0.7,
            'LOW': self.config['max_risk_per_trade_pct'] * 0.4,
        }
        return mapping.get(str(confidence).upper(), self.config['max_risk_per_trade_pct'] * 0.5)

    @staticmethod
    def _tighten_stop(entry: float, stop_loss: float, direction: str, factor: float) -> float:
        """Tighten the stop loss by *factor* (0-1) of original distance."""
        distance = abs(entry - stop_loss)
        tightened_distance = distance * factor
        if direction.upper() == 'LONG':
            return entry - tightened_distance
        return entry + tightened_distance


# ======================================================================
# Standalone demo
# ======================================================================

if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    )

    strange = DoctorStrange(account_size=10000)

    # Sample trade ideas (as if from BlackWidow)
    sample_ideas = [
        {
            'pair': 'BTCUSD',
            'direction': 'LONG',
            'entry': 80000,
            'stop_loss': 79000,
            'take_profit': 82500,
            'confidence': 'HIGH',
            'atr': 650,
        },
        {
            'pair': 'ETHUSD',
            'direction': 'LONG',
            'entry': 3200,
            'stop_loss': 3100,
            'take_profit': 3450,
            'confidence': 'MEDIUM',
        },
        {
            'pair': 'EURUSD',
            'direction': 'SHORT',
            'entry': 1.0850,
            'stop_loss': 1.0900,
            'take_profit': 1.0750,
            'confidence': 'LOW',
        },
    ]

    # Existing open positions
    existing_positions = [
        {'pair': 'SOLUSD', 'risk_pct': 0.8, 'direction': 'LONG'},
        {'pair': 'XRPUSD', 'risk_pct': 0.5, 'direction': 'LONG'},
    ]

    # Correlation data
    correlations = {
        'BTCUSD': {'ETHUSD': 0.85, 'SOLUSD': 0.78},
        'ETHUSD': {'SOLUSD': 0.72},
    }

    result = strange.analyze(
        trade_ideas=sample_ideas,
        account_size=10000,
        open_positions=existing_positions,
        correlation_data=correlations,
    )

    report = strange.format_report(result)
    print(report)
    print("\n--- Raw Result ---")
    import json
    print(json.dumps(result, indent=2, default=str))
