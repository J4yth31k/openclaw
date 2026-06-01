"""
Hulk (Bruce Banner) - Backtesting Agent for Forex/Crypto Scalper Bot

Hulk SMASH through the data! ...and Bruce crunches the numbers.

Tests trading strategies against historical data, calculates performance metrics,
runs parameter optimization, and performs walk-forward analysis.
Uses yfinance for historical OHLCV data across crypto and forex pairs.
"""

import logging
import warnings
from datetime import datetime
from itertools import product
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

# Suppress yfinance warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('hulk')

PERSONA = "Hulk SMASH through the data! ...and Bruce crunches the numbers."

# Pair mapping (same as IronMan)
PAIRS = {
    'BTCUSD': 'BTC-USD',
    'ETHUSD': 'ETH-USD',
    'SOLUSD': 'SOL-USD',
    'EURUSD': 'EURUSD=X',
    'XAUUSD': 'GC=F',
    'USDCAD': 'USDCAD=X',
}

DEFAULT_PAIRS = list(PAIRS.keys())


class Hulk:
    """Bruce Banner's backtesting engine. Smashes through historical data to validate strategies."""

    def __init__(self, initial_balance: float = 10000.0):
        self.initial_balance = initial_balance
        self.data_cache: Dict[str, pd.DataFrame] = {}

    # ------------------------------------------------------------------
    # Data fetching
    # ------------------------------------------------------------------

    def fetch_historical_data(
        self, symbol: str, period: str = '2y', interval: str = '1d'
    ) -> Optional[pd.DataFrame]:
        """
        Get historical OHLCV data via yfinance with MultiIndex fix.

        Args:
            symbol: Friendly pair name (e.g. 'BTCUSD') or yfinance ticker.
            period: yfinance period string (default '2y').
            interval: yfinance interval string (default '1d').

        Returns:
            DataFrame with lowercase OHLCV columns, or None on failure.
        """
        ticker = PAIRS.get(symbol, symbol)
        cache_key = f"{ticker}_{period}_{interval}"

        if cache_key in self.data_cache:
            return self.data_cache[cache_key]

        try:
            logger.info(f"Hulk fetching {ticker} ({period}, {interval})...")
            df = yf.download(ticker, period=period, interval=interval, progress=False)

            if df.empty:
                logger.warning(f"No data returned for {ticker}")
                return None

            # yfinance >=1.3.0 returns MultiIndex columns — flatten them
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [col[0] for col in df.columns]
            df.columns = [str(c).lower() for c in df.columns]

            self.data_cache[cache_key] = df
            logger.info(f"Fetched {len(df)} bars for {ticker}")
            return df

        except Exception as e:
            logger.error(f"Error fetching {ticker}: {e}")
            return None

    # ------------------------------------------------------------------
    # Indicator helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ema(series: pd.Series, period: int) -> pd.Series:
        return series.ewm(span=period, adjust=False).mean()

    @staticmethod
    def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
        delta = series.diff()
        gain = delta.where(delta > 0, 0).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))

    @staticmethod
    def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
        ema_fast = series.ewm(span=fast, adjust=False).mean()
        ema_slow = series.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        return macd_line, signal_line, histogram

    @staticmethod
    def _bollinger(series: pd.Series, period: int = 20, std_mult: float = 2.0):
        mid = series.rolling(window=period).mean()
        std = series.rolling(window=period).std()
        upper = mid + std_mult * std
        lower = mid - std_mult * std
        return upper, mid, lower

    # ------------------------------------------------------------------
    # Core backtester
    # ------------------------------------------------------------------

    def backtest_strategy(
        self,
        data: pd.DataFrame,
        strategy_fn: Callable[[pd.DataFrame, Optional[Dict]], pd.DataFrame],
        params: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Core backtester. Runs a strategy function on historical data and simulates trades.

        Args:
            data: DataFrame with OHLCV columns.
            strategy_fn: Function(data, params) -> DataFrame with 'signal' column
                         (1=buy, -1=sell, 0=hold).
            params: Optional parameter dict passed to strategy_fn.

        Returns:
            Dict with 'trades' list and 'equity_curve' Series.
        """
        if data is None or data.empty:
            logger.warning("Hulk got empty data — nothing to smash!")
            return {'trades': [], 'equity_curve': pd.Series(dtype=float)}

        try:
            signals = strategy_fn(data.copy(), params)
        except Exception as e:
            logger.error(f"Strategy function failed: {e}")
            return {'trades': [], 'equity_curve': pd.Series(dtype=float)}

        if 'signal' not in signals.columns:
            logger.error("Strategy did not produce a 'signal' column")
            return {'trades': [], 'equity_curve': pd.Series(dtype=float)}

        trades: List[Dict] = []
        equity = self.initial_balance
        equity_curve = []
        position_open = False
        entry_price = 0.0
        entry_idx = None
        entry_date = None

        close_col = 'close' if 'close' in data.columns else data.columns[3]
        close_prices = data[close_col].values
        signal_values = signals['signal'].values
        dates = data.index

        for i in range(len(data)):
            sig = signal_values[i]
            price = close_prices[i]

            if np.isnan(price) or np.isnan(sig):
                equity_curve.append(equity)
                continue

            if not position_open and sig == 1:
                # Open long
                position_open = True
                entry_price = price
                entry_idx = i
                entry_date = dates[i]

            elif position_open and sig == -1:
                # Close long
                pnl_pct = (price - entry_price) / entry_price
                pnl_dollar = equity * pnl_pct
                equity += pnl_dollar
                trades.append({
                    'entry_date': str(entry_date),
                    'exit_date': str(dates[i]),
                    'entry_price': round(float(entry_price), 6),
                    'exit_price': round(float(price), 6),
                    'pnl_pct': round(float(pnl_pct * 100), 4),
                    'pnl_dollar': round(float(pnl_dollar), 2),
                    'holding_bars': i - entry_idx,
                })
                position_open = False

            equity_curve.append(equity)

        return {
            'trades': trades,
            'equity_curve': pd.Series(equity_curve, index=data.index[:len(equity_curve)]),
        }

    # ------------------------------------------------------------------
    # Performance metrics
    # ------------------------------------------------------------------

    def calculate_metrics(
        self, trades: List[Dict], initial_balance: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Full performance suite from a list of trade dicts.

        Returns dict with: total_return_pct, win_rate, avg_win, avg_loss,
        profit_factor, sharpe_ratio, sortino_ratio, max_drawdown_pct,
        max_drawdown_duration, calmar_ratio, total_trades, avg_holding_period,
        expectancy.
        """
        bal = initial_balance or self.initial_balance

        if not trades:
            return self._empty_metrics()

        pnls = [t['pnl_pct'] for t in trades]
        pnl_dollars = [t['pnl_dollar'] for t in trades]
        holdings = [t['holding_bars'] for t in trades]

        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]

        total_return_pct = ((bal + sum(pnl_dollars)) / bal - 1) * 100
        win_rate = len(wins) / len(pnls) if pnls else 0
        avg_win = float(np.mean(wins)) if wins else 0.0
        avg_loss = float(np.mean(losses)) if losses else 0.0

        gross_profit = sum(d for d in pnl_dollars if d > 0)
        gross_loss = abs(sum(d for d in pnl_dollars if d < 0))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf') if gross_profit > 0 else 0.0

        # Sharpe and Sortino (annualized, assuming daily bars ~252 trading days)
        pnl_arr = np.array(pnls)
        mean_ret = np.mean(pnl_arr)
        std_ret = np.std(pnl_arr, ddof=1) if len(pnl_arr) > 1 else 0
        sharpe_ratio = (mean_ret / std_ret) * np.sqrt(252) if std_ret > 0 else 0.0

        downside = pnl_arr[pnl_arr < 0]
        downside_std = np.std(downside, ddof=1) if len(downside) > 1 else 0
        sortino_ratio = (mean_ret / downside_std) * np.sqrt(252) if downside_std > 0 else 0.0

        # Max drawdown from equity curve built from trade PnLs
        equity_curve = [bal]
        for d in pnl_dollars:
            equity_curve.append(equity_curve[-1] + d)
        equity_arr = np.array(equity_curve)
        peak = np.maximum.accumulate(equity_arr)
        drawdowns = (equity_arr - peak) / peak * 100
        max_drawdown_pct = float(abs(np.min(drawdowns)))

        # Max drawdown duration (in trades)
        max_dd_dur = 0
        cur_dur = 0
        for i in range(1, len(equity_arr)):
            if equity_arr[i] < peak[i]:
                cur_dur += 1
                max_dd_dur = max(max_dd_dur, cur_dur)
            else:
                cur_dur = 0

        calmar_ratio = total_return_pct / max_drawdown_pct if max_drawdown_pct > 0 else 0.0

        expectancy = float(np.mean(pnl_dollars)) if pnl_dollars else 0.0
        avg_holding = float(np.mean(holdings)) if holdings else 0.0

        return {
            'total_return_pct': round(total_return_pct, 2),
            'win_rate': round(win_rate, 4),
            'avg_win': round(avg_win, 4),
            'avg_loss': round(avg_loss, 4),
            'profit_factor': round(profit_factor, 4),
            'sharpe_ratio': round(float(sharpe_ratio), 4),
            'sortino_ratio': round(float(sortino_ratio), 4),
            'max_drawdown_pct': round(max_drawdown_pct, 2),
            'max_drawdown_duration': int(max_dd_dur),
            'calmar_ratio': round(float(calmar_ratio), 4),
            'total_trades': len(trades),
            'avg_holding_period': round(avg_holding, 1),
            'expectancy': round(expectancy, 2),
        }

    @staticmethod
    def _empty_metrics() -> Dict[str, Any]:
        return {
            'total_return_pct': 0.0,
            'win_rate': 0.0,
            'avg_win': 0.0,
            'avg_loss': 0.0,
            'profit_factor': 0.0,
            'sharpe_ratio': 0.0,
            'sortino_ratio': 0.0,
            'max_drawdown_pct': 0.0,
            'max_drawdown_duration': 0,
            'calmar_ratio': 0.0,
            'total_trades': 0,
            'avg_holding_period': 0.0,
            'expectancy': 0.0,
        }

    # ------------------------------------------------------------------
    # Built-in strategies
    # ------------------------------------------------------------------

    def ema_crossover_strategy(self, data: pd.DataFrame, params: Optional[Dict] = None) -> pd.DataFrame:
        """
        EMA crossover with RSI filter.

        Buy when fast EMA crosses above slow EMA AND RSI < overbought.
        Sell when fast EMA crosses below slow EMA AND RSI > oversold.

        Params: fast_period, slow_period, rsi_period, rsi_overbought, rsi_oversold.
        """
        p = params or {}
        fast = p.get('fast_period', 9)
        slow = p.get('slow_period', 21)
        rsi_period = p.get('rsi_period', 14)
        rsi_ob = p.get('rsi_overbought', 70)
        rsi_os = p.get('rsi_oversold', 30)

        close = data['close']
        ema_fast = self._ema(close, fast)
        ema_slow = self._ema(close, slow)
        rsi = self._rsi(close, rsi_period)

        signals = pd.DataFrame(index=data.index)
        signals['signal'] = 0

        # Crossover detection
        cross_above = (ema_fast > ema_slow) & (ema_fast.shift(1) <= ema_slow.shift(1))
        cross_below = (ema_fast < ema_slow) & (ema_fast.shift(1) >= ema_slow.shift(1))

        signals.loc[cross_above & (rsi < rsi_ob), 'signal'] = 1
        signals.loc[cross_below & (rsi > rsi_os), 'signal'] = -1

        return signals

    def confluence_strategy(self, data: pd.DataFrame, params: Optional[Dict] = None) -> pd.DataFrame:
        """
        Avengers confluence strategy. Combines EMA alignment, RSI, MACD crossover,
        Bollinger position. Scores confluence and enters when score >= threshold.

        Params: ema_fast, ema_slow, rsi_period, rsi_ob, rsi_os,
                macd_fast, macd_slow, macd_signal, bb_period, bb_std,
                entry_threshold, exit_threshold.
        """
        p = params or {}
        ema_fast_p = p.get('ema_fast', 9)
        ema_slow_p = p.get('ema_slow', 21)
        rsi_period = p.get('rsi_period', 14)
        rsi_ob = p.get('rsi_ob', 70)
        rsi_os = p.get('rsi_os', 30)
        macd_fast = p.get('macd_fast', 12)
        macd_slow = p.get('macd_slow', 26)
        macd_sig = p.get('macd_signal', 9)
        bb_period = p.get('bb_period', 20)
        bb_std = p.get('bb_std', 2.0)
        entry_thresh = p.get('entry_threshold', 3)
        exit_thresh = p.get('exit_threshold', -2)

        close = data['close']

        # Indicators
        ema_f = self._ema(close, ema_fast_p)
        ema_s = self._ema(close, ema_slow_p)
        rsi = self._rsi(close, rsi_period)
        macd_line, macd_signal_line, macd_hist = self._macd(close, macd_fast, macd_slow, macd_sig)
        bb_upper, bb_mid, bb_lower = self._bollinger(close, bb_period, bb_std)

        # Confluence scoring
        score = pd.Series(0.0, index=data.index)

        # EMA alignment: +1 bullish, -1 bearish
        score += np.where(ema_f > ema_s, 1, -1)

        # RSI: +1 if oversold zone (bullish), -1 if overbought (bearish), 0 neutral
        score += np.where(rsi < rsi_os, 1, np.where(rsi > rsi_ob, -1, 0))

        # MACD crossover: +1 if histogram positive & rising, -1 if negative & falling
        macd_rising = macd_hist > macd_hist.shift(1)
        score += np.where((macd_hist > 0) & macd_rising, 1, np.where((macd_hist < 0) & ~macd_rising, -1, 0))

        # Bollinger position: +1 near lower band (bounce), -1 near upper band
        bb_range = bb_upper - bb_lower
        bb_pos = np.where(bb_range > 0, (close - bb_lower) / bb_range, 0.5)
        score += np.where(bb_pos < 0.2, 1, np.where(bb_pos > 0.8, -1, 0))

        # Generate signals
        signals = pd.DataFrame(index=data.index)
        signals['signal'] = 0

        in_position = False
        sig_arr = signals['signal'].values
        score_arr = score.values

        for i in range(len(data)):
            if np.isnan(score_arr[i]):
                continue
            if not in_position and score_arr[i] >= entry_thresh:
                sig_arr[i] = 1
                in_position = True
            elif in_position and score_arr[i] <= exit_thresh:
                sig_arr[i] = -1
                in_position = False

        signals['signal'] = sig_arr
        return signals

    # ------------------------------------------------------------------
    # Parameter optimization
    # ------------------------------------------------------------------

    def optimize_parameters(
        self,
        data: pd.DataFrame,
        strategy_fn: Callable,
        param_grid: Dict[str, List],
        rank_by: str = 'sharpe_ratio',
        top_n: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Grid search over parameter combinations.

        Args:
            data: Historical OHLCV DataFrame.
            strategy_fn: Strategy function to test.
            param_grid: Dict mapping param names to lists of values.
            rank_by: Metric to rank results by (default 'sharpe_ratio').
            top_n: Number of top results to return.

        Returns:
            List of top_n dicts with 'params' and 'metrics' keys.
        """
        if not param_grid:
            logger.warning("Empty param_grid — nothing to optimize")
            return []

        keys = list(param_grid.keys())
        values = list(param_grid.values())
        combos = list(product(*values))
        total = len(combos)

        logger.info(f"Hulk SMASHING through {total} parameter combinations...")

        results = []
        for idx, combo in enumerate(combos):
            params = dict(zip(keys, combo))
            try:
                bt = self.backtest_strategy(data, strategy_fn, params)
                metrics = self.calculate_metrics(bt['trades'])
                results.append({'params': params, 'metrics': metrics})
            except Exception as e:
                logger.debug(f"Combo {idx+1}/{total} failed: {e}")
                continue

            if (idx + 1) % max(1, total // 10) == 0:
                logger.info(f"Progress: {idx+1}/{total} combinations tested")

        if not results:
            logger.warning("No valid results from optimization")
            return []

        # Sort by chosen metric descending
        results.sort(key=lambda r: r['metrics'].get(rank_by, 0), reverse=True)
        top = results[:top_n]

        if total > 50:
            logger.warning(
                "BRUCE BANNER WARNING: Large parameter space tested. "
                "Results may be overfit — always validate with walk-forward analysis."
            )

        return top

    # ------------------------------------------------------------------
    # Walk-forward analysis
    # ------------------------------------------------------------------

    def walk_forward_analysis(
        self,
        data: pd.DataFrame,
        strategy_fn: Callable,
        params: Dict,
        train_pct: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Walk-forward validation: train/test split.

        Args:
            data: Full historical DataFrame.
            strategy_fn: Strategy function.
            params: Parameter dict to test.
            train_pct: Fraction of data for training (default 0.7).

        Returns:
            Dict with in_sample and out_of_sample metrics plus robustness_score.
        """
        if data is None or data.empty:
            return {'error': 'No data for walk-forward analysis'}

        split_idx = int(len(data) * train_pct)
        if split_idx < 30 or (len(data) - split_idx) < 10:
            return {'error': 'Insufficient data for meaningful train/test split'}

        train_data = data.iloc[:split_idx]
        test_data = data.iloc[split_idx:]

        logger.info(
            f"Walk-forward: train={len(train_data)} bars, test={len(test_data)} bars"
        )

        # In-sample
        bt_train = self.backtest_strategy(train_data, strategy_fn, params)
        metrics_train = self.calculate_metrics(bt_train['trades'])

        # Out-of-sample
        bt_test = self.backtest_strategy(test_data, strategy_fn, params)
        metrics_test = self.calculate_metrics(bt_test['trades'])

        # Robustness score: ratio of out-of-sample to in-sample Sharpe
        is_sharpe = metrics_train.get('sharpe_ratio', 0)
        oos_sharpe = metrics_test.get('sharpe_ratio', 0)

        if is_sharpe > 0:
            robustness = min(oos_sharpe / is_sharpe, 2.0)  # Cap at 2.0
        elif is_sharpe == 0 and oos_sharpe >= 0:
            robustness = 0.0
        else:
            robustness = 0.0

        return {
            'in_sample_sharpe': round(float(is_sharpe), 4),
            'out_of_sample_sharpe': round(float(oos_sharpe), 4),
            'robustness_score': round(float(robustness), 4),
            'in_sample_metrics': metrics_train,
            'out_of_sample_metrics': metrics_test,
            'train_bars': len(train_data),
            'test_bars': len(test_data),
        }

    # ------------------------------------------------------------------
    # Main analysis
    # ------------------------------------------------------------------

    def analyze(
        self,
        pairs: Optional[List[str]] = None,
        strategies: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Main analysis entry point. Backtests strategies on specified pairs.

        Args:
            pairs: List of pair names (defaults to all DEFAULT_PAIRS).
            strategies: List of strategy names to run.
                        Supported: 'ema_crossover', 'confluence'.
                        Defaults to both.

        Returns:
            Structured dict with status, backtest_results, ranking, summary.
        """
        pairs = pairs or DEFAULT_PAIRS
        strategies = strategies or ['ema_crossover', 'confluence']

        strategy_map = {
            'ema_crossover': (
                self.ema_crossover_strategy,
                {
                    'fast_period': [8, 9, 12],
                    'slow_period': [21, 26],
                    'rsi_period': [14],
                    'rsi_overbought': [70],
                    'rsi_oversold': [30],
                },
            ),
            'confluence': (
                self.confluence_strategy,
                {
                    'ema_fast': [9],
                    'ema_slow': [21],
                    'rsi_period': [14],
                    'entry_threshold': [2, 3],
                    'exit_threshold': [-2, -3],
                },
            ),
        }

        backtest_results: Dict[str, Dict] = {}
        all_rankings: List[Dict] = []
        total_strategies_tested = 0

        for pair in pairs:
            logger.info(f"=== Hulk smashing {pair} ===")
            data = self.fetch_historical_data(pair)
            if data is None:
                logger.warning(f"Skipping {pair} — no data")
                continue

            pair_results: Dict[str, Dict] = {}

            for strat_name in strategies:
                if strat_name not in strategy_map:
                    logger.warning(f"Unknown strategy: {strat_name}")
                    continue

                strat_fn, default_grid = strategy_map[strat_name]
                logger.info(f"Testing {strat_name} on {pair}...")

                # Optimize parameters
                top_params = self.optimize_parameters(data, strat_fn, default_grid)
                if not top_params:
                    pair_results[strat_name] = {
                        'metrics': self._empty_metrics(),
                        'best_params': {},
                        'walk_forward': {'error': 'No valid parameter sets found'},
                    }
                    continue

                best = top_params[0]
                best_params = best['params']
                best_metrics = best['metrics']

                # Walk-forward validation
                wf = self.walk_forward_analysis(data, strat_fn, best_params)

                pair_results[strat_name] = {
                    'metrics': best_metrics,
                    'best_params': best_params,
                    'walk_forward': {
                        'in_sample_sharpe': wf.get('in_sample_sharpe', 0),
                        'out_of_sample_sharpe': wf.get('out_of_sample_sharpe', 0),
                        'robustness_score': wf.get('robustness_score', 0),
                    },
                }

                all_rankings.append({
                    'pair': pair,
                    'strategy': strat_name,
                    'sharpe': best_metrics.get('sharpe_ratio', 0),
                })
                total_strategies_tested += 1

            backtest_results[pair] = pair_results

        # Sort rankings by Sharpe descending
        all_rankings.sort(key=lambda r: r['sharpe'], reverse=True)

        summary = (
            f"Hulk tested {total_strategies_tested} strategy/pair combinations "
            f"across {len(backtest_results)} pairs. "
            f"Top performer: {all_rankings[0]['pair']}/{all_rankings[0]['strategy']} "
            f"(Sharpe {all_rankings[0]['sharpe']:.2f})"
            if all_rankings
            else "Hulk found no valid backtest results. Data may be unavailable."
        )

        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'backtest_results': backtest_results,
            'ranking': all_rankings,
            'summary': summary,
        }

    # ------------------------------------------------------------------
    # Trade journal analysis
    # ------------------------------------------------------------------

    def analyze_journal(self, trades: List[Dict]) -> Dict[str, Any]:
        """
        Analyze real trade journal entries to surface patterns and improvements.

        Expects a list of dicts matching the trade_journal CSV schema:
          outcome (win/loss/breakeven), session, instrument, signal_direction,
          htf_bias, confluence_score, realized_pnl_dollars, realized_pnl_pips,
          rr_achieved, rr_planned, generating_agent, trade_duration, status.

        Returns a structured insights dict.
        """
        if not trades:
            return {'error': 'No trades to analyze', 'total_trades': 0}

        # Normalise: filter to closed trades only
        closed = [t for t in trades if str(t.get('status', '')).lower() in ('closed', 'complete', 'filled', '')]
        if not closed:
            closed = trades  # fall back to all if status column is absent/empty

        def _outcome(t: Dict) -> str:
            o = str(t.get('outcome', '')).lower().strip()
            if o in ('win', 'won', '1', 'true', 'w'):
                return 'win'
            if o in ('loss', 'lose', 'lost', '0', 'false', 'l'):
                return 'loss'
            return 'breakeven'

        def _float(t: Dict, key: str) -> Optional[float]:
            try:
                v = t.get(key, '')
                return float(v) if v not in (None, '', 'N/A', 'n/a') else None
            except (ValueError, TypeError):
                return None

        def _win_rate(subset: List[Dict]) -> float:
            if not subset:
                return 0.0
            wins = sum(1 for t in subset if _outcome(t) == 'win')
            return round(wins / len(subset), 4)

        def _avg_pnl(subset: List[Dict]) -> float:
            vals = [_float(t, 'realized_pnl_dollars') for t in subset]
            vals = [v for v in vals if v is not None]
            return round(sum(vals) / len(vals), 2) if vals else 0.0

        # ── Overall stats ──────────────────────────────────────────────
        total = len(closed)
        wins  = sum(1 for t in closed if _outcome(t) == 'win')
        losses = sum(1 for t in closed if _outcome(t) == 'loss')
        wr_overall = round(wins / total, 4)

        pnls = [_float(t, 'realized_pnl_dollars') for t in closed]
        pnls = [v for v in pnls if v is not None]
        total_pnl = round(sum(pnls), 2)
        avg_pnl   = round(sum(pnls) / len(pnls), 2) if pnls else 0.0

        rr_achieved = [_float(t, 'rr_achieved') for t in closed]
        rr_achieved = [v for v in rr_achieved if v is not None]
        rr_planned  = [_float(t, 'rr_planned') for t in closed]
        rr_planned  = [v for v in rr_planned if v is not None]
        avg_rr_achieved = round(sum(rr_achieved) / len(rr_achieved), 2) if rr_achieved else 0.0
        avg_rr_planned  = round(sum(rr_planned) / len(rr_planned), 2)  if rr_planned  else 0.0

        # ── Breakdown helpers ──────────────────────────────────────────
        def _breakdown(key: str) -> Dict[str, Dict]:
            groups: Dict[str, List[Dict]] = {}
            for t in closed:
                val = str(t.get(key, 'unknown')).strip() or 'unknown'
                groups.setdefault(val, []).append(t)
            return {
                k: {
                    'trades': len(v),
                    'win_rate': _win_rate(v),
                    'avg_pnl': _avg_pnl(v),
                }
                for k, v in sorted(groups.items())
            }

        by_session   = _breakdown('session')
        by_instrument = _breakdown('instrument')
        by_direction = _breakdown('signal_direction')
        by_agent     = _breakdown('generating_agent')

        # ── HTF bias alignment ──────────────────────────────────────────
        aligned, misaligned = [], []
        for t in closed:
            bias = str(t.get('htf_bias', '')).lower()
            direction = str(t.get('signal_direction', '')).lower()
            if not bias or not direction:
                continue
            match = (('bull' in bias and ('long' in direction or 'buy' in direction)) or
                     ('bear' in bias and ('short' in direction or 'sell' in direction)))
            (aligned if match else misaligned).append(t)

        bias_analysis = {
            'aligned_trades':      len(aligned),
            'misaligned_trades':   len(misaligned),
            'aligned_win_rate':    _win_rate(aligned),
            'misaligned_win_rate': _win_rate(misaligned),
        }

        # ── Confluence score bucketing ──────────────────────────────────
        low_conf, mid_conf, high_conf = [], [], []
        for t in closed:
            cs = _float(t, 'confluence_score')
            if cs is None:
                continue
            if cs < 3:
                low_conf.append(t)
            elif cs < 5:
                mid_conf.append(t)
            else:
                high_conf.append(t)

        confluence_analysis = {
            'low_0_2':  {'trades': len(low_conf),  'win_rate': _win_rate(low_conf)},
            'mid_3_4':  {'trades': len(mid_conf),  'win_rate': _win_rate(mid_conf)},
            'high_5plus':{'trades': len(high_conf), 'win_rate': _win_rate(high_conf)},
        }

        # ── Best session / instrument ────────────────────────────────────
        best_session    = max(by_session,    key=lambda k: by_session[k]['win_rate'],    default=None)
        best_instrument = max(by_instrument, key=lambda k: by_instrument[k]['win_rate'], default=None)

        # ── Recent trades ────────────────────────────────────────────────
        recent = closed[-10:]

        # ── Improvement tips ─────────────────────────────────────────────
        tips: List[str] = []

        if avg_rr_achieved < avg_rr_planned * 0.75:
            tips.append(f"You're cutting winners short — avg RR achieved {avg_rr_achieved:.2f} vs planned {avg_rr_planned:.2f}. Let trades breathe.")

        if wr_overall < 0.45:
            tips.append(f"Win rate is {wr_overall*100:.0f}% — tighten your entry criteria. Only take trades with confluence ≥ 4.")

        if bias_analysis['misaligned_win_rate'] > 0 and bias_analysis['aligned_win_rate'] > 0:
            if bias_analysis['misaligned_win_rate'] < bias_analysis['aligned_win_rate'] - 0.1:
                tips.append("Counter-bias trades win much less. Stick to HTF bias direction.")

        if confluence_analysis['low_0_2']['trades'] > 0 and confluence_analysis['low_0_2']['win_rate'] < 0.4:
            tips.append("Low confluence setups (<3) are losing. Stop taking them.")

        if best_session and by_session[best_session]['win_rate'] > wr_overall + 0.1:
            tips.append(f"Best session is {best_session} ({by_session[best_session]['win_rate']*100:.0f}% WR). Focus fire there.")

        if best_instrument and by_instrument[best_instrument]['win_rate'] > wr_overall + 0.1:
            tips.append(f"{best_instrument} is your edge ({by_instrument[best_instrument]['win_rate']*100:.0f}% WR). Trade it more.")

        if not tips:
            tips.append("Setup quality looks consistent. Scale size on A+ setups to boost expectancy.")

        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'total_trades': total,
            'wins': wins,
            'losses': losses,
            'win_rate': wr_overall,
            'total_pnl': total_pnl,
            'avg_pnl_per_trade': avg_pnl,
            'avg_rr_achieved': avg_rr_achieved,
            'avg_rr_planned': avg_rr_planned,
            'by_session': by_session,
            'by_instrument': by_instrument,
            'by_direction': by_direction,
            'by_agent': by_agent,
            'bias_analysis': bias_analysis,
            'confluence_analysis': confluence_analysis,
            'best_session': best_session,
            'best_instrument': best_instrument,
            'recent_trades': recent,
            'improvement_tips': tips,
        }

    # ------------------------------------------------------------------
    # Report formatting
    # ------------------------------------------------------------------

    @staticmethod
    def format_report(analysis: Dict[str, Any]) -> str:
        """Format analysis results as Telegram MarkdownV2 message."""

        def esc(text: str) -> str:
            """Escape special chars for Telegram MarkdownV2."""
            special = r'_*[]()~`>#+-=|{}.!'
            out = []
            for ch in str(text):
                if ch in special:
                    out.append('\\')
                out.append(ch)
            return ''.join(out)

        if analysis.get('status') != 'success':
            return esc("Hulk couldn't smash anything today. No data available.")

        lines = [
            '*HULK BACKTEST REPORT*',
            esc(f"Generated: {analysis.get('timestamp', 'N/A')}"),
            '',
        ]

        ranking = analysis.get('ranking', [])
        if ranking:
            lines.append('*Top Performers:*')
            for i, r in enumerate(ranking[:5], 1):
                lines.append(
                    esc(f"  {i}. {r['pair']}/{r['strategy']} — Sharpe {r['sharpe']:.2f}")
                )
            lines.append('')

        results = analysis.get('backtest_results', {})
        for pair, strats in results.items():
            lines.append(f'*{esc(pair)}*')
            for sname, sdata in strats.items():
                m = sdata.get('metrics', {})
                wf = sdata.get('walk_forward', {})
                lines.append(f'  _{esc(sname)}_')
                lines.append(esc(f"    Return: {m.get('total_return_pct', 0):.1f}%"))
                lines.append(esc(f"    Win Rate: {m.get('win_rate', 0)*100:.1f}%"))
                lines.append(esc(f"    Sharpe: {m.get('sharpe_ratio', 0):.2f}"))
                lines.append(esc(f"    Max DD: {m.get('max_drawdown_pct', 0):.1f}%"))
                lines.append(esc(f"    Trades: {m.get('total_trades', 0)}"))
                rob = wf.get('robustness_score', 'N/A')
                if isinstance(rob, (int, float)):
                    lines.append(esc(f"    Robustness: {rob:.2f}"))
                else:
                    lines.append(esc(f"    Robustness: {rob}"))
            lines.append('')

        lines.append(f'_{esc(analysis.get("summary", ""))}_')
        return '\n'.join(lines)


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("HULK SMASH! Starting backtest analysis...")
    logger.info("=" * 60)

    hulk = Hulk()
    results = hulk.analyze()

    if results['status'] == 'success':
        report = hulk.format_report(results)
        print("\n" + report)
        logger.info("Hulk done smashing. Bruce signing off.")
    else:
        logger.error("Hulk sad. Analysis failed.")
