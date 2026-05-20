"""
Iron Man (Tony Stark) - Technical Analysis Agent for Forex/Crypto Scalper Bot

JARVIS-powered comprehensive multi-timeframe technical analysis using yfinance data.
Analyzes: Forex majors/minors/exotics, Futures (indices/commodities/bonds/currencies/softs), Crypto

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
logger = logging.getLogger('iron_man')

PERSONA = "Sir, I've completed the scan. Here's what the suit's sensors picked up."

# Configuration
PAIRS = {
    # ── Forex Majors ──
    'EURUSD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X',
    'USDJPY': 'USDJPY=X',
    'USDCHF': 'USDCHF=X',
    'AUDUSD': 'AUDUSD=X',
    'NZDUSD': 'NZDUSD=X',
    'USDCAD': 'USDCAD=X',
    # ── Forex Minors ──
    'EURGBP': 'EURGBP=X',
    'EURJPY': 'EURJPY=X',
    'GBPJPY': 'GBPJPY=X',
    'AUDJPY': 'AUDJPY=X',
    'CADJPY': 'CADJPY=X',
    'CHFJPY': 'CHFJPY=X',
    'EURAUD': 'EURAUD=X',
    'EURCHF': 'EURCHF=X',
    'EURCAD': 'EURCAD=X',
    'GBPAUD': 'GBPAUD=X',
    'GBPCAD': 'GBPCAD=X',
    'GBPCHF': 'GBPCHF=X',
    'AUDCAD': 'AUDCAD=X',
    'AUDCHF': 'AUDCHF=X',
    'AUDNZD': 'AUDNZD=X',
    'NZDCAD': 'NZDCAD=X',
    'NZDCHF': 'NZDCHF=X',
    'NZDJPY': 'NZDJPY=X',
    # ── Forex Exotics ──
    'USDZAR': 'USDZAR=X',
    'USDMXN': 'USDMXN=X',
    'USDSEK': 'USDSEK=X',
    'USDNOK': 'USDNOK=X',
    'USDDKK': 'USDDKK=X',
    'USDSGD': 'USDSGD=X',
    'USDTRY': 'USDTRY=X',
    'USDHKD': 'USDHKD=X',
    'USDCNH': 'USDCNH=X',
    'EURNOK': 'EURNOK=X',
    'EURSEK': 'EURSEK=X',
    'GBPNZD': 'GBPNZD=X',
    # ── Futures - Indices ──
    'ES': 'ES=F',
    'NQ': 'NQ=F',
    'YM': 'YM=F',
    'RTY': 'RTY=F',
    'DAX': '^GDAXI',
    'FTSE': '^FTSE',
    'NIKKEI': '^N225',
    'HSI': '^HSI',
    # ── Futures - Commodities ──
    'GC': 'GC=F',
    'SI': 'SI=F',
    'CL': 'CL=F',
    'NG': 'NG=F',
    'HG': 'HG=F',
    'PL': 'PL=F',
    # ── Futures - Bonds ──
    'ZB': 'ZB=F',
    'ZN': 'ZN=F',
    'ZF': 'ZF=F',
    'ZT': 'ZT=F',
    # ── Futures - Currencies ──
    '6E': '6E=F',
    '6B': '6B=F',
    '6J': '6J=F',
    '6A': '6A=F',
    '6C': '6C=F',
    '6S': '6S=F',
    # ── Futures - Softs/Ags ──
    'ZC': 'ZC=F',
    'ZW': 'ZW=F',
    'ZS': 'ZS=F',
    'CT': 'CT=F',
    'KC': 'KC=F',
    'SB': 'SB=F',
    # ── Crypto ──
    'BTCUSD': 'BTC-USD',
    'ETHUSD': 'ETH-USD',
    'SOLUSD': 'SOL-USD',
    # ── Legacy / Precious Metals ──
    'XAUUSD': 'GC=F',
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


class IronMan:
    """Tony Stark's JARVIS-powered technical analysis engine for forex/crypto pairs."""

    def __init__(self):
        self.data_cache = {}

    @classmethod
    def add_pair(cls, name: str, ticker: str) -> None:
        """
        Add a new trading pair to the module-level PAIRS config.

        Args:
            name: Display name (e.g., 'GBPUSD')
            ticker: yfinance ticker symbol (e.g., 'GBPUSD=X')
        """
        PAIRS[name] = ticker
        logger.info(f"JARVIS registered new pair: {name} -> {ticker}")

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

            logger.info(f"JARVIS acquiring {ticker} {interval} data...")
            df = yf.download(ticker, interval=interval, period=period, progress=False)

            if df.empty:
                logger.warning(f"No data fetched for {ticker}")
                return None

            # yfinance >=1.3.0 returns MultiIndex columns — flatten them
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [col[0] for col in df.columns]
            df.columns = [str(col).lower() for col in df.columns]
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

    @staticmethod
    def _find_peaks(series: pd.Series, order: int = 5) -> List[int]:
        """Find local maxima indices in a series using a rolling window approach."""
        peaks = []
        values = series.values
        for i in range(order, len(values) - order):
            if values[i] == max(values[i - order:i + order + 1]):
                peaks.append(i)
        return peaks

    @staticmethod
    def _find_troughs(series: pd.Series, order: int = 5) -> List[int]:
        """Find local minima indices in a series using a rolling window approach."""
        troughs = []
        values = series.values
        for i in range(order, len(values) - order):
            if values[i] == min(values[i - order:i + order + 1]):
                troughs.append(i)
        return troughs

    def detect_patterns(self, df: pd.DataFrame) -> Dict[str, bool]:
        """
        Detect technical patterns.

        Returns:
            Dict with pattern flags including RSI bullish/bearish divergence
        """
        patterns = {
            'golden_cross': False,
            'death_cross': False,
            'rsi_divergence': False,
            'rsi_bullish_divergence': False,
            'rsi_bearish_divergence': False,
            'bollinger_squeeze': False,
            'macd_bullish_cross': False,
            'macd_bearish_cross': False,
        }

        if len(df) < 5:
            return patterns

        # EMA crosses
        try:
            if (df['ema_9'].iloc[-2] <= df['ema_21'].iloc[-2] and
                    df['ema_9'].iloc[-1] > df['ema_21'].iloc[-1]):
                patterns['golden_cross'] = True

            if (df['ema_9'].iloc[-2] >= df['ema_21'].iloc[-2] and
                    df['ema_9'].iloc[-1] < df['ema_21'].iloc[-1]):
                patterns['death_cross'] = True
        except Exception as e:
            logger.warning(f"Error detecting EMA crosses: {e}")

        # MACD crosses
        try:
            if (df['macd_hist'].iloc[-2] <= 0 and df['macd_hist'].iloc[-1] > 0):
                patterns['macd_bullish_cross'] = True

            if (df['macd_hist'].iloc[-2] >= 0 and df['macd_hist'].iloc[-1] < 0):
                patterns['macd_bearish_cross'] = True
        except Exception as e:
            logger.warning(f"Error detecting MACD crosses: {e}")

        # Bollinger Squeeze
        try:
            if 'bb_width' in df.columns:
                bb_sma = df['bb_width'].rolling(20).mean()
                current_width = df['bb_width'].iloc[-1]
                avg_width = bb_sma.iloc[-1]

                if current_width < avg_width * 0.5:
                    patterns['bollinger_squeeze'] = True
        except Exception as e:
            logger.warning(f"Error detecting Bollinger squeeze: {e}")

        # RSI Divergence — proper peak/trough detection over last 50 bars
        try:
            lookback = min(50, len(df))
            if lookback >= 20 and 'rsi' in df.columns:
                recent = df.tail(lookback).copy()
                recent = recent.reset_index(drop=True)
                price_series = recent['close']
                rsi_series = recent['rsi']

                # Bearish divergence: price makes higher high but RSI makes lower high
                price_peaks = self._find_peaks(price_series, order=5)
                if len(price_peaks) >= 2:
                    last_peak = price_peaks[-1]
                    prev_peak = price_peaks[-2]
                    if (price_series.iloc[last_peak] > price_series.iloc[prev_peak] and
                            rsi_series.iloc[last_peak] < rsi_series.iloc[prev_peak]):
                        patterns['rsi_bearish_divergence'] = True
                        patterns['rsi_divergence'] = True

                # Bullish divergence: price makes lower low but RSI makes higher low
                price_troughs = self._find_troughs(price_series, order=5)
                if len(price_troughs) >= 2:
                    last_trough = price_troughs[-1]
                    prev_trough = price_troughs[-2]
                    if (price_series.iloc[last_trough] < price_series.iloc[prev_trough] and
                            rsi_series.iloc[last_trough] > rsi_series.iloc[prev_trough]):
                        patterns['rsi_bullish_divergence'] = True
                        patterns['rsi_divergence'] = True
        except Exception as e:
            logger.warning(f"Error detecting RSI divergence: {e}")

        return patterns

    def calculate_signal_strength(self, tf_data: Dict) -> float:
        """
        Calculate a composite signal strength score from -10 to +10.

        Components:
            - Trend alignment: +/-3
            - RSI position: +/-2
            - MACD histogram direction: +/-2
            - Bollinger position: +/-1.5
            - Pattern signals: +/-1.5

        Args:
            tf_data: Single timeframe dict from analyze_pair output

        Returns:
            Float score from -10 to +10
        """
        score = 0.0

        # --- Trend alignment: +/-3 ---
        trend = tf_data.get('trend', 'Ranging')
        trend_scores = {
            'Strong Uptrend': 3.0,
            'Uptrend': 1.5,
            'Ranging': 0.0,
            'Downtrend': -1.5,
            'Strong Downtrend': -3.0,
        }
        score += trend_scores.get(trend, 0.0)

        # --- RSI position: +/-2 ---
        rsi = tf_data.get('rsi')
        if rsi is not None:
            if rsi >= 70:
                score -= 2.0  # Overbought = bearish pressure
            elif rsi >= 60:
                score += 1.0
            elif rsi >= 40:
                score += 0.0  # Neutral
            elif rsi >= 30:
                score -= 1.0
            else:
                score += 2.0  # Oversold = bullish reversal potential

        # --- MACD histogram direction: +/-2 ---
        macd_hist = tf_data.get('macd_histogram')
        if macd_hist is not None:
            if macd_hist > 0:
                score += min(2.0, macd_hist * 100)  # Scale but cap at 2
            else:
                score += max(-2.0, macd_hist * 100)

        # --- Bollinger position: +/-1.5 ---
        bb = tf_data.get('bollinger_bands', {})
        bb_position = bb.get('position')
        if bb_position is not None:
            # 0 = at lower band (bullish), 1 = at upper band (bearish)
            # Map to -1.5 to +1.5 (inverted: low position = bullish)
            score += (0.5 - bb_position) * 3.0  # Range: -1.5 to +1.5

        # --- Pattern signals: +/-1.5 ---
        patterns = tf_data.get('patterns', {})
        pattern_score = 0.0
        if patterns.get('golden_cross'):
            pattern_score += 0.75
        if patterns.get('death_cross'):
            pattern_score -= 0.75
        if patterns.get('macd_bullish_cross'):
            pattern_score += 0.75
        if patterns.get('macd_bearish_cross'):
            pattern_score -= 0.75
        if patterns.get('rsi_bullish_divergence'):
            pattern_score += 0.75
        if patterns.get('rsi_bearish_divergence'):
            pattern_score -= 0.75
        if patterns.get('bollinger_squeeze'):
            pattern_score += 0.5  # Squeeze is neutral-bullish (breakout expected)

        score += max(-1.5, min(1.5, pattern_score))

        return round(max(-10.0, min(10.0, score)), 1)

    # ---------------------------------------------------------------
    # Smart Money Concepts (SMC) Methods
    # ---------------------------------------------------------------

    def detect_order_blocks(self, df: pd.DataFrame, lookback: int = 50) -> Dict:
        """Detect bullish and bearish order blocks (institutional entry zones)."""
        obs: Dict[str, list] = {'bullish': [], 'bearish': []}
        if len(df) < lookback:
            return obs

        recent = df.tail(lookback).reset_index(drop=True)
        atr = self.calculate_atr(df).iloc[-1] if len(df) >= 14 else 0

        for i in range(2, len(recent) - 3):
            curr = recent.iloc[i]

            # Bullish OB: bearish candle followed by strong bullish move
            if curr['close'] < curr['open']:
                next_candles = recent.iloc[i + 1:i + 4]
                total_move = next_candles['close'].iloc[-1] - curr['close']
                if total_move > atr * 1.5:
                    obs['bullish'].append({
                        'top': round(float(curr['open']), 6),
                        'bottom': round(float(curr['low']), 6),
                        'index': i,
                        'strength': round(total_move / atr, 2) if atr > 0 else 0,
                    })

            # Bearish OB: bullish candle followed by strong bearish move
            if curr['close'] > curr['open']:
                next_candles = recent.iloc[i + 1:i + 4]
                total_move = curr['close'] - next_candles['close'].iloc[-1]
                if total_move > atr * 1.5:
                    obs['bearish'].append({
                        'top': round(float(curr['high']), 6),
                        'bottom': round(float(curr['open']), 6),
                        'index': i,
                        'strength': round(total_move / atr, 2) if atr > 0 else 0,
                    })

        # Keep only most recent 3 of each
        obs['bullish'] = obs['bullish'][-3:]
        obs['bearish'] = obs['bearish'][-3:]
        return obs

    def detect_fair_value_gaps(self, df: pd.DataFrame, lookback: int = 30) -> Dict:
        """Detect Fair Value Gaps (price imbalances that tend to get filled)."""
        fvgs: Dict[str, list] = {'bullish': [], 'bearish': []}
        if len(df) < lookback:
            return fvgs

        recent = df.tail(lookback).reset_index(drop=True)
        current_price = float(recent['close'].iloc[-1])

        for i in range(1, len(recent) - 1):
            c1 = recent.iloc[i - 1]  # candle before
            c2 = recent.iloc[i]      # middle candle (the impulse)
            c3 = recent.iloc[i + 1]  # candle after

            # Bullish FVG: gap between c1 high and c3 low
            if c3['low'] > c1['high']:
                gap_top = float(c3['low'])
                gap_bottom = float(c1['high'])
                gap_size = gap_top - gap_bottom
                # Only flag unfilled FVGs (price hasn't come back to fill)
                if current_price > gap_top:
                    fvgs['bullish'].append({
                        'top': round(gap_top, 6),
                        'bottom': round(gap_bottom, 6),
                        'size': round(gap_size, 6),
                        'filled': False,
                    })

            # Bearish FVG: gap between c3 high and c1 low
            if c1['low'] > c3['high']:
                gap_top = float(c1['low'])
                gap_bottom = float(c3['high'])
                gap_size = gap_top - gap_bottom
                if current_price < gap_bottom:
                    fvgs['bearish'].append({
                        'top': round(gap_top, 6),
                        'bottom': round(gap_bottom, 6),
                        'size': round(gap_size, 6),
                        'filled': False,
                    })

        fvgs['bullish'] = fvgs['bullish'][-5:]
        fvgs['bearish'] = fvgs['bearish'][-5:]
        return fvgs

    def detect_market_structure(self, df: pd.DataFrame, lookback: int = 60) -> Dict:
        """
        Track swing highs/lows and detect Break of Structure (BOS) and
        Change of Character (CHoCH).

        Returns:
            Dict with structure classification, swing points, last BOS and CHoCH.
        """
        result: Dict = {
            'structure': 'RANGING',
            'swing_highs': [],
            'swing_lows': [],
            'last_bos': None,
            'last_choch': None,
        }
        if len(df) < lookback:
            return result

        recent = df.tail(lookback).reset_index(drop=True)
        window = 5

        # Collect swing highs
        swing_highs: List[Dict] = []
        for i in range(window, len(recent) - window):
            if recent['high'].iloc[i] == recent['high'].iloc[i - window:i + window + 1].max():
                swing_highs.append({'price': float(recent['high'].iloc[i]), 'index': i})

        # Collect swing lows
        swing_lows: List[Dict] = []
        for i in range(window, len(recent) - window):
            if recent['low'].iloc[i] == recent['low'].iloc[i - window:i + window + 1].min():
                swing_lows.append({'price': float(recent['low'].iloc[i]), 'index': i})

        result['swing_highs'] = [round(sh['price'], 6) for sh in swing_highs[-5:]]
        result['swing_lows'] = [round(sl['price'], 6) for sl in swing_lows[-5:]]

        # Determine structure from sequential swing points
        if len(swing_highs) >= 2 and len(swing_lows) >= 2:
            hh = swing_highs[-1]['price'] > swing_highs[-2]['price']  # higher high
            hl = swing_lows[-1]['price'] > swing_lows[-2]['price']    # higher low
            lh = swing_highs[-1]['price'] < swing_highs[-2]['price']  # lower high
            ll = swing_lows[-1]['price'] < swing_lows[-2]['price']    # lower low

            if hh and hl:
                result['structure'] = 'BULLISH'
            elif lh and ll:
                result['structure'] = 'BEARISH'
            else:
                result['structure'] = 'RANGING'

        # Detect BOS and CHoCH using current price vs last swing levels
        current_price = float(recent['close'].iloc[-1])

        if len(swing_highs) >= 2 and len(swing_lows) >= 2:
            last_sh = swing_highs[-1]
            prev_sh = swing_highs[-2]
            last_sl = swing_lows[-1]
            prev_sl = swing_lows[-2]

            # BOS: break in the direction of existing trend
            if result['structure'] == 'BULLISH' and current_price > last_sh['price']:
                result['last_bos'] = {
                    'type': 'BULLISH',
                    'level': round(last_sh['price'], 6),
                    'index': last_sh['index'],
                }
            elif result['structure'] == 'BEARISH' and current_price < last_sl['price']:
                result['last_bos'] = {
                    'type': 'BEARISH',
                    'level': round(last_sl['price'], 6),
                    'index': last_sl['index'],
                }

            # CHoCH: break against the existing trend (first sign of reversal)
            if result['structure'] == 'BULLISH' and current_price < last_sl['price']:
                result['last_choch'] = {
                    'type': 'BEARISH',
                    'level': round(last_sl['price'], 6),
                    'index': last_sl['index'],
                }
            elif result['structure'] == 'BEARISH' and current_price > last_sh['price']:
                result['last_choch'] = {
                    'type': 'BULLISH',
                    'level': round(last_sh['price'], 6),
                    'index': last_sh['index'],
                }

        return result

    def detect_liquidity_sweeps(self, df: pd.DataFrame, lookback: int = 30) -> Dict:
        """
        Detect liquidity sweeps where price wicks past a swing level then
        reverses, indicating institutional liquidity grabs.

        Returns:
            Dict with bullish_sweeps and bearish_sweeps lists.
        """
        result: Dict[str, list] = {'bullish_sweeps': [], 'bearish_sweeps': []}
        if len(df) < lookback:
            return result

        recent = df.tail(lookback).reset_index(drop=True)
        window = 5

        # Gather swing highs and swing lows
        swing_highs: List[float] = []
        for i in range(window, len(recent) - window - 1):
            if recent['high'].iloc[i] == recent['high'].iloc[i - window:i + window + 1].max():
                swing_highs.append(float(recent['high'].iloc[i]))

        swing_lows: List[float] = []
        for i in range(window, len(recent) - window - 1):
            if recent['low'].iloc[i] == recent['low'].iloc[i - window:i + window + 1].min():
                swing_lows.append(float(recent['low'].iloc[i]))

        # Check the most recent candles for sweeps
        check_range = min(5, len(recent) - 1)
        for j in range(1, check_range + 1):
            candle = recent.iloc[-j]
            candle_low = float(candle['low'])
            candle_high = float(candle['high'])
            candle_close = float(candle['close'])
            candle_open = float(candle['open'])

            # Bullish sweep: wick below swing low, but close recovered above
            for sl in swing_lows:
                if candle_low < sl and candle_close > sl:
                    result['bullish_sweeps'].append({
                        'level': round(sl, 6),
                        'wick_low': round(candle_low, 6),
                        'recovery': True,
                    })

            # Bearish sweep: wick above swing high, but close recovered below
            for sh in swing_highs:
                if candle_high > sh and candle_close < sh:
                    result['bearish_sweeps'].append({
                        'level': round(sh, 6),
                        'wick_high': round(candle_high, 6),
                        'recovery': True,
                    })

        # Deduplicate by level and keep most recent
        seen_bull: set = set()
        unique_bull: list = []
        for s in result['bullish_sweeps']:
            if s['level'] not in seen_bull:
                seen_bull.add(s['level'])
                unique_bull.append(s)
        result['bullish_sweeps'] = unique_bull[-3:]

        seen_bear: set = set()
        unique_bear: list = []
        for s in result['bearish_sweeps']:
            if s['level'] not in seen_bear:
                seen_bear.add(s['level'])
                unique_bear.append(s)
        result['bearish_sweeps'] = unique_bear[-3:]

        return result

    def detect_supply_demand_zones(self, df: pd.DataFrame, lookback: int = 60) -> List[Dict]:
        """
        Detect supply and demand zones — areas where price consolidated
        briefly then made a strong directional move.

        Returns:
            List of zone dicts with type, top, bottom, strength (1-5), and tests.
        """
        zones: List[Dict] = []
        if len(df) < lookback:
            return zones

        recent = df.tail(lookback).reset_index(drop=True)
        atr = self.calculate_atr(df).iloc[-1] if len(df) >= 14 else 0
        current_price = float(recent['close'].iloc[-1])

        if atr == 0:
            return zones

        for i in range(3, len(recent) - 3):
            # Look for consolidation (small range) followed by a strong move
            consol_range = float(recent['high'].iloc[i] - recent['low'].iloc[i])

            # Consolidation: candle range < 0.5 * ATR
            if consol_range > atr * 0.5:
                continue

            # Check for strong move after the consolidation candle
            next_candles = recent.iloc[i + 1:i + 4]
            if len(next_candles) < 3:
                continue

            move_up = float(next_candles['close'].iloc[-1] - recent['close'].iloc[i])
            move_down = float(recent['close'].iloc[i] - next_candles['close'].iloc[-1])

            zone_top = round(float(recent['high'].iloc[i]), 6)
            zone_bottom = round(float(recent['low'].iloc[i]), 6)

            # Demand zone: consolidation then strong move up
            if move_up > atr * 1.5:
                strength = min(5, int(move_up / atr))
                # Count how many times price revisited this zone
                tests = 0
                for k in range(i + 4, len(recent)):
                    if recent['low'].iloc[k] <= zone_top and recent['low'].iloc[k] >= zone_bottom:
                        tests += 1
                zones.append({
                    'type': 'demand',
                    'top': zone_top,
                    'bottom': zone_bottom,
                    'strength': max(1, strength),
                    'tests': tests,
                })

            # Supply zone: consolidation then strong move down
            elif move_down > atr * 1.5:
                strength = min(5, int(move_down / atr))
                tests = 0
                for k in range(i + 4, len(recent)):
                    if recent['high'].iloc[k] >= zone_bottom and recent['high'].iloc[k] <= zone_top:
                        tests += 1
                zones.append({
                    'type': 'supply',
                    'top': zone_top,
                    'bottom': zone_bottom,
                    'strength': max(1, strength),
                    'tests': tests,
                })

        # Deduplicate overlapping zones — keep strongest, limit to 5
        zones.sort(key=lambda z: z['strength'], reverse=True)
        return zones[:5]

    def calculate_smc_signal(self, df: pd.DataFrame, order_blocks: Dict,
                             fvgs: Dict, market_structure: Dict,
                             liquidity_sweeps: Dict,
                             sd_zones: List[Dict]) -> float:
        """
        Produce a Smart Money Concepts signal score from -5 to +5.

        Scoring logic:
            - Bullish OB near price + bullish structure + bullish FVG  -> strong buy
            - Bearish OB near price + bearish structure + bearish FVG  -> strong sell
            - Liquidity sweep + reversal                               -> mean reversion

        Returns:
            Float score from -5.0 to +5.0
        """
        score = 0.0
        if len(df) < 14:
            return score

        current_price = float(df['close'].iloc[-1])
        atr = float(self.calculate_atr(df).iloc[-1])
        if atr == 0:
            return score

        # --- Market structure bias: +/- 1.5 ---
        structure = market_structure.get('structure', 'RANGING')
        if structure == 'BULLISH':
            score += 1.5
        elif structure == 'BEARISH':
            score -= 1.5

        # BOS confirmation adds 0.5 in trend direction
        bos = market_structure.get('last_bos')
        if bos:
            score += 0.5 if bos['type'] == 'BULLISH' else -0.5

        # CHoCH (reversal warning) adds 0.5 against current trend
        choch = market_structure.get('last_choch')
        if choch:
            score += 0.5 if choch['type'] == 'BULLISH' else -0.5

        # --- Order blocks near price: +/- 1.0 ---
        for ob in order_blocks.get('bullish', []):
            if abs(current_price - ob['top']) < atr * 2:
                score += min(1.0, ob.get('strength', 1) * 0.3)
                break  # only count nearest
        for ob in order_blocks.get('bearish', []):
            if abs(current_price - ob['bottom']) < atr * 2:
                score -= min(1.0, ob.get('strength', 1) * 0.3)
                break

        # --- Fair value gaps: +/- 0.75 ---
        if fvgs.get('bullish'):
            # Nearest unfilled bullish FVG below price acts as magnet / support
            score += 0.75
        if fvgs.get('bearish'):
            score -= 0.75

        # --- Liquidity sweeps: +/- 1.0 (mean reversion) ---
        if liquidity_sweeps.get('bullish_sweeps'):
            score += 1.0  # swept lows then recovered = bullish
        if liquidity_sweeps.get('bearish_sweeps'):
            score -= 1.0  # swept highs then recovered = bearish

        # --- Supply/demand zones near price: +/- 0.25 ---
        for zone in sd_zones:
            zone_mid = (zone['top'] + zone['bottom']) / 2
            if abs(current_price - zone_mid) < atr * 2:
                if zone['type'] == 'demand':
                    score += 0.25
                else:
                    score -= 0.25

        return round(max(-5.0, min(5.0, score)), 1)

    # ---------------------------------------------------------------
    # Price Action Patterns & Advanced Indicators
    # ---------------------------------------------------------------

    def detect_candlestick_patterns(self, df: pd.DataFrame) -> Dict:
        """Detect candlestick patterns for trade signals."""
        patterns = {}
        if len(df) < 5:
            return patterns

        c = df.iloc[-1]   # current
        p = df.iloc[-2]   # previous
        pp = df.iloc[-3]  # 2 bars ago

        body = abs(c['close'] - c['open'])
        upper_wick = c['high'] - max(c['close'], c['open'])
        lower_wick = min(c['close'], c['open']) - c['low']
        total_range = c['high'] - c['low']

        if total_range == 0:
            return patterns

        # Hammer (bullish): small body at top, long lower wick (>2x body)
        patterns['hammer'] = (lower_wick > body * 2 and upper_wick < body * 0.5
                              and c['close'] > c['open'] and total_range > 0)

        # Shooting Star (bearish): small body at bottom, long upper wick
        patterns['shooting_star'] = (upper_wick > body * 2 and lower_wick < body * 0.5
                                      and c['close'] < c['open'])

        # Bullish Engulfing: current green candle body fully engulfs previous red body
        patterns['bullish_engulfing'] = (p['close'] < p['open'] and c['close'] > c['open']
                                          and c['close'] > p['open'] and c['open'] < p['close'])

        # Bearish Engulfing
        patterns['bearish_engulfing'] = (p['close'] > p['open'] and c['close'] < c['open']
                                          and c['open'] > p['close'] and c['close'] < p['open'])

        # Doji: body is < 10% of total range
        patterns['doji'] = body < total_range * 0.1

        # Morning Star (bullish 3-candle): big red, small body, big green
        pp_body = abs(pp['close'] - pp['open'])
        p_body = abs(p['close'] - p['open'])
        pp_range = pp['high'] - pp['low']
        patterns['morning_star'] = (pp['close'] < pp['open'] and pp_body > pp_range * 0.5
                                     and p_body < pp_body * 0.3
                                     and c['close'] > c['open'] and body > pp_body * 0.5)

        # Evening Star (bearish 3-candle)
        patterns['evening_star'] = (pp['close'] > pp['open'] and pp_body > pp_range * 0.5
                                     and p_body < pp_body * 0.3
                                     and c['close'] < c['open'] and body > pp_body * 0.5)

        # Inside Bar: current bar's range is within previous bar's range
        patterns['inside_bar'] = (c['high'] <= p['high'] and c['low'] >= p['low'])

        # Pin Bar: very long wick on one side (>66% of range), small body
        patterns['bullish_pin_bar'] = (lower_wick > total_range * 0.66 and body < total_range * 0.2)
        patterns['bearish_pin_bar'] = (upper_wick > total_range * 0.66 and body < total_range * 0.2)

        # Three White Soldiers (3 consecutive bullish candles with higher closes)
        if len(df) >= 4:
            last3 = df.iloc[-3:]
            patterns['three_white_soldiers'] = all(
                last3.iloc[i]['close'] > last3.iloc[i]['open'] and
                (i == 0 or last3.iloc[i]['close'] > last3.iloc[i-1]['close'])
                for i in range(3)
            )
            patterns['three_black_crows'] = all(
                last3.iloc[i]['close'] < last3.iloc[i]['open'] and
                (i == 0 or last3.iloc[i]['close'] < last3.iloc[i-1]['close'])
                for i in range(3)
            )

        return patterns

    def detect_chart_patterns(self, df: pd.DataFrame, lookback: int = 60) -> Dict:
        """
        Detect higher-level chart patterns using swing high/low detection.

        Patterns detected: double_top, double_bottom, head_and_shoulders,
        rising_wedge, falling_wedge, bull_flag, bear_flag.

        Returns:
            Dict with pattern name -> {detected: bool, levels: dict}
        """
        result = {}
        if len(df) < lookback:
            lookback = len(df)
        if lookback < 20:
            return result

        recent = df.tail(lookback).copy().reset_index(drop=True)
        highs = recent['high']
        lows = recent['low']
        closes = recent['close']

        swing_high_idx = self._find_peaks(highs, order=5)
        swing_low_idx = self._find_troughs(lows, order=5)

        tolerance = 0.005  # 0.5% tolerance for "similar" levels

        # ── Double Top ──
        result['double_top'] = {'detected': False, 'levels': {}}
        if len(swing_high_idx) >= 2:
            h1 = highs.iloc[swing_high_idx[-2]]
            h2 = highs.iloc[swing_high_idx[-1]]
            if abs(h1 - h2) / max(h1, 1e-9) < tolerance:
                trough_between = lows.iloc[swing_high_idx[-2]:swing_high_idx[-1]+1].min()
                result['double_top'] = {
                    'detected': True,
                    'levels': {'peak1': round(float(h1), 6), 'peak2': round(float(h2), 6),
                               'neckline': round(float(trough_between), 6)},
                }

        # ── Double Bottom ──
        result['double_bottom'] = {'detected': False, 'levels': {}}
        if len(swing_low_idx) >= 2:
            l1 = lows.iloc[swing_low_idx[-2]]
            l2 = lows.iloc[swing_low_idx[-1]]
            if abs(l1 - l2) / max(abs(l1), 1e-9) < tolerance:
                peak_between = highs.iloc[swing_low_idx[-2]:swing_low_idx[-1]+1].max()
                result['double_bottom'] = {
                    'detected': True,
                    'levels': {'trough1': round(float(l1), 6), 'trough2': round(float(l2), 6),
                               'neckline': round(float(peak_between), 6)},
                }

        # ── Head and Shoulders ──
        result['head_and_shoulders'] = {'detected': False, 'levels': {}}
        if len(swing_high_idx) >= 3:
            left = highs.iloc[swing_high_idx[-3]]
            head = highs.iloc[swing_high_idx[-2]]
            right = highs.iloc[swing_high_idx[-1]]
            if head > left and head > right and abs(left - right) / max(left, 1e-9) < tolerance * 2:
                result['head_and_shoulders'] = {
                    'detected': True,
                    'levels': {'left_shoulder': round(float(left), 6),
                               'head': round(float(head), 6),
                               'right_shoulder': round(float(right), 6)},
                }

        # ── Rising Wedge (bearish) ──
        result['rising_wedge'] = {'detected': False, 'levels': {}}
        if len(swing_high_idx) >= 2 and len(swing_low_idx) >= 2:
            hh = highs.iloc[swing_high_idx[-1]] > highs.iloc[swing_high_idx[-2]]
            hl = lows.iloc[swing_low_idx[-1]] > lows.iloc[swing_low_idx[-2]]
            high_diff = highs.iloc[swing_high_idx[-1]] - highs.iloc[swing_high_idx[-2]]
            low_diff = lows.iloc[swing_low_idx[-1]] - lows.iloc[swing_low_idx[-2]]
            if hh and hl and low_diff > high_diff > 0:
                result['rising_wedge'] = {'detected': True, 'levels': {
                    'upper_start': round(float(highs.iloc[swing_high_idx[-2]]), 6),
                    'upper_end': round(float(highs.iloc[swing_high_idx[-1]]), 6),
                    'lower_start': round(float(lows.iloc[swing_low_idx[-2]]), 6),
                    'lower_end': round(float(lows.iloc[swing_low_idx[-1]]), 6),
                }}

        # ── Falling Wedge (bullish) ──
        result['falling_wedge'] = {'detected': False, 'levels': {}}
        if len(swing_high_idx) >= 2 and len(swing_low_idx) >= 2:
            lh = highs.iloc[swing_high_idx[-1]] < highs.iloc[swing_high_idx[-2]]
            ll = lows.iloc[swing_low_idx[-1]] < lows.iloc[swing_low_idx[-2]]
            high_diff = highs.iloc[swing_high_idx[-2]] - highs.iloc[swing_high_idx[-1]]
            low_diff = lows.iloc[swing_low_idx[-2]] - lows.iloc[swing_low_idx[-1]]
            if lh and ll and low_diff > high_diff > 0:
                result['falling_wedge'] = {'detected': True, 'levels': {
                    'upper_start': round(float(highs.iloc[swing_high_idx[-2]]), 6),
                    'upper_end': round(float(highs.iloc[swing_high_idx[-1]]), 6),
                    'lower_start': round(float(lows.iloc[swing_low_idx[-2]]), 6),
                    'lower_end': round(float(lows.iloc[swing_low_idx[-1]]), 6),
                }}

        # ── Bull Flag: strong up move followed by slight downward consolidation ──
        result['bull_flag'] = {'detected': False, 'levels': {}}
        if len(recent) >= 20:
            pole = recent.iloc[:lookback // 2]
            flag = recent.iloc[lookback // 2:]
            pole_move = (pole['close'].iloc[-1] - pole['close'].iloc[0]) / max(abs(pole['close'].iloc[0]), 1e-9)
            flag_move = (flag['close'].iloc[-1] - flag['close'].iloc[0]) / max(abs(flag['close'].iloc[0]), 1e-9)
            if pole_move > 0.02 and -0.02 < flag_move < 0:
                result['bull_flag'] = {'detected': True, 'levels': {
                    'pole_start': round(float(pole['close'].iloc[0]), 6),
                    'pole_end': round(float(pole['close'].iloc[-1]), 6),
                    'flag_low': round(float(flag['low'].min()), 6),
                }}

        # ── Bear Flag: strong down move followed by slight upward consolidation ──
        result['bear_flag'] = {'detected': False, 'levels': {}}
        if len(recent) >= 20:
            pole = recent.iloc[:lookback // 2]
            flag = recent.iloc[lookback // 2:]
            pole_move = (pole['close'].iloc[-1] - pole['close'].iloc[0]) / max(abs(pole['close'].iloc[0]), 1e-9)
            flag_move = (flag['close'].iloc[-1] - flag['close'].iloc[0]) / max(abs(flag['close'].iloc[0]), 1e-9)
            if pole_move < -0.02 and 0 < flag_move < 0.02:
                result['bear_flag'] = {'detected': True, 'levels': {
                    'pole_start': round(float(pole['close'].iloc[0]), 6),
                    'pole_end': round(float(pole['close'].iloc[-1]), 6),
                    'flag_high': round(float(flag['high'].max()), 6),
                }}

        return result

    def calculate_fibonacci_levels(self, df: pd.DataFrame, lookback: int = 60) -> Dict:
        """
        Auto-detect the most recent significant swing and calculate Fibonacci
        retracement levels (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%).

        Returns:
            Dict with swing_high, swing_low, direction, levels, current_fib_zone
        """
        if len(df) < 10:
            return {}

        window = df.tail(lookback)
        swing_high = float(window['high'].max())
        swing_low = float(window['low'].min())
        high_idx = window['high'].idxmax()
        low_idx = window['low'].idxmin()

        diff = swing_high - swing_low
        if diff == 0:
            return {}

        # Direction: if the high came after the low the swing is UP, else DOWN
        direction = 'UP' if high_idx > low_idx else 'DOWN'

        fib_ratios = {'0.0': 0.0, '0.236': 0.236, '0.382': 0.382,
                      '0.5': 0.5, '0.618': 0.618, '0.786': 0.786, '1.0': 1.0}

        if direction == 'UP':
            # Retracement from high: level = high - ratio * diff
            levels = {k: round(swing_high - v * diff, 6) for k, v in fib_ratios.items()}
        else:
            # Retracement from low: level = low + ratio * diff
            levels = {k: round(swing_low + v * diff, 6) for k, v in fib_ratios.items()}

        # Determine current fib zone (nearest level within 0.5%)
        current_price = float(df['close'].iloc[-1])
        current_fib_zone = None
        min_dist = float('inf')
        for label, level in levels.items():
            pct_dist = abs(current_price - level) / max(abs(current_price), 1e-9)
            if pct_dist < 0.005 and pct_dist < min_dist:
                min_dist = pct_dist
                current_fib_zone = label

        return {
            'swing_high': round(swing_high, 6),
            'swing_low': round(swing_low, 6),
            'direction': direction,
            'levels': levels,
            'current_fib_zone': current_fib_zone,
        }

    def calculate_vwap(self, df: pd.DataFrame) -> Optional[pd.Series]:
        """Calculate VWAP (Volume Weighted Average Price)."""
        if 'volume' not in df.columns or df['volume'].sum() == 0:
            return None
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        vwap = (typical_price * df['volume']).cumsum() / df['volume'].cumsum()
        return vwap

    def calculate_stochastic_rsi(self, df: pd.DataFrame, rsi_period: int = 14,
                                  stoch_period: int = 14, k_period: int = 3,
                                  d_period: int = 3) -> Tuple[pd.Series, pd.Series]:
        """Calculate Stochastic RSI — more sensitive than regular RSI."""
        rsi = self.calculate_rsi(df['close'], rsi_period)
        rsi_min = rsi.rolling(stoch_period).min()
        rsi_max = rsi.rolling(stoch_period).max()
        stoch_rsi = (rsi - rsi_min) / (rsi_max - rsi_min)
        k = stoch_rsi.rolling(k_period).mean() * 100
        d = k.rolling(d_period).mean()
        return k, d

    def calculate_adx(self, df: pd.DataFrame, period: int = 14) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        Calculate Average Directional Index — measures trend STRENGTH.

        ADX > 25 = trending, > 50 = strong trend, < 20 = ranging.
        """
        high, low, close = df['high'], df['low'], df['close']
        plus_dm = high.diff().clip(lower=0)
        minus_dm = (-low.diff()).clip(lower=0)
        # When plus_dm > minus_dm, set minus_dm to 0 and vice versa
        plus_dm[plus_dm < minus_dm] = 0
        minus_dm[minus_dm < plus_dm] = 0

        tr = pd.concat([high - low, abs(high - close.shift()), abs(low - close.shift())], axis=1).max(axis=1)
        atr = tr.rolling(period).mean()

        plus_di = 100 * (plus_dm.rolling(period).mean() / atr)
        minus_di = 100 * (minus_dm.rolling(period).mean() / atr)
        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di)
        adx = dx.rolling(period).mean()
        return adx, plus_di, minus_di

    def calculate_supertrend(self, df: pd.DataFrame, period: int = 10,
                              multiplier: int = 3) -> Tuple[pd.Series, pd.Series]:
        """Calculate Supertrend — trend following indicator."""
        atr = self.calculate_atr(df, period)
        hl2 = (df['high'] + df['low']) / 2
        upper_band = hl2 + multiplier * atr
        lower_band = hl2 - multiplier * atr

        supertrend = pd.Series(index=df.index, dtype=float)
        direction = pd.Series(index=df.index, dtype=int)

        supertrend.iloc[0] = upper_band.iloc[0]
        direction.iloc[0] = -1

        for i in range(1, len(df)):
            if df['close'].iloc[i] > upper_band.iloc[i-1]:
                direction.iloc[i] = 1
                supertrend.iloc[i] = lower_band.iloc[i]
            elif df['close'].iloc[i] < lower_band.iloc[i-1]:
                direction.iloc[i] = -1
                supertrend.iloc[i] = upper_band.iloc[i]
            else:
                direction.iloc[i] = direction.iloc[i-1]
                if direction.iloc[i] == 1:
                    supertrend.iloc[i] = max(lower_band.iloc[i], supertrend.iloc[i-1])
                else:
                    supertrend.iloc[i] = min(upper_band.iloc[i], supertrend.iloc[i-1])

        return supertrend, direction

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
                logger.info(f"JARVIS scanning {pair_name} {tf_name}...")
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

                tf_result = {
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

                # Calculate signal strength for this timeframe
                tf_result['signal_strength'] = self.calculate_signal_strength(tf_result)

                # Smart Money Concepts analysis
                try:
                    order_blocks = self.detect_order_blocks(df)
                except Exception as e:
                    logger.warning(f"SMC order_blocks error on {pair_name} {tf_name}: {e}")
                    order_blocks = {'bullish': [], 'bearish': []}

                try:
                    fvgs = self.detect_fair_value_gaps(df)
                except Exception as e:
                    logger.warning(f"SMC FVG error on {pair_name} {tf_name}: {e}")
                    fvgs = {'bullish': [], 'bearish': []}

                try:
                    market_structure = self.detect_market_structure(df)
                except Exception as e:
                    logger.warning(f"SMC market_structure error on {pair_name} {tf_name}: {e}")
                    market_structure = {'structure': 'RANGING', 'swing_highs': [], 'swing_lows': [], 'last_bos': None, 'last_choch': None}

                try:
                    liquidity_sweeps = self.detect_liquidity_sweeps(df)
                except Exception as e:
                    logger.warning(f"SMC liquidity_sweeps error on {pair_name} {tf_name}: {e}")
                    liquidity_sweeps = {'bullish_sweeps': [], 'bearish_sweeps': []}

                try:
                    sd_zones = self.detect_supply_demand_zones(df)
                except Exception as e:
                    logger.warning(f"SMC supply_demand_zones error on {pair_name} {tf_name}: {e}")
                    sd_zones = []

                tf_result['order_blocks'] = order_blocks
                tf_result['fair_value_gaps'] = fvgs
                tf_result['market_structure'] = market_structure
                tf_result['liquidity_sweeps'] = liquidity_sweeps
                tf_result['supply_demand_zones'] = sd_zones

                try:
                    tf_result['smc_signal'] = self.calculate_smc_signal(
                        df, order_blocks, fvgs, market_structure,
                        liquidity_sweeps, sd_zones
                    )
                except Exception as e:
                    logger.warning(f"SMC signal calc error on {pair_name} {tf_name}: {e}")
                    tf_result['smc_signal'] = 0.0

                # Price Action Patterns & Advanced Indicators
                try:
                    candlestick_patterns = self.detect_candlestick_patterns(df)
                except Exception as e:
                    logger.warning(f"Candlestick patterns error on {pair_name} {tf_name}: {e}")
                    candlestick_patterns = {}
                tf_result['candlestick_patterns'] = candlestick_patterns

                try:
                    chart_patterns = self.detect_chart_patterns(df)
                except Exception as e:
                    logger.warning(f"Chart patterns error on {pair_name} {tf_name}: {e}")
                    chart_patterns = {}
                tf_result['chart_patterns'] = chart_patterns

                try:
                    fib_levels = self.calculate_fibonacci_levels(df)
                except Exception as e:
                    logger.warning(f"Fibonacci error on {pair_name} {tf_name}: {e}")
                    fib_levels = {}
                tf_result['fibonacci'] = fib_levels

                try:
                    vwap = self.calculate_vwap(df)
                    vwap_current = round(float(vwap.iloc[-1]), 6) if vwap is not None else None
                except Exception as e:
                    logger.warning(f"VWAP error on {pair_name} {tf_name}: {e}")
                    vwap_current = None
                tf_result['vwap'] = vwap_current

                try:
                    stoch_k, stoch_d = self.calculate_stochastic_rsi(df)
                    tf_result['stochastic_rsi'] = {
                        'k': round(float(stoch_k.iloc[-1]), 2) if not pd.isna(stoch_k.iloc[-1]) else None,
                        'd': round(float(stoch_d.iloc[-1]), 2) if not pd.isna(stoch_d.iloc[-1]) else None,
                    }
                except Exception as e:
                    logger.warning(f"Stochastic RSI error on {pair_name} {tf_name}: {e}")
                    tf_result['stochastic_rsi'] = {'k': None, 'd': None}

                try:
                    adx, plus_di, minus_di = self.calculate_adx(df)
                    tf_result['adx'] = {
                        'adx': round(float(adx.iloc[-1]), 2) if not pd.isna(adx.iloc[-1]) else None,
                        'plus_di': round(float(plus_di.iloc[-1]), 2) if not pd.isna(plus_di.iloc[-1]) else None,
                        'minus_di': round(float(minus_di.iloc[-1]), 2) if not pd.isna(minus_di.iloc[-1]) else None,
                    }
                except Exception as e:
                    logger.warning(f"ADX error on {pair_name} {tf_name}: {e}")
                    tf_result['adx'] = {'adx': None, 'plus_di': None, 'minus_di': None}

                try:
                    supertrend, st_direction = self.calculate_supertrend(df)
                    tf_result['supertrend'] = {
                        'value': round(float(supertrend.iloc[-1]), 6) if not pd.isna(supertrend.iloc[-1]) else None,
                        'direction': int(st_direction.iloc[-1]) if not pd.isna(st_direction.iloc[-1]) else None,
                        'signal': 'BUY' if not pd.isna(st_direction.iloc[-1]) and int(st_direction.iloc[-1]) == 1 else 'SELL',
                    }
                except Exception as e:
                    logger.warning(f"Supertrend error on {pair_name} {tf_name}: {e}")
                    tf_result['supertrend'] = {'value': None, 'direction': None, 'signal': None}

                analysis['timeframes'][tf_name] = tf_result

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

    analyzer = IronMan()
    results = {}

    for pair in pairs:
        yf_ticker = PAIRS[pair]
        results[pair] = analyzer.analyze_pair(pair, yf_ticker)

    return {
        'status': 'success',
        'pairs': results,
    }


def format_report(analysis: Dict) -> str:
    """
    Format technical analysis as clean Telegram markdown text.
    JARVIS-style tactical scan report.

    Args:
        analysis: Dict returned by analyze()

    Returns:
        Formatted string suitable for Telegram
    """
    if not analysis:
        return "No analysis available"

    # Handle both wrapped {'status': ..., 'pairs': {...}} and raw dict formats
    if 'pairs' in analysis and 'status' in analysis:
        pairs_data = analysis['pairs']
    else:
        pairs_data = analysis

    report = "🦾 *JARVIS TACTICAL SCAN*\n"
    report += f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC\n"
    report += f"_{PERSONA}_\n\n"

    for pair, data in pairs_data.items():
        if data.get('error'):
            report += f"❌ *{pair}*: Suit malfunction - {data['error']}\n\n"
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

    report += "_And that's the scan, boss. You're welcome. -- Tony Stark_"

    return report


if __name__ == '__main__':
    # Example usage
    logger.info("Stark Industries technical analysis powering up...")

    # Analyze all pairs
    results = analyze()

    # Format and print report (format_report accepts the wrapped dict)
    report = format_report(results)
    print(report)

    # Also save to file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    report_file = f'/tmp/iron_man_scan_{timestamp}.txt'
    with open(report_file, 'w') as f:
        f.write(report)

    logger.info(f"Report saved to {report_file}")
