"""
Vision - Order Flow / Liquidity Agent for Forex/Crypto Scalper Bot

"I am not what you think I am. I see the flow beneath the surface."

Analyzes order book depth, volume profile, open interest, and liquidation levels
to understand institutional positioning and liquidity dynamics.

Data Sources:
  - Binance public REST API (spot + futures)
  - yfinance for volume profile calculations

Crypto only: BTCUSD, ETHUSD, SOLUSD (forex pairs lack public order book data)
"""

import logging
import warnings
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
import yfinance as yf

# Suppress yfinance warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('vision')

PERSONA = "I am not what you think I am. I see the flow beneath the surface."

# Crypto pairs only — forex has no public order book data
CRYPTO_PAIRS = ['BTCUSD', 'ETHUSD', 'SOLUSD']

# Common leverage levels for liquidation estimation
LEVERAGE_LEVELS = [5, 10, 25, 50, 100]

REQUEST_TIMEOUT = 10


class Vision:
    """Vision sees the order flow beneath the surface."""

    TICKER_MAP = {
        'BTCUSD': {'binance': 'BTCUSDT', 'binance_futures': 'BTCUSDT', 'yfinance': 'BTC-USD'},
        'ETHUSD': {'binance': 'ETHUSDT', 'binance_futures': 'ETHUSDT', 'yfinance': 'ETH-USD'},
        'SOLUSD': {'binance': 'SOLUSDT', 'binance_futures': 'SOLUSDT', 'yfinance': 'SOL-USD'},
    }

    BINANCE_BASE = 'https://api.binance.com'
    BINANCE_FUTURES = 'https://fapi.binance.com'

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'VisionAgent/1.0'})
        self._price_cache: Dict[str, float] = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_binance_symbol(self, pair: str) -> Optional[str]:
        """Return the Binance spot symbol for a pair, or None."""
        mapping = self.TICKER_MAP.get(pair)
        return mapping['binance'] if mapping else None

    def _get_futures_symbol(self, pair: str) -> Optional[str]:
        """Return the Binance futures symbol for a pair, or None."""
        mapping = self.TICKER_MAP.get(pair)
        return mapping['binance_futures'] if mapping else None

    def _get_yfinance_symbol(self, pair: str) -> Optional[str]:
        """Return the yfinance ticker for a pair, or None."""
        mapping = self.TICKER_MAP.get(pair)
        return mapping['yfinance'] if mapping else None

    def _is_crypto(self, pair: str) -> bool:
        return pair in self.TICKER_MAP

    def _fetch_current_price(self, pair: str) -> Optional[float]:
        """Fetch the current price from Binance spot ticker."""
        if pair in self._price_cache:
            return self._price_cache[pair]
        symbol = self._get_binance_symbol(pair)
        if not symbol:
            return None
        try:
            resp = self.session.get(
                f'{self.BINANCE_BASE}/api/v3/ticker/price',
                params={'symbol': symbol},
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            price = float(resp.json()['price'])
            self._price_cache[pair] = price
            return price
        except Exception as exc:
            logger.warning(f"[Vision] Price fetch failed for {pair}: {exc}")
            return None

    # ------------------------------------------------------------------
    # 1. Order Book Analysis
    # ------------------------------------------------------------------

    def analyze_order_book(self, symbol: str) -> Optional[Dict]:
        """
        Fetch top 100 bids/asks from Binance and compute:
          - bid/ask ratio
          - largest bid/ask walls
          - order book imbalance %
          - buy-pressure label
        """
        binance_sym = self._get_binance_symbol(symbol)
        if not binance_sym:
            logger.info(f"[Vision] Order book: no mapping for {symbol}")
            return None

        try:
            resp = self.session.get(
                f'{self.BINANCE_BASE}/api/v3/depth',
                params={'symbol': binance_sym, 'limit': 100},
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.error(f"[Vision] Order book fetch failed for {symbol}: {exc}")
            return None

        try:
            bids = [(float(p), float(q)) for p, q in data.get('bids', [])]
            asks = [(float(p), float(q)) for p, q in data.get('asks', [])]

            if not bids or not asks:
                logger.warning(f"[Vision] Empty order book for {symbol}")
                return None

            total_bid_qty = sum(q for _, q in bids)
            total_ask_qty = sum(q for _, q in asks)

            bid_ask_ratio = round(total_bid_qty / total_ask_qty, 4) if total_ask_qty > 0 else 0.0

            # Pressure label
            if bid_ask_ratio >= 1.5:
                pressure = 'STRONG_BUY'
            elif bid_ask_ratio >= 1.2:
                pressure = 'MODERATE_BUY'
            elif bid_ask_ratio <= 0.67:
                pressure = 'STRONG_SELL'
            elif bid_ask_ratio <= 0.8:
                pressure = 'MODERATE_SELL'
            else:
                pressure = 'NEUTRAL'

            # Largest walls
            largest_bid = max(bids, key=lambda x: x[1])
            largest_ask = max(asks, key=lambda x: x[1])

            # Imbalance %
            imbalance_pct = round(
                (total_bid_qty - total_ask_qty) / (total_bid_qty + total_ask_qty) * 100, 2
            ) if (total_bid_qty + total_ask_qty) > 0 else 0.0

            return {
                'bid_ask_ratio': bid_ask_ratio,
                'buy_pressure': pressure,
                'total_bid_qty': round(total_bid_qty, 4),
                'total_ask_qty': round(total_ask_qty, 4),
                'largest_bid_wall': {'price': largest_bid[0], 'size': round(largest_bid[1], 4)},
                'largest_ask_wall': {'price': largest_ask[0], 'size': round(largest_ask[1], 4)},
                'imbalance_pct': imbalance_pct,
            }

        except Exception as exc:
            logger.error(f"[Vision] Order book analysis error for {symbol}: {exc}")
            return None

    # ------------------------------------------------------------------
    # 2. Volume Profile
    # ------------------------------------------------------------------

    def analyze_volume_profile(self, symbol: str) -> Optional[Dict]:
        """
        Build a volume profile from yfinance 1h data (last 7 days).
        Returns POC, VAH, VAL, VWAP, HVN, LVN.
        """
        yf_sym = self._get_yfinance_symbol(symbol)
        if not yf_sym:
            logger.info(f"[Vision] Volume profile: no yfinance mapping for {symbol}")
            return None

        try:
            ticker = yf.Ticker(yf_sym)
            df = ticker.history(period='7d', interval='1h')
            if df is None or df.empty or len(df) < 10:
                logger.warning(f"[Vision] Insufficient volume data for {symbol}")
                return None
        except Exception as exc:
            logger.error(f"[Vision] yfinance fetch failed for {symbol}: {exc}")
            return None

        try:
            # Build price-volume histogram
            price_min = df['Low'].min()
            price_max = df['High'].max()
            num_bins = 50
            bins = np.linspace(price_min, price_max, num_bins + 1)
            bin_centres = (bins[:-1] + bins[1:]) / 2
            vol_profile = np.zeros(num_bins)

            for _, row in df.iterrows():
                low, high, volume = row['Low'], row['High'], row['Volume']
                if volume <= 0 or np.isnan(volume):
                    continue
                mask = (bin_centres >= low) & (bin_centres <= high)
                count = mask.sum()
                if count > 0:
                    vol_profile[mask] += volume / count

            if vol_profile.sum() == 0:
                logger.warning(f"[Vision] Zero volume profile for {symbol}")
                return None

            # Point of Control — price with max volume
            poc_idx = int(np.argmax(vol_profile))
            poc = round(float(bin_centres[poc_idx]), 2)

            # Value Area (70% of total volume)
            total_vol = vol_profile.sum()
            target = total_vol * 0.70
            sorted_indices = np.argsort(vol_profile)[::-1]
            cumulative = 0.0
            va_indices = []
            for idx in sorted_indices:
                va_indices.append(idx)
                cumulative += vol_profile[idx]
                if cumulative >= target:
                    break
            va_indices_sorted = sorted(va_indices)
            val_price = round(float(bin_centres[va_indices_sorted[0]]), 2)
            vah_price = round(float(bin_centres[va_indices_sorted[-1]]), 2)

            # VWAP
            typical_price = (df['High'] + df['Low'] + df['Close']) / 3
            vwap = round(float((typical_price * df['Volume']).sum() / df['Volume'].sum()), 2)

            # High Volume Nodes (top 5 bins)
            hvn_indices = np.argsort(vol_profile)[-5:][::-1]
            hvn = [round(float(bin_centres[i]), 2) for i in hvn_indices]

            # Low Volume Nodes (bottom 5 non-zero bins)
            nonzero_mask = vol_profile > 0
            if nonzero_mask.sum() > 5:
                nonzero_vols = [(i, vol_profile[i]) for i in range(num_bins) if vol_profile[i] > 0]
                nonzero_vols.sort(key=lambda x: x[1])
                lvn = [round(float(bin_centres[i]), 2) for i, _ in nonzero_vols[:5]]
            else:
                lvn = []

            return {
                'poc': poc,
                'vah': vah_price,
                'val': val_price,
                'vwap': vwap,
                'hvn': hvn,
                'lvn': lvn,
            }

        except Exception as exc:
            logger.error(f"[Vision] Volume profile analysis error for {symbol}: {exc}")
            return None

    # ------------------------------------------------------------------
    # 3. Open Interest
    # ------------------------------------------------------------------

    def analyze_open_interest(self, symbol: str) -> Optional[Dict]:
        """
        Fetch open interest from Binance Futures and compute:
          - Current OI (in contracts)
          - 24h OI change %
          - Price-OI divergence signal
        """
        futures_sym = self._get_futures_symbol(symbol)
        if not futures_sym:
            logger.info(f"[Vision] OI: no futures mapping for {symbol}")
            return None

        try:
            # Current OI
            oi_resp = self.session.get(
                f'{self.BINANCE_FUTURES}/fapi/v1/openInterest',
                params={'symbol': futures_sym},
                timeout=REQUEST_TIMEOUT,
            )
            oi_resp.raise_for_status()
            oi_data = oi_resp.json()
            current_oi = float(oi_data.get('openInterest', 0))
        except Exception as exc:
            logger.error(f"[Vision] OI fetch failed for {symbol}: {exc}")
            return None

        try:
            # 24h futures ticker for price change and volume context
            ticker_resp = self.session.get(
                f'{self.BINANCE_FUTURES}/fapi/v1/ticker/24hr',
                params={'symbol': futures_sym},
                timeout=REQUEST_TIMEOUT,
            )
            ticker_resp.raise_for_status()
            ticker_data = ticker_resp.json()

            price_change_pct = float(ticker_data.get('priceChangePercent', 0))
            last_price = float(ticker_data.get('lastPrice', 0))
            quote_volume = float(ticker_data.get('quoteVolume', 0))
        except Exception as exc:
            logger.warning(f"[Vision] Futures ticker fetch failed for {symbol}: {exc}")
            price_change_pct = 0.0
            last_price = 0.0
            quote_volume = 0.0

        try:
            # Estimate OI change via recent klines (last 2 x 1d candles of OI)
            # Binance doesn't give historical OI on a single endpoint for free,
            # so we approximate by checking the futures 24h stats.
            # We'll use a simplified heuristic: compare volume to OI for flow.
            oi_value = current_oi * last_price if last_price else 0

            # Divergence: price up + OI flat/down = weak rally; price down + OI up = weak sell
            divergence = False
            signal = 'NEUTRAL'
            if price_change_pct > 1.5 and quote_volume > 0:
                # Price rising; if OI-to-volume ratio is low, could be short covering
                signal = 'BULLISH_CONFIRMATION'
            elif price_change_pct < -1.5:
                signal = 'BEARISH_CONFIRMATION'

            # Simple divergence flag (heuristic — OI alone can't confirm without history)
            if abs(price_change_pct) > 2.0:
                # Placeholder: with only current snapshot we flag when price moves sharply
                # but volume is below average (suggests low conviction)
                divergence = False  # conservative default

            return {
                'current_oi': current_oi,
                'current_oi_value_usd': round(oi_value, 2),
                'oi_change_24h_pct': None,  # requires historical endpoint / premium
                'price_change_24h_pct': round(price_change_pct, 2),
                'quote_volume_24h': round(quote_volume, 2),
                'price_oi_divergence': divergence,
                'signal': signal,
            }

        except Exception as exc:
            logger.error(f"[Vision] OI analysis error for {symbol}: {exc}")
            return None

    # ------------------------------------------------------------------
    # 4. Liquidation Level Estimation
    # ------------------------------------------------------------------

    def estimate_liquidation_levels(self, symbol: str, current_price: float) -> Optional[Dict]:
        """
        Estimate likely liquidation zones based on common leverage levels
        applied to recent swing highs/lows.

        Liquidation price for longs  ~ entry * (1 - 1/leverage)
        Liquidation price for shorts ~ entry * (1 + 1/leverage)

        We treat `current_price` as the average entry and compute
        liquidation bands for each leverage level.
        """
        if current_price is None or current_price <= 0:
            logger.warning(f"[Vision] Invalid price for liquidation calc: {current_price}")
            return None

        try:
            # Fetch recent swing high/low from yfinance 1h (24h window)
            yf_sym = self._get_yfinance_symbol(symbol)
            swing_high = current_price
            swing_low = current_price
            if yf_sym:
                try:
                    ticker = yf.Ticker(yf_sym)
                    df = ticker.history(period='2d', interval='1h')
                    if df is not None and not df.empty:
                        swing_high = float(df['High'].max())
                        swing_low = float(df['Low'].min())
                except Exception:
                    pass

            long_liquidations = []
            short_liquidations = []

            for lev in LEVERAGE_LEVELS:
                # Longs entered near swing high get liquidated below
                long_liq_price = round(swing_high * (1 - 1.0 / lev), 2)
                long_liquidations.append({
                    'price': long_liq_price,
                    'leverage': f'{lev}x',
                    'entry_reference': round(swing_high, 2),
                })

                # Shorts entered near swing low get liquidated above
                short_liq_price = round(swing_low * (1 + 1.0 / lev), 2)
                short_liquidations.append({
                    'price': short_liq_price,
                    'leverage': f'{lev}x',
                    'entry_reference': round(swing_low, 2),
                })

            # Sort: nearest long liq (highest price), nearest short liq (lowest price)
            long_liquidations.sort(key=lambda x: x['price'], reverse=True)
            short_liquidations.sort(key=lambda x: x['price'])

            nearest_long = long_liquidations[0]['price'] if long_liquidations else None
            nearest_short = short_liquidations[0]['price'] if short_liquidations else None

            # Flag magnet zones — where multiple leverage levels cluster
            all_liq_prices = [l['price'] for l in long_liquidations + short_liquidations]
            magnet_zones = []
            if all_liq_prices:
                price_range = max(all_liq_prices) - min(all_liq_prices)
                if price_range > 0:
                    cluster_threshold = price_range * 0.02  # 2% of range
                    sorted_prices = sorted(all_liq_prices)
                    for i in range(len(sorted_prices) - 1):
                        if sorted_prices[i + 1] - sorted_prices[i] < cluster_threshold:
                            midpoint = round((sorted_prices[i] + sorted_prices[i + 1]) / 2, 2)
                            if midpoint not in magnet_zones:
                                magnet_zones.append(midpoint)

            return {
                'long_liquidations': long_liquidations,
                'short_liquidations': short_liquidations,
                'nearest_long_liq': nearest_long,
                'nearest_short_liq': nearest_short,
                'magnet_zones': magnet_zones,
                'swing_high': round(swing_high, 2),
                'swing_low': round(swing_low, 2),
            }

        except Exception as exc:
            logger.error(f"[Vision] Liquidation estimation error for {symbol}: {exc}")
            return None

    # ------------------------------------------------------------------
    # 5. Main Analysis
    # ------------------------------------------------------------------

    def _derive_overall_signal(self, pair_data: Dict) -> str:
        """Combine sub-signals into an overall directional bias."""
        score = 0

        ob = pair_data.get('order_book')
        if ob:
            ratio = ob.get('bid_ask_ratio', 1.0)
            if ratio >= 1.2:
                score += 1
            elif ratio <= 0.8:
                score -= 1
            if ratio >= 1.5:
                score += 1
            elif ratio <= 0.67:
                score -= 1

        oi = pair_data.get('open_interest')
        if oi:
            sig = oi.get('signal', 'NEUTRAL')
            if sig == 'BULLISH_CONFIRMATION':
                score += 1
            elif sig == 'BEARISH_CONFIRMATION':
                score -= 1

        vp = pair_data.get('volume_profile')
        if vp and pair_data.get('_current_price'):
            price = pair_data['_current_price']
            poc = vp.get('poc', price)
            vwap = vp.get('vwap', price)
            if price > poc and price > vwap:
                score += 1
            elif price < poc and price < vwap:
                score -= 1

        if score >= 2:
            return 'BULLISH_PRESSURE'
        elif score <= -2:
            return 'BEARISH_PRESSURE'
        return 'NEUTRAL'

    def analyze(self, pairs: list = None) -> dict:
        """
        Run full order flow analysis on the given pairs.

        Args:
            pairs: List of pair codes, e.g. ['BTCUSD', 'ETHUSD'].
                   Defaults to all crypto pairs.

        Returns:
            Dict with 'status', 'timestamp', and per-pair analysis.
        """
        if pairs is None:
            pairs = list(CRYPTO_PAIRS)

        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        results: Dict[str, dict] = {}

        for pair in pairs:
            logger.info(f"[Vision] Analyzing {pair}...")

            # Forex guard
            if not self._is_crypto(pair):
                results[pair] = {
                    'note': 'Order flow data not available for forex pairs.',
                    'overall_signal': 'N/A',
                }
                continue

            try:
                current_price = self._fetch_current_price(pair)

                order_book = self.analyze_order_book(pair)
                volume_profile = self.analyze_volume_profile(pair)
                open_interest = self.analyze_open_interest(pair)
                liquidation_levels = (
                    self.estimate_liquidation_levels(pair, current_price)
                    if current_price else None
                )

                pair_data = {
                    'current_price': current_price,
                    'order_book': order_book,
                    'volume_profile': volume_profile,
                    'open_interest': open_interest,
                    'liquidation_levels': liquidation_levels,
                    '_current_price': current_price,  # for signal derivation
                }

                pair_data['overall_signal'] = self._derive_overall_signal(pair_data)
                # Remove internal key
                pair_data.pop('_current_price', None)

                results[pair] = pair_data

            except Exception as exc:
                logger.error(f"[Vision] Unexpected error analyzing {pair}: {exc}")
                results[pair] = {
                    'error': str(exc),
                    'overall_signal': 'ERROR',
                }

        return {
            'status': 'success',
            'timestamp': timestamp,
            'pairs': results,
        }

    # ------------------------------------------------------------------
    # 6. Telegram Report
    # ------------------------------------------------------------------

    def format_report(self, analysis: dict) -> str:
        """
        Format the analysis dict as a Telegram MarkdownV2 message.
        """

        def esc(text: str) -> str:
            """Escape MarkdownV2 special chars."""
            special = r'_*[]()~`>#+-=|{}.!'
            out = []
            for ch in str(text):
                if ch in special:
                    out.append(f'\\{ch}')
                else:
                    out.append(ch)
            return ''.join(out)

        lines: List[str] = []
        lines.append(f'*{esc("👁 VISION — Order Flow Report")}*')
        lines.append(f'_{esc(analysis.get("timestamp", ""))}_')
        lines.append('')

        for pair, data in analysis.get('pairs', {}).items():
            lines.append(f'*{esc(pair)}*')

            if 'note' in data:
                lines.append(f'  {esc(data["note"])}')
                lines.append('')
                continue

            if 'error' in data:
                lines.append(f'  {esc("Error: " + data["error"])}')
                lines.append('')
                continue

            price = data.get('current_price')
            if price:
                lines.append(f'  Price: `{esc(f"${price:,.2f}")}`')

            # Order book
            ob = data.get('order_book')
            if ob:
                lines.append(f'  *{esc("Order Book")}*')
                lines.append(f'    Bid/Ask Ratio: `{esc(str(ob["bid_ask_ratio"]))}`')
                lines.append(f'    Pressure: `{esc(ob["buy_pressure"])}`')
                lines.append(f'    Imbalance: `{esc(str(ob["imbalance_pct"]))}%`')
                bid_wall = ob.get('largest_bid_wall', {})
                ask_wall = ob.get('largest_ask_wall', {})
                if bid_wall:
                    bw_price = bid_wall['price']
                    bw_size = bid_wall['size']
                    lines.append(
                        f'    Bid Wall: `{esc(f"${bw_price:,.2f}")}` '
                        f'\\({esc(f"{bw_size:.2f}")} qty\\)'
                    )
                if ask_wall:
                    aw_price = ask_wall['price']
                    aw_size = ask_wall['size']
                    lines.append(
                        f'    Ask Wall: `{esc(f"${aw_price:,.2f}")}` '
                        f'\\({esc(f"{aw_size:.2f}")} qty\\)'
                    )

            # Volume profile
            vp = data.get('volume_profile')
            if vp:
                lines.append(f'  *{esc("Volume Profile")}*')
                vp_poc = vp['poc']
                vp_vah = vp['vah']
                vp_val = vp['val']
                vp_vwap = vp['vwap']
                lines.append(f'    POC: `{esc(f"${vp_poc:,.2f}")}`')
                lines.append(f'    VAH: `{esc(f"${vp_vah:,.2f}")}`')
                lines.append(f'    VAL: `{esc(f"${vp_val:,.2f}")}`')
                lines.append(f'    VWAP: `{esc(f"${vp_vwap:,.2f}")}`')

            # Open interest
            oi = data.get('open_interest')
            if oi:
                lines.append(f'  *{esc("Open Interest")}*')
                oi_val = oi['current_oi']
                lines.append(f'    OI: `{esc(f"{oi_val:,.2f}")}` contracts')
                oi_usd = oi.get('current_oi_value_usd')
                if oi_usd:
                    lines.append(f'    OI Value: `{esc(f"${oi_usd:,.0f}")}`')
                lines.append(f'    Price 24h: `{esc(str(oi.get("price_change_24h_pct", "N/A")))}%`')
                lines.append(f'    Signal: `{esc(oi.get("signal", "N/A"))}`')

            # Liquidation levels
            liq = data.get('liquidation_levels')
            if liq:
                lines.append(f'  *{esc("Liquidation Zones")}*')
                nearest_long = liq.get('nearest_long_liq')
                nearest_short = liq.get('nearest_short_liq')
                if nearest_long:
                    lines.append(f'    Nearest Long Liq: `{esc(f"${nearest_long:,.2f}")}`')
                if nearest_short:
                    lines.append(f'    Nearest Short Liq: `{esc(f"${nearest_short:,.2f}")}`')
                magnets = liq.get('magnet_zones', [])
                if magnets:
                    mag_str = ', '.join(f'${m:,.2f}' for m in magnets[:3])
                    lines.append(f'    Magnet Zones: `{esc(mag_str)}`')

            # Overall signal
            signal = data.get('overall_signal', 'N/A')
            emoji = {'BULLISH_PRESSURE': '🟢', 'BEARISH_PRESSURE': '🔴', 'NEUTRAL': '⚪'}.get(signal, '❓')
            lines.append(f'  Signal: {esc(emoji)} `{esc(signal)}`')
            lines.append('')

        lines.append(f'_{esc(PERSONA)}_')
        return '\n'.join(lines)


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------

if __name__ == '__main__':
    import json

    vision = Vision()
    print("=" * 60)
    print("  VISION — Order Flow / Liquidity Analysis")
    print("=" * 60)
    print()

    analysis = vision.analyze()

    # Pretty-print JSON
    print(json.dumps(analysis, indent=2, default=str))
    print()

    # Telegram report
    report = vision.format_report(analysis)
    print("--- Telegram Report ---")
    print(report)
