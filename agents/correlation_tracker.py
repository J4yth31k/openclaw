"""
Cross-asset correlation tracker agent.

Analyzes 30-day rolling correlations between crypto, forex, commodities, and indices.
Detects divergences, tracks DXY impact, and flags unusual moves.
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CorrelationTracker:
    """Tracks correlations across asset classes and detects divergences."""

    def __init__(self):
        """Initialize correlation tracker."""
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
        """Fetch historical data for all pairs."""
        try:
            data = yf.download(
                pairs,
                period=f'{days}d',
                progress=False,
                interval='1d'
            )

            if isinstance(data, pd.DataFrame):
                if len(data.columns) == 1:
                    # Single pair, reformat
                    col_name = data.columns[0]
                    data = data[[col_name]].rename(columns={col_name: pairs[0]})
                else:
                    # Multiple pairs, extract Adj Close
                    if 'Adj Close' in data.columns.get_level_values(0):
                        data = data['Adj Close']
                    elif 'Close' in data.columns.get_level_values(0):
                        data = data['Close']

            return data.dropna()
        except Exception as e:
            logger.error(f"Error fetching data for {pairs}: {e}")
            return None

    def _calculate_correlations(self, data: pd.DataFrame) -> pd.DataFrame:
        """Calculate 30-day rolling correlation matrix."""
        try:
            returns = data.pct_change().dropna()
            correlation_matrix = returns.rolling(window=self.correlation_window).corr()
            # Get the last correlation matrix
            return correlation_matrix.iloc[-len(data.columns):, :]
        except Exception as e:
            logger.error(f"Error calculating correlations: {e}")
            return pd.DataFrame()

    def _detect_divergences(self, corr_matrix: pd.DataFrame) -> dict:
        """Detect when normally correlated assets diverge."""
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
        """Analyze DXY impact on major pairs."""
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
        """Flag pairs that moved >2 std devs from 20-day average."""
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

    def _generate_intermarket_summary(self, analysis: dict) -> str:
        """Generate brief text summary of cross-asset signals."""
        signals = []

        # Check divergences
        divergences = analysis.get('divergences', [])
        high_severity = [d for d in divergences if d['severity'] == 'HIGH']

        if high_severity:
            signals.append(f"⚠️ {len(high_severity)} major divergences detected")

        # Check unusual moves
        unusual = analysis.get('unusual_moves', [])
        if unusual:
            signals.append(f"📍 {len(unusual)} pairs showing extreme moves")

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
                    signals.append("🟢 Risk-ON bias (multi-asset strength)")
                else:
                    signals.append("🔴 Risk-OFF bias (broad weakness)")

        if not signals:
            signals.append("Market regime stable, limited divergences")

        return " | ".join(signals)

    def analyze(self, pairs: Optional[list[str]] = None) -> dict:
        """
        Main analysis function.

        Args:
            pairs: List of ticker symbols. Defaults to standard set.

        Returns:
            Dictionary with correlation analysis results.
        """
        if pairs is None:
            pairs = [
                'BTC-USD', 'ETH-USD', 'SOL-USD',
                'EURUSD=X', 'GC=F', 'USDCAD=X',
                'DX-Y.NYB', '^VIX'
            ]

        logger.info(f"Analyzing correlations for {len(pairs)} assets")

        # Fetch data
        data = self._fetch_data(pairs)
        if data is None or data.empty:
            logger.error("No data fetched")
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

        analysis = {
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'success',
            'correlation_matrix': corr_matrix.round(3).to_dict(),
            'divergences': divergences,
            'dxy_impact': dxy_impact,
            'unusual_moves': unusual_moves,
            'summary': self._generate_intermarket_summary({
                'divergences': divergences,
                'unusual_moves': unusual_moves,
                'dxy_impact': dxy_impact
            }),
            'data_points': len(data)
        }

        logger.info(f"Correlation analysis complete: {len(divergences)} divergences, "
                   f"{len(unusual_moves)} unusual moves")

        return analysis

    def format_report(self, analysis: dict) -> str:
        """
        Format analysis for Telegram MarkdownV2.

        Args:
            analysis: Output from analyze()

        Returns:
            Formatted markdown string.
        """
        if analysis.get('status') != 'success':
            return f"❌ Correlation analysis failed: {analysis.get('message', 'Unknown error')}"

        lines = [
            "🔗 *CORRELATIONS & CROSS\\-ASSET ANALYSIS*",
            "",
        ]

        # Summary
        lines.append(analysis['summary'])
        lines.append("")

        # Divergences
        divergences = analysis.get('divergences', [])
        if divergences:
            lines.append("⚠️ *Divergences Detected:*")
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
            lines.append("📍 *Unusual Moves* \\(>2σ\\):*")
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
            lines.append("💱 *DXY Impact Analysis:*")
            trend = dxy['dxy_trend'].upper()
            lines.append(f"DXY Trend: *{trend}*")
            lines.append(f"Volatility: {dxy['dxy_volatility']}%")
            lines.append("")

        lines.append(f"📊 Data points: {analysis['data_points']}")

        return "\n".join(lines)


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    tracker = CorrelationTracker()
    result = tracker.analyze()
    print(tracker.format_report(result))
