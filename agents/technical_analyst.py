"""
Technical Analysis Agent for Forex/Crypto Scalper Bot

Provides comprehensive multi-timeframe technical analysis using yfinance data.
Analyzes: BTCUSD, ETHUSD, SOLUSD, EURUSD, XAUUSD, USDCAD

Indicators: EMA (9/21/50/200), RSI (14), MACD (12,26,9), Bollinger Bands (20,2), ATR (14), Volume Profile
Detects: Support/Resistance levels, Trend classification, EMA/MACD crossovers, RSI divergence, Bollinger squeeze
"""

import logging
import warnings
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

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
logger = logging.getLogger(__name__)

# Configuration
PAIRS = {
    'BTCUSD': 'BTC-USD',
    'ETHUSD': 'ETH-USD',
    'SOLUSD': 'SOL-USD',
    'EURUSD': 'EURUSD=X',
    'XAUUSD': 'GC=F',
    'USDCAD': 'USDCAD=X',
}

TIMEFRAMES = {
    '1d': '1d',
    '4h': '1h',  # Will resample to 4h
    '1h': '1h',
}

# Technical indicator parameters
EMA_PERIODS = [9, 21, 50, 200]
RSI_PERIOD = 14
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
BB_PERIOD = 20
BB_STD = 2
ATR_PERIOD = 14


class TechnicalAnalyzer:
    """Technical analysis engine for forex/crypto pairs."""

    def __init__(self):
        self.data_cache = {}

    def fetch_data(self, ticker: str, interval: str, period: str = '90d') -> Optional[pd.DataFrame]:
        """
        Fetch OHLCV data from yfinance.

        Args:
            ticker: yfinance ticker symbol
            interval: '1d' or '1h'
            period: Time period to fetch (default: 90d)

        Returns:
            DataFrame with OHLCV data or None if fetch fails
        """
        try:
            cache_key = f"{ticker}_{interval}"
            if cache_key in self.data_cache:
                return self.data_cache[cache_key]

            logger.info(f"Fetching {ticker} {interval} data...")
            df = yf.download(ticker, interval=interval, period=period, progress=False)

            if df.empty:
                logger.warning(f"No data fetched for {ticker}")
                return None

            df.columns = [col.lower() for col in df.columns]
            self.data_cache[cache_key] = df
            return df

        except Exception as e:
            logger.error(f"Error fetching data for {ticker}: {e}")
            return None

    def calculate_ema(self, data: pd.Series, period: int) -> pd.Series:
        """Calculate Exponential Moving Average."""
        return data.ewm(span=period, adjust=False).mean()

    def calculate_rsi(self, data: pd.Series, period: int = 14) -> pd.Series:
        """Calculate Relative Strength Index."""
        delta = data.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()

        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def calculate_macd(
        self, data: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        Calculate MACD, Signal line, and Histogram.

        Returns:
            (macd_line, signal_line, histogram)
        """
        ema_fast = self.calculate_ema(data, fast)
        ema_slow = self.calculate_ema(data, slow)
        macd_line = ema_fast - ema_slow
        signal_line = self.calculate_ema(macd_line, signal)
        histogram = macd_line - signal_line

        return macd_line, signal_line, histogram

    def calculate_bollinger_bands(
        self, data: pd.Series, period: int = 20, std_dev: float = 2
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        Calculate Bollinger Bands.

        Returns:
            (upper_band, middle_band, lower_band)
        """
        middle = data.rolling(window=period).mean()
        std = data.rolling(window=period).std()
        upper = middle + (std * std_dev)
        lower = middle - (std * std_dev)

        return upper, middle, lower

    def calculate_atr(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        """Calculate Average True Range."""
        high = df['high']
        low = df['low']
        close = df['close']

        tr1 = high - low
        tr2 = abs(high - close.shift())
        tr3 = abs(low - close.shift())

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=period).mean()

        return atr

    def calculate_volume_profile(self, df: pd.DataFrame, bins: int = 20) -> Dict:
        """
        Calculate volume profile (simplified: volume at price levels).

        Returns:
            Dict with price levels and cumulative volume
        """
        try:
            if df.empty or 'volume' not in df.columns:
                return {}

            price_range = df['close'].max() - df['close'].min()
            if price_range == 0:
                return {}

            bin_edges = np.linspace(df['close'].min(), df['close'].max(), bins + 1)
            df_copy = df.copy()
            df_copy['price_bin'] = pd.cut(df_copy['close'], bins=bin_edges)

            volume_profile = df_copy.groupby('price_bin')['volume'].sum().to_dict()
            return {
                'bins': len(volume_profile),
                'peak_volume_level': str(max(volume_profile, key=volume_profile.get))
                if volume_profile
                else None,
            }

        except Exception as e:
            logger.warning(f"Error calculating volume profile: {e}")
            return {}

    def find_support_resistance(self, df: pd.DataFrame, lookback: int = 60) -> Dict:
        """
        Find support and resistance levels using swing highs/lows.

        Uses a rolling window approach to identify local extrema.

        Returns:
            Dict with support and resistance levels
        """
        if len(df) < 10:
            return {'support': [], 'resistance': []}

        df_subset = df.tail(lookback).copy()
        window = 5

        # Find local maxima (resistance)
        resistance = []
        for i in range(window, len(df_subset) - window):
            if df_subset['high'].iloc[i] == df_subset['high'].iloc[i - window : i + window + 1].max():
                resistance.append(round(df_subset['high'].iloc[i], 2))

        # Find local minima (support)
        support = []
        for i in range(window, len(df_subset) - window):
            if df_subset['low'].iloc[i] == df_subset['low'].iloc[i - window : i + window + 1].min():
                support.append(round(df_subset['low'].iloc[i], 2))

        # Remove duplicates and sort
        resistance = sorted(list(set(resistance)), reverse=True)[:3]  # Top 3
        support = sorted(list(set(support)))[:3]  # Bottom 3

        return {
            'support': support,
            'resistance': resistance,
        }

    def classify_trend(self, df: pd.DataFrame) -> str:
        """
        Classify trend based on EMA alignment and price position.

        Returns:
            'Strong Uptrend', 'Uptrend', 'Ranging', 'Downtrend', 'Strong Downtrend'
        """
        if len(df) < 200:
            return 'Ranging'

        close = df['close'].iloc[-1]
        ema9 = df['ema_9'].iloc[-1]
        ema21 = df['ema_21'].iloc[-1]
        ema50 = df['ema_50'].iloc[-1]
        ema200 = df['ema_200'].iloc[-1]

        # EMA alignment score
        if ema9 > ema21 > ema50 > ema200 and close > ema9:
            return 'Strong Uptrend'
        elif (ema9 > ema21 > ema50) or (ema21 > ema50 > ema200):
            return 'Uptrend'
        elif ema200 > ema50 > ema21 > ema9 and close < ema9:
            return 'Strong Downtrend'
        elif (ema200 > ema50 > ema21) or (ema50 > ema21 > ema9):
            return 'Downtrend'
        else:
            return 'Ranging'

    def detect_patterns(self, df: pd.DataFrame) -> Dict[str, bool]:
        """
        Detect technical patterns.

        Returns:
            Dict with pattern flags
        """
        patterns = {
            'golden_cross': False,
            'death_cross': False,
            'rsi_divergence': False,
            'bollinger_squeeze': False,
            'macd_bullish_cross': False,
            'macd_bearish_cross': False,
        }

        if len(df) < 5:
            return patterns

        # EMA crosses
        if (df['ema_9'].iloc[-2] <= df['ema_21'].iloc[-2] and
                df['ema_9'].iloc[-1] > df['ema_21'].iloc[-1]):
            patterns['golden_cross'] = True

        if (df['ema_9'].iloc[-2] >= df['ema_21'].iloc[-2] and
                df['ema_9'].iloc[-1] < df['ema_21'].iloc[-1]):
            patterns['death_cross'] = True

        # MACD crosses
        if (df['macd_hist'].iloc[-2] <= 0 and df['macd_hist'].iloc[-1] > 0):
            patterns['macd_bullish_cross'] = True

        if (df['macd_hist'].iloc[-2] >= 0 and df['macd_hist'].iloc[-1] < 0):
            patterns['macd_bearish_cross'] = True

        # Bollinger Squeeze
        if 'bb_width' in df.columns:
            bb_sma = df['bb_width'].rolling(20).mean()
            current_width = df['bb_width'].iloc[-1]
            avg_width = bb_sma.iloc[-1]

            if current_width < avg_width * 0.5:
                patterns['bollinger_squeeze'] = True

        # RSI Divergence (simplified: last 20 bars)
        if len(df) >= 20 and 'rsi' in df.columns:
            recent = df.tail(20)
            price_high = recent['close'].max()
            price_high_idx = recent['close'].idxmax()
            rsi_at_price_high = recent.loc[price_high_idx, 'rsi']

            if price_high == recent['close'].iloc[-1]:
                recent_rsi_max = recent['rsi'].max()
                if recent_rsi_max < rsi_at_price_high:
                    patterns['rsi_divergence'] = True

        return patterns

    def analyze_pair(self, pair_name: str, yf_ticker: str) -> Dict:
        """
        Perform comprehensive analysis on a single pair across multiple timeframes.

        Args:
            pair_name: Display name (e.g., 'BTCUSD')
            yf_ticker: yfinance ticker (e.g., 'BTC-USD')

        Returns:
            Dict with multi-timeframe analysis
        """
        analysis = {
            'pair': pair_name,
            'timestamp': datetime.now().isoformat(),
            'timeframes': {},
            'error': None,
        }

        try:
            for tf_name, yf_interval in TIMEFRAMES.items():
                logger.info(f"Analyzing {pair_name} {tf_name}...")
                df = self.fetch_data(yf_ticker, yf_interval)

                if df is None or df.empty:
                    analysis['timeframes'][tf_name] = {'error': 'Failed to fetch data'}
                    continue

                # Resample 1h to 4h if needed
                if tf_name == '4h':
                    df = df.resample('4h').agg({
                        'open': 'first',
                        'high': 'max',
                        'low': 'min',
                        'close': 'last',
                        'volume': 'sum',
                    }).dropna()

                if len(df) < 200:
                    analysis['timeframes'][tf_name] = {'warning': f'Only {len(df)} bars available'}

                # Calculate indicators
                df['ema_9'] = self.calculate_ema(df['close'], 9)
                df['ema_21'] = self.calculate_ema(df['close'], 21)
                df['ema_50'] = self.calculate_ema(df['close'], 50)
                df['ema_200'] = self.calculate_ema(df['close'], 200)

                df['rsi'] = self.calculate_rsi(df['close'], RSI_PERIOD)

                df['macd'], df['macd_signal'], df['macd_hist'] = self.calculate_macd(
                    df['close'], MACD_FAST, MACD_SLOW, MACD_SIGNAL
                )

                df['bb_upper'], df['bb_middle'], df['bb_lower'] = self.calculate_bollinger_bands(
                    df['close'], BB_PERIOD, BB_STD
                )
                df['bb_width'] = df['bb_upper'] - df['bb_lower']

                df['atr'] = self.calculate_atr(df, ATR_PERIOD)

                # Analysis
                current_price = df['close'].iloc[-1]
                trend = self.classify_trend(df)
                patterns = self.detect_patterns(df)
                sr_levels = self.find_support_resistance(df)
                volume_profile = self.calculate_volume_profile(df)

                # Get latest indicator values
                rsi_val = df['rsi'].iloc[-1]
                macd_val = df['macd'].iloc[-1]
                macd_signal_val = df['macd_signal'].iloc[-1]
                bb_position = (current_price - df['bb_lower'].iloc[-1]) / (
                    df['bb_upper'].iloc[-1] - df['bb_lower'].iloc[-1]
                ) if (df['bb_upper'].iloc[-1] - df['bb_lower'].iloc[-1]) > 0 else 0.5
                atr_val = df['atr'].iloc[-1]

                # EMA values
                ema_9 = df['ema_9'].iloc[-1]
                ema_21 = df['ema_21'].iloc[-1]
                ema_50 = df['ema_50'].iloc[-1]
                ema_200 = df['ema_200'].iloc[-1]

                analysis['timeframes'][tf_name] = {
                    'price': round(current_price, 2),
                    'trend': trend,
                    'ema': {
                        '9': round(ema_9, 2),
                        '21': round(ema_21, 2),
                        '50': round(ema_50, 2),
                        '200': round(ema_200, 2),
                    },
                    'rsi': round(rsi_val, 2),
                    'rsi_level': self._rsi_level(rsi_val),
                    'macd': round(macd_val, 4),
                    'macd_signal': round(macd_signal_val, 4),
                    'macd_histogram': round(df['macd_hist'].iloc[-1], 4),
                    'bollinger_bands': {
                        'upper': round(df['bb_upper'].iloc[-1], 2),
                        'middle': round(df['bb_middle'].iloc[-1], 2),
                        'lower': round(df['bb_lower'].iloc[-1], 2),
                        'position': round(bb_position, 2),  # 0=at lower, 1=at upper
                    },
                    'atr': round(atr_val, 2),
                    'support': sr_levels.get('support', []),
                    'resistance': sr_levels.get('resistance', []),
                    'patterns': patterns,
                    'volume_profile': volume_profile,
                }

        except Exception as e:
            logger.error(f"Error analyzing {pair_name}: {e}")
            analysis['error'] = str(e)

        return analysis

    @staticmethod
    def _rsi_level(rsi: float) -> str:
        """Classify RSI level."""
        if rsi >= 70:
            return 'Overbought'
        elif rsi >= 60:
            return 'Strong'
        elif rsi >= 40:
            return 'Neutral'
        elif rsi >= 30:
            return 'Weak'
        else:
            return 'Oversold'


def analyze(pairs: Optional[List[str]] = None) -> Dict:
    """
    Run comprehensive technical analysis on specified pairs.

    Args:
        pairs: List of pair names to analyze (e.g., ['BTCUSD', 'EURUSD']).
               If None, analyzes all available pairs.

    Returns:
        Dict keyed by pair with full technical analysis
    """
    if pairs is None:
        pairs = list(PAIRS.keys())

    # Validate pairs
    pairs = [p for p in pairs if p in PAIRS]
    if not pairs:
        logger.warning("No valid pairs specified")
        return {}

    analyzer = TechnicalAnalyzer()
    results = {}

    for pair in pairs:
        yf_ticker = PAIRS[pair]
        results[pair] = analyzer.analyze_pair(pair, yf_ticker)

    return results


def format_report(analysis: Dict) -> str:
    """
    Format technical analysis as clean Telegram markdown text.

    Args:
        analysis: Dict returned by analyze()

    Returns:
        Formatted string suitable for Telegram
    """
    if not analysis:
        return "No analysis available"

    report = "📊 *Technical Analysis Report*\n"
    report += f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC\n\n"

    for pair, data in analysis.items():
        if data.get('error'):
            report += f"❌ *{pair}*: Error - {data['error']}\n\n"
            continue

        report += f"{'='*50}\n"
        report += f"*{pair}*\n"
        report += f"{'='*50}\n\n"

        for tf, tf_data in data.get('timeframes', {}).items():
            if tf_data.get('error'):
                report += f"  ⚠️  {tf}: {tf_data['error']}\n"
                continue

            if tf_data.get('warning'):
                report += f"  ⚠️  {tf}: {tf_data['warning']}\n"

            price = tf_data.get('price')
            trend = tf_data.get('trend')
            rsi = tf_data.get('rsi')
            rsi_level = tf_data.get('rsi_level')

            # Trend emoji
            trend_emoji = {
                'Strong Uptrend': '🟢🔺🔺',
                'Uptrend': '🟢🔺',
                'Ranging': '🟡',
                'Downtrend': '🔴🔻',
                'Strong Downtrend': '🔴🔻🔻',
            }.get(trend, '⚪')

            report += f"\n*{tf.upper()}*\n"
            report += f"  Price: `{price}`\n"
            report += f"  Trend: {trend_emoji} {trend}\n"
            report += f"  RSI: `{rsi}` ({rsi_level})\n"

            # EMAs
            ema = tf_data.get('ema', {})
            report += f"  EMA: 9:`{ema.get('9')}` | 21:`{ema.get('21')}` | "
            report += f"50:`{ema.get('50')}` | 200:`{ema.get('200')}`\n"

            # MACD
            macd = tf_data.get('macd')
            macd_hist = tf_data.get('macd_histogram')
            macd_emoji = '🟢' if macd_hist > 0 else '🔴'
            report += f"  MACD: {macd_emoji} `{macd}` | Hist: `{macd_hist}`\n"

            # Bollinger Bands
            bb = tf_data.get('bollinger_bands', {})
            bb_pos = bb.get('position', 0.5)
            bb_emoji = '📈' if bb_pos > 0.7 else '📉' if bb_pos < 0.3 else '〰️'
            report += f"  Bollinger: {bb_emoji} Position: `{bb_pos}`\n"

            # Support/Resistance
            support = tf_data.get('support', [])
            resistance = tf_data.get('resistance', [])

            if support:
                report += f"  Support: `{support[0]}`"
                if len(support) > 1:
                    report += f", `{support[1]}`"
                report += "\n"

            if resistance:
                report += f"  Resistance: `{resistance[0]}`"
                if len(resistance) > 1:
                    report += f", `{resistance[1]}`"
                report += "\n"

            # Patterns
            patterns = tf_data.get('patterns', {})
            active_patterns = [k.upper() for k, v in patterns.items() if v]

            if active_patterns:
                report += f"  Patterns: {', '.join(active_patterns)}\n"

            report += "\n"

        report += "\n"

    return report


if __name__ == '__main__':
    # Example usage
    logger.info("Starting technical analysis...")

    # Analyze all pairs
    results = analyze()

    # Format and print report
    report = format_report(results)
    print(report)

    # Also save to file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    report_file = f'/tmp/technical_analysis_{timestamp}.txt'
    with open(report_file, 'w') as f:
        f.write(report)

    logger.info(f"Report saved to {report_file}")
