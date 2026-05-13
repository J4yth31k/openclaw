"""
Thor (Thor Odinson) - Cross-asset Correlation Tracker Agent

The Bifrost connects all realms (assets). Analyzes 30-day rolling correlations
between crypto, forex, commodities, and indices. Detects divergences, tracks
DXY impact, and flags unusual moves across realms.
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta

logger = logging.getLogger('thor')

PERSONA = "The Bifrost reveals connections across all realms. Let the thunder speak."


class Thor:
    """Thor Odinson tracks correlations across asset realms and detects divergences."""

    def __init__(self):
        """Initialize Thor - the Bifrost correlation scanner."""
        self.correlation_window = 30
        self.std_dev_threshold = 2.0

        # Expected correlation ranges (20-day baseline)
        self.expected_correlations = {
            ('BTC-USD', 'ETH-USD'): (0.70, 0.95),
            ('BTC-USD', 'SOL-USD'): (0.60, 0.85),
            ('ETH-USD', 'SOL-USD'): (0.65, 0.85),
            ('EURUSD=X', 'DX-Y.NYB'): (-0.80, -0.50),  # Inverse
            ('GC=F', 'DX-Y.NYB'): (-0.70, -0.40),      # Inverse
            ('BTC-USD', 'DX-Y.NYB'): (-0.50, -0.10),   # Generally inverse
            ('EURUSD=X', 'GC=F'): (0.30, 0.70),
        }

    def _fetch_data(self, pairs: list[str], days: int = 40) -> Optional[pd.DataFrame]:
        """Fetch historical data for all realms."""
        try:
            data = yf.download(
                pairs,
                period=f'{days}d',
                progress=False,
                interval='1d'
            )

            if isinstance(data, pd.DataFrame):
                if isinstance(data.columns, pd.MultiIndex):
                    # yfinance >=1.3.0: MultiIndex columns (metric, ticker)
                    if 'Close' in data.columns.get_level_values(0):
                        data = data['Close']
                    elif 'Adj Close' in data.columns.get_level_values(0):
                        data = data['Adj Close']
                elif len(data.columns) == 1:
                    col_name = data.columns[0]
                    data = data[[col_name]].rename(columns={col_name: pairs[0]})

            return data.dropna()
        except Exception as e:
            logger.error(f"Error fetching data for {pairs}: {e}")
            return None

    def _calculate_correlations(self, data: pd.DataFrame) -> pd.DataFrame:
        """Calculate 30-day rolling correlation matrix across realms."""
        try:
            returns = data.pct_change().dropna()
            correlation_matrix = returns.rolling(window=self.correlation_window).corr()
            # Get the last correlation matrix
            return correlation_matrix.iloc[-len(data.columns):, :]
        except Exception as e:
            logger.error(f"Error calculating correlations: {e}")
            return pd.DataFrame()

    def _detect_divergences(self, corr_matrix: pd.DataFrame) -> dict:
        """Detect when normally connected realms diverge."""
        divergences = []

        for (pair1, pair2), (expected_min, expected_max) in self.expected_correlations.items():
            if pair1 in corr_matrix.index and pair2 in corr_matrix.columns:
                current_corr = corr_matrix.loc[pair1, pair2]

                if current_corr < expected_min:
                    divergences.append({
                        'pair': f"{pair1} / {pair2}",
                        'current': round(current_corr, 3),
                        'expected_range': (expected_min, expected_max),
                        'type': 'weaker_than_usual',
                        'severity': 'HIGH' if current_corr < expected_min - 0.2 else 'MEDIUM'
                    })
                elif current_corr > expected_max:
                    divergences.append({
                        'pair': f"{pair1} / {pair2}",
                        'current': round(current_corr, 3),
                        'expected_range': (expected_min, expected_max),
                        'type': 'stronger_than_usual',
                        'severity': 'MEDIUM'
                    })

        return divergences

    def _analyze_dxy_impact(self, data: pd.DataFrame) -> dict:
        """Analyze DXY impact on major realms."""
        if 'DX-Y.NYB' not in data.columns:
            return {'status': 'DXY data unavailable'}

        try:
            returns = data.pct_change().dropna()
            dxy_returns = returns['DX-Y.NYB']

            analysis = {
                'dxy_trend': 'bullish' if dxy_returns.iloc[-5:].mean() > 0 else 'bearish',
                'dxy_volatility': round(dxy_returns.std() * 100, 2),
                'expected_impacts': {}
            }

            # Inverse relationships
            for pair in ['EURUSD=X', 'GC=F']:
                if pair in returns.columns:
                    pair_returns = returns[pair]
                    correlation = dxy_returns.corr(pair_returns)
                    analysis['expected_impacts'][pair] = {
                        'correlation_with_dxy': round(correlation, 3),
                        'expected': 'inverse' if correlation < -0.5 else 'weak inverse'
                    }

            # Crypto relationship
            for pair in ['BTC-USD']:
                if pair in returns.columns:
                    pair_returns = returns[pair]
                    correlation = dxy_returns.corr(pair_returns)
                    analysis['expected_impacts'][pair] = {
                        'correlation_with_dxy': round(correlation, 3),
                        'expected': 'inverse' if correlation < -0.3 else 'weak'
                    }

            return analysis
        except Exception as e:
            logger.error(f"Error analyzing DXY impact: {e}")
            return {'status': 'error', 'message': str(e)}

    def _detect_unusual_moves(self, data: pd.DataFrame) -> list:
        """Flag realms that moved >2 std devs from 20-day average."""
        unusual = []

        try:
            returns = data.pct_change().dropna()

            for column in returns.columns:
                col_returns = returns[column]
                mean_move = col_returns.tail(20).mean() * 100
                std_move = col_returns.tail(20).std() * 100
                current_move = col_returns.iloc[-1] * 100

                z_score = abs((current_move - mean_move) / std_move) if std_move > 0 else 0

                if z_score > self.std_dev_threshold:
                    unusual.append({
                        'pair': column,
                        'current_move': round(current_move, 3),
                        'avg_20d': round(mean_move, 3),
                        'std_dev': round(std_move, 3),
                        'z_score': round(z_score, 2),
                        'direction': 'UP' if current_move > mean_move else 'DOWN'
                    })

            return sorted(unusual, key=lambda x: abs(x['z_score']), reverse=True)
        except Exception as e:
            logger.error(f"Error detecting unusual moves: {e}")
            return []

    def detect_regime_shift(self, data: pd.DataFrame) -> dict:
        """
        Detect potential regime shifts by comparing short-term (10-day) vs
        long-term (30-day) rolling correlations. If any pair-pair correlation
        diverges by more than 0.3, flag it as a potential regime shift.

        Args:
            data: DataFrame of close prices for all tracked assets.

        Returns:
            Dict with 'regime_shift_detected' bool, 'shifts' list of details,
            and 'shift_count'.
        """
        result = {
            'regime_shift_detected': False,
            'shifts': [],
            'shift_count': 0,
        }

        try:
            if data is None or data.empty or len(data) < 30:
                return result

            returns = data.pct_change().dropna()
            if len(returns) < 30:
                return result

            # Calculate short-term and long-term correlation matrices
            short_term_corr = returns.tail(10).corr()
            long_term_corr = returns.tail(30).corr()

            shifts = []
            columns = list(returns.columns)

            for i in range(len(columns)):
                for j in range(i + 1, len(columns)):
                    col_a = columns[i]
                    col_b = columns[j]

                    if col_a in short_term_corr.index and col_b in short_term_corr.columns:
                        short_corr = short_term_corr.loc[col_a, col_b]
                        long_corr = long_term_corr.loc[col_a, col_b]
                        diff = abs(short_corr - long_corr)

                        if diff > 0.3:
                            shifts.append({
                                'pair': f"{col_a} / {col_b}",
                                'short_term_corr': round(float(short_corr), 3),
                                'long_term_corr': round(float(long_corr), 3),
                                'divergence': round(float(diff), 3),
                                'direction': 'strengthening' if short_corr > long_corr else 'weakening',
                            })

            result['shifts'] = sorted(shifts, key=lambda x: x['divergence'], reverse=True)
            result['shift_count'] = len(shifts)
            result['regime_shift_detected'] = len(shifts) > 0

        except Exception as e:
            logger.error(f"Error detecting regime shifts: {e}")

        return result

    def _generate_intermarket_summary(self, analysis: dict) -> str:
        """Generate brief text summary of cross-realm signals."""
        signals = []

        # Check divergences
        divergences = analysis.get('divergences', [])
        high_severity = [d for d in divergences if d['severity'] == 'HIGH']

        if high_severity:
            signals.append(f"⚡ {len(high_severity)} major realm fractures detected")

        # Check unusual moves
        unusual = analysis.get('unusual_moves', [])
        if unusual:
            signals.append(f"📍 {len(unusual)} realms showing extreme disturbance")

        # DXY analysis
        dxy = analysis.get('dxy_impact', {})
        if 'dxy_trend' in dxy:
            dxy_trend = dxy['dxy_trend'].upper()
            signals.append(f"💱 DXY trending {dxy_trend}")

        # Risk-on/off inference
        if unusual:
            move_directions = [u['direction'] for u in unusual[:3]]
            if len(set(move_directions)) == 1:
                if move_directions[0] == 'UP':
                    signals.append("🟢 Risk-ON bias (multi-realm strength)")
                else:
                    signals.append("🔴 Risk-OFF bias (broad weakness across realms)")

        if not signals:
            signals.append("All realms stable, the Bifrost holds steady")

        return " | ".join(signals)

    def analyze(self, pairs: Optional[list[str]] = None) -> dict:
        """
        Main analysis function. Thor scans all realms via the Bifrost.

        Args:
            pairs: List of ticker symbols. Defaults to standard set.

        Returns:
            Dictionary with cross-realm correlation analysis results.
        """
        if pairs is None:
            pairs = [
                'BTC-USD', 'ETH-USD', 'SOL-USD',
                'EURUSD=X', 'GC=F', 'USDCAD=X',
                'DX-Y.NYB', '^VIX'
            ]

        logger.info(f"Thor opening the Bifrost to scan {len(pairs)} realms")

        # Fetch data
        data = self._fetch_data(pairs)
        if data is None or data.empty:
            logger.error("No data fetched from the realms")
            return {'status': 'error', 'message': 'Failed to fetch data'}

        # Calculate correlations
        corr_matrix = self._calculate_correlations(data)
        if corr_matrix.empty:
            logger.error("Correlation matrix empty")
            return {'status': 'error', 'message': 'Failed to calculate correlations'}

        # Detect divergences
        divergences = self._detect_divergences(corr_matrix)

        # Analyze DXY impact
        dxy_impact = self._analyze_dxy_impact(data)

        # Detect unusual moves
        unusual_moves = self._detect_unusual_moves(data)

        # Detect regime shifts (10-day vs 30-day correlation divergence)
        regime_shift = self.detect_regime_shift(data)

        analysis = {
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'success',
            'correlation_matrix': corr_matrix.round(3).to_dict(),
            'divergences': divergences,
            'dxy_impact': dxy_impact,
            'unusual_moves': unusual_moves,
            'regime_shift': regime_shift,
            'summary': self._generate_intermarket_summary({
                'divergences': divergences,
                'unusual_moves': unusual_moves,
                'dxy_impact': dxy_impact
            }),
            'data_points': len(data)
        }

        logger.info(f"Bifrost scan complete: {len(divergences)} realm fractures, "
                   f"{len(unusual_moves)} unusual disturbances")

        return analysis

    def format_report(self, analysis: dict) -> str:
        """
        Format analysis for Telegram MarkdownV2.
        Thor's Bifrost scan report.

        Args:
            analysis: Output from analyze()

        Returns:
            Formatted markdown string.
        """
        if analysis.get('status') != 'success':
            return f"❌ Bifrost scan failed: {analysis.get('message', 'Unknown error')}"

        lines = [
            "⚡ *THOR'S BIFROST SCAN - CROSS\\-REALM ANALYSIS*",
            f"_{PERSONA}_",
            "",
        ]

        # Summary
        lines.append(analysis['summary'])
        lines.append("")

        # Divergences
        divergences = analysis.get('divergences', [])
        if divergences:
            lines.append("⚡ *Realm Fractures Detected:*")
            for div in divergences[:5]:
                pair = div['pair'].replace('-', '\\-').replace('=', '\\=')
                severity = "🔴" if div['severity'] == 'HIGH' else "🟡"
                lines.append(
                    f"{severity} {pair}: {div['current']} "
                    f"\\(expected {div['expected_range'][0]}\\-{div['expected_range'][1]}\\)"
                )
            lines.append("")

        # Unusual moves
        unusual = analysis.get('unusual_moves', [])
        if unusual:
            lines.append("📍 *Realm Disturbances* \\(>2\\sigma\\):*")
            for move in unusual[:5]:
                pair = move['pair'].replace('-', '\\-').replace('=', '\\=')
                direction = "⬆️" if move['direction'] == 'UP' else "⬇️"
                lines.append(
                    f"{direction} {pair}: {move['current_move']}% "
                    f"\\(z\\={move['z_score']}\\)"
                )
            lines.append("")

        # DXY analysis
        dxy = analysis.get('dxy_impact', {})
        if 'dxy_trend' in dxy:
            lines.append("💱 *Midgard Dollar Impact:*")
            trend = dxy['dxy_trend'].upper()
            lines.append(f"DXY Trend: *{trend}*")
            lines.append(f"Volatility: {dxy['dxy_volatility']}%")
            lines.append("")

        lines.append(f"📊 Data points across realms: {analysis['data_points']}")
        lines.append("")
        lines.append("_Bring me Thanos! -- Thor Odinson_")

        return "\n".join(lines)


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    tracker = Thor()
    result = tracker.analyze()
    print(tracker.format_report(result))
