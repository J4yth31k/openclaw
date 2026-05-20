"""
Black Widow (Natasha Romanoff) - Trade Ideas Generator / Intelligence Synthesizer

The intelligence synthesizer. Combines technical, fundamental, sentiment,
and correlation signals into actionable mission briefings with entry/exit
levels and risk metrics. Intel compiled. Here are the targets.

Confluence Scoring System (point-based):
  +10 per timeframe in agreement (1H, 4H, Daily)
  +10 per confirming indicator (RSI, MACD, volume, market structure, ATR, Stochastic, BB)
  +15 if key HTF level (daily/weekly S&R) aligns
  +15 if market structure (HH/HL or LH/LL) confirms on 4H
  +10 if signal aligns with active session bias
  +10 if correlated instruments confirm
  Penalties: -5 conflicting RSI/Stochastic, -10 volume divergence
  Minimum 50 to PASS, 75+ = HIGH_CONVICTION, <50 = HOLD
"""

import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger('black_widow')

PERSONA = "Intel compiled. Here are the targets. Move fast, stay sharp."

# ── Session definitions (UTC hours) ──────────────────────────────────────
SESSIONS = {
    'Asian':   {'start': 0, 'end': 9},
    'London':  {'start': 8, 'end': 17},
    'NY':      {'start': 13, 'end': 22},
    'Overlap': {'start': 13, 'end': 17},
}

# Pairs that typically move well per session
SESSION_BIAS = {
    'Asian':   {'bias_pairs': ['USDJPY', 'AUDUSD', 'NZDUSD', 'BTCUSD', 'ETHUSD'],
                'description': 'Range-bound, JPY/AUD driven'},
    'London':  {'bias_pairs': ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDCHF'],
                'description': 'Trend initiation, EUR/GBP driven'},
    'NY':      {'bias_pairs': ['EURUSD', 'USDCAD', 'XAUUSD', 'BTCUSD'],
                'description': 'Continuation/reversal, USD driven'},
    'Overlap': {'bias_pairs': ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDCAD'],
                'description': 'Highest volume, strongest moves'},
}

# Known inverse / positive correlation pairs for cross-instrument confirmation
CORRELATION_MAP = {
    'EURUSD': {'inverse': ['DXY', 'USDCHF'], 'positive': ['GBPUSD']},
    'GBPUSD': {'inverse': ['DXY'], 'positive': ['EURUSD']},
    'USDCAD': {'inverse': ['EURUSD'], 'positive': ['DXY']},
    'XAUUSD': {'inverse': ['DXY', 'USDCHF'], 'positive': ['EURUSD']},
    'BTCUSD': {'inverse': ['DXY'], 'positive': ['ETHUSD', 'SOLUSD']},
    'ETHUSD': {'inverse': ['DXY'], 'positive': ['BTCUSD', 'SOLUSD']},
    'SOLUSD': {'inverse': ['DXY'], 'positive': ['BTCUSD', 'ETHUSD']},
}


class BlackWidow:
    """Natasha Romanoff generates mission briefings by scoring confluence of multiple signals."""

    # Map friendly pair names to yfinance tickers (used by ScarletWitch)
    TICKER_MAP = {
        'BTCUSD': 'BTC-USD', 'ETHUSD': 'ETH-USD', 'SOLUSD': 'SOL-USD',
        'EURUSD': 'EURUSD=X', 'XAUUSD': 'GC=F', 'USDCAD': 'USDCAD=X',
    }
    # Reverse map: yfinance ticker -> friendly name
    REVERSE_TICKER_MAP = {v: k for k, v in TICKER_MAP.items()}

    # IronMan trend strings that count as bullish / bearish
    BULLISH_TRENDS = {'Strong Uptrend', 'Uptrend'}
    BEARISH_TRENDS = {'Strong Downtrend', 'Downtrend'}

    # Confluence scoring thresholds
    SCORE_PASS = 50
    SCORE_HIGH_CONVICTION = 75

    def __init__(self):
        """Initialize Black Widow - the intelligence synthesizer."""
        # Legacy thresholds kept for reference; new system uses SCORE_PASS / SCORE_HIGH_CONVICTION
        self.confluence_threshold_high = 4
        self.confluence_threshold_low = -4
        self.confidence_min = 3

    def _resolve_sentiment_pair(self, pair: str) -> str:
        """Resolve a friendly pair name to the yfinance ticker used by ScarletWitch."""
        return self.TICKER_MAP.get(pair, pair)

    def _get_daily_tf(self, pair_tech: dict) -> dict:
        """Extract the daily timeframe data from IronMan's pair analysis."""
        tfs = pair_tech.get('timeframes', {})
        return tfs.get('1d', tfs.get('4h', tfs.get('1h', {})))

    def _score_technical(self, tech_data: dict, pair: str) -> float:
        """
        Score technical signals from IronMan output.

        IronMan returns:
          {'status': 'success', 'pairs': {'BTCUSD': {'timeframes': {'1d': {'trend': 'Strong Uptrend', ...}, ...}}}}

        Points scale: -3 to +3
        - Trend alignment across timeframes: +/-2
        - Key level proximity: +/-1
        - Pattern signals: +/-2
        """
        score = 0

        if tech_data.get('status') != 'success':
            return 0

        pairs_analysis = tech_data.get('pairs', {})
        if pair not in pairs_analysis:
            return 0

        pair_tech = pairs_analysis[pair]
        timeframes_data = pair_tech.get('timeframes', {})

        # Trend alignment across timeframes
        bullish_count = 0
        bearish_count = 0
        tf_keys = ['1h', '4h', '1d']
        checked = 0
        for tf in tf_keys:
            tf_data = timeframes_data.get(tf, {})
            trend = tf_data.get('trend', '')
            if trend in self.BULLISH_TRENDS:
                bullish_count += 1
                checked += 1
            elif trend in self.BEARISH_TRENDS:
                bearish_count += 1
                checked += 1
            elif trend:
                checked += 1

        if checked > 0:
            if bullish_count == checked:
                score += 2
            elif bullish_count >= 2:
                score += 1
            elif bearish_count == checked:
                score -= 2
            elif bearish_count >= 2:
                score -= 1

        # Key level proximity (use daily timeframe)
        daily = self._get_daily_tf(pair_tech)
        current_price = daily.get('price')
        support_levels = daily.get('support', [])
        resistance_levels = daily.get('resistance', [])

        if current_price and support_levels:
            nearest_support = min(support_levels, key=lambda s: abs(current_price - s))
            support_distance = abs(current_price - nearest_support) / current_price if current_price else float('inf')
            if support_distance < 0.003:
                score += 1  # Near support (bullish)

        if current_price and resistance_levels:
            nearest_resistance = min(resistance_levels, key=lambda r: abs(current_price - r))
            resistance_distance = abs(current_price - nearest_resistance) / current_price if current_price else float('inf')
            if resistance_distance < 0.003:
                score -= 1  # Near resistance (bearish)

        # Pattern signals from IronMan's boolean pattern dict
        patterns = daily.get('patterns', {})
        bullish_patterns = ['golden_cross', 'macd_bullish_cross']
        bearish_patterns = ['death_cross', 'macd_bearish_cross']

        for pat in bullish_patterns:
            if patterns.get(pat):
                score += 1
        for pat in bearish_patterns:
            if patterns.get(pat):
                score -= 1

        return max(-3, min(3, score))

    def _score_fundamental(self, fund_data: dict, pair: str) -> float:
        """
        Score fundamental signals from CaptainAmerica output.

        CaptainAmerica returns:
          {'status': 'success', 'high_impact_pairs': {'BTCUSD': [{'event': ..., 'impact': 4, ...}]},
           'today_events': [...], 'central_bank_bias': {...}, ...}

        Points scale: -2 to +2
        """
        score = 0

        if fund_data.get('status') != 'success':
            return 0

        # Check if this pair has high-impact events this week
        high_impact_pairs = fund_data.get('high_impact_pairs', {})
        pair_events = high_impact_pairs.get(pair, [])

        if pair_events:
            # High-impact events upcoming = caution, slight negative bias
            # (events add uncertainty)
            max_impact = max(e.get('impact', 0) for e in pair_events)
            if max_impact >= 5:
                score -= 1  # Major event uncertainty
            elif max_impact >= 4:
                score -= 0.5

        # Central bank bias - extract from the pair's currencies
        cb_bias = fund_data.get('central_bank_bias', {})
        pair_upper = pair.upper()

        # Map pair currencies to central banks
        currency_cb_map = {
            'USD': 'FED', 'EUR': 'ECB', 'GBP': 'BOE',
            'JPY': 'BOJ', 'CAD': 'BOC', 'AUD': 'RBA',
        }

        if len(pair_upper) >= 6:
            base_currency = pair_upper[:3]
            quote_currency = pair_upper[3:6]

            base_cb = currency_cb_map.get(base_currency)
            quote_cb = currency_cb_map.get(quote_currency)

            # Hawkish base = bullish for pair, hawkish quote = bearish
            if base_cb and base_cb in cb_bias:
                bias = cb_bias[base_cb].get('bias', 'neutral')
                if bias == 'hawkish':
                    score += 1
                elif bias == 'dovish':
                    score -= 1

            if quote_cb and quote_cb in cb_bias:
                bias = cb_bias[quote_cb].get('bias', 'neutral')
                if bias == 'hawkish':
                    score -= 1
                elif bias == 'dovish':
                    score += 1

        return max(-2, min(2, score))

    def _score_sentiment(self, sent_data: dict, pair: str) -> float:
        """
        Score sentiment signals from ScarletWitch output.

        ScarletWitch returns:
          {'status': 'success', 'pairs': {'BTC-USD': {'volume': {...}, 'momentum': {'momentum_score': 7.5, ...}}},
           'fear_and_greed': {...}, 'market_regime': {...}}

        Points scale: -2 to +2
        """
        score = 0

        if sent_data.get('status') != 'success':
            return 0

        pairs_sentiment = sent_data.get('pairs', {})

        # Resolve pair name to yfinance ticker (ScarletWitch uses yfinance tickers as keys)
        sent_pair_key = self._resolve_sentiment_pair(pair)
        pair_sent = pairs_sentiment.get(sent_pair_key) or pairs_sentiment.get(pair)

        if not pair_sent:
            return 0

        # Momentum score (1-10 scale from ScarletWitch)
        momentum_data = pair_sent.get('momentum')
        if momentum_data:
            momentum_score = momentum_data.get('momentum_score', 5)
            if momentum_score > 6.5:
                score += 1
            elif momentum_score < 3.5:
                score -= 1

        # Fear/greed (top-level, not per-pair)
        fng = sent_data.get('fear_and_greed')
        if fng:
            fng_value = fng.get('current_value', 50)
            if fng_value >= 75:
                score += 1  # Extreme greed
            elif fng_value <= 25:
                score -= 1  # Extreme fear

        # Volume confirmation
        volume_data = pair_sent.get('volume')
        if volume_data:
            vol_ratio = volume_data.get('volume_ratio', 1.0)
            if vol_ratio > 1.5:
                score += 0.5  # High volume confirms momentum

        return max(-2, min(2, score))

    def _score_correlation(self, corr_data: dict, pair: str) -> float:
        """
        Score correlation signals.

        Points scale: -1 to +1
        - Cross-asset confirmation
        - Divergence warnings
        """
        score = 0

        if 'status' not in corr_data or corr_data['status'] != 'success':
            return 0

        # Check for divergences involving this pair
        divergences = corr_data.get('divergences', [])
        for div in divergences:
            if pair in div.get('pair', ''):
                if div['severity'] == 'HIGH':
                    score -= 0.5  # Warning: major divergence

        # Simple correlation confirmation
        if 'unusual_moves' in corr_data:
            unusual = corr_data['unusual_moves']
            for move in unusual:
                if move['pair'] == pair:
                    if move['z_score'] > 2:
                        score += 0.5  # Strong move confirmation

        return max(-1, min(1, score))

    # ── New Confluence Scoring System ────────────────────────────────────

    @staticmethod
    def get_session_bias(utc_hour: int) -> dict:
        """
        Return the current trading session(s) and bias based on UTC hour.

        Sessions:
          Asian   00-09 UTC
          London  08-17 UTC
          NY      13-22 UTC
          Overlap 13-17 UTC  (London + NY)

        Returns:
            {
                'sessions': [str, ...],
                'primary_session': str,
                'bias_pairs': [str, ...],
                'description': str,
            }
        """
        active = []
        for name, hours in SESSIONS.items():
            if hours['start'] <= utc_hour < hours['end']:
                active.append(name)

        if not active:
            # After 22 UTC — pre-Asian lull
            return {
                'sessions': ['Pre-Asian'],
                'primary_session': 'Pre-Asian',
                'bias_pairs': [],
                'description': 'Low liquidity transition period',
            }

        # Primary session priority: Overlap > NY > London > Asian
        priority = ['Overlap', 'NY', 'London', 'Asian']
        primary = next((s for s in priority if s in active), active[0])
        bias = SESSION_BIAS.get(primary, {})

        return {
            'sessions': active,
            'primary_session': primary,
            'bias_pairs': bias.get('bias_pairs', []),
            'description': bias.get('description', ''),
        }

    def calculate_confluence_score(self, pair: str, tech_data: dict,
                                   fund_data: dict, sent_data: dict,
                                   corr_data: dict,
                                   session_info: dict = None) -> dict:
        """
        Point-based confluence scoring per the rulebook.

        Buckets:
          timeframe_agreement   — +10 per TF (1H, 4H, Daily) in agreement   max 30
          confirming_indicators — +10 per indicator confirming                max 70
          htf_levels            — +15 if key HTF S&R aligns                  max 15
          market_structure      — +15 if 4H HH/HL or LH/LL confirms         max 15
          session_bias          — +10 if signal aligns with session           max 10
          correlated_instruments— +10 if correlated pair confirms             max 10
          penalties             — negative adjustments

        Returns dict with total_score, breakdown, signal_status, conviction_level.
        """
        breakdown = {
            'timeframe_agreement': 0,
            'confirming_indicators': 0,
            'htf_levels': 0,
            'market_structure': 0,
            'session_bias': 0,
            'correlated_instruments': 0,
            'penalties': 0,
        }

        # ── Determine signal direction from the daily timeframe ──────────
        pairs_data = tech_data.get('pairs', {})
        pair_tech = pairs_data.get(pair, {})
        timeframes_data = pair_tech.get('timeframes', {})
        daily_tf = timeframes_data.get('1d', timeframes_data.get('4h', {}))
        trend = daily_tf.get('trend', '')

        if trend in self.BULLISH_TRENDS:
            signal_direction = 'BULLISH'
        elif trend in self.BEARISH_TRENDS:
            signal_direction = 'BEARISH'
        else:
            # If daily is ranging, fall back to strategy evaluations later
            signal_direction = 'NEUTRAL'

        # ── 1. Timeframe agreement (+10 per TF, max 30) ─────────────────
        for tf_key in ['1h', '4h', '1d']:
            tf = timeframes_data.get(tf_key, {})
            tf_trend = tf.get('trend', '')
            if signal_direction == 'BULLISH' and tf_trend in self.BULLISH_TRENDS:
                breakdown['timeframe_agreement'] += 10
            elif signal_direction == 'BEARISH' and tf_trend in self.BEARISH_TRENDS:
                breakdown['timeframe_agreement'] += 10

        # ── 2. Confirming indicators (+10 each, max 70) ─────────────────
        # Use the daily TF for indicator checks
        # IronMan may return indicators as dicts (e.g. {'rsi': 55}) or scalars
        raw_rsi = daily_tf.get('rsi')
        rsi = raw_rsi.get('rsi') if isinstance(raw_rsi, dict) else raw_rsi
        macd = daily_tf.get('patterns', {})
        if not isinstance(macd, dict):
            macd = daily_tf.get('macd', {})
            if not isinstance(macd, dict):
                macd = {}
        volume_ratio = daily_tf.get('volume_ratio', 1.0)
        ms = daily_tf.get('market_structure', {})
        if not isinstance(ms, dict):
            ms = {}
        raw_atr = daily_tf.get('atr')
        atr = raw_atr.get('value', raw_atr) if isinstance(raw_atr, dict) else raw_atr
        raw_stoch = daily_tf.get('stochastic', daily_tf.get('stochastic_rsi', {}))
        if isinstance(raw_stoch, dict):
            stochastic_k = raw_stoch.get('k', raw_stoch.get('stochastic_k'))
            stochastic_d = raw_stoch.get('d', raw_stoch.get('stochastic_d'))
        else:
            stochastic_k = daily_tf.get('stochastic_k') or daily_tf.get('stoch_k')
            stochastic_d = daily_tf.get('stochastic_d') or daily_tf.get('stoch_d')
        raw_bb = daily_tf.get('bollinger', {})
        if isinstance(raw_bb, dict):
            bb_upper = raw_bb.get('upper', raw_bb.get('bollinger_upper'))
            bb_lower = raw_bb.get('lower', raw_bb.get('bollinger_lower'))
        else:
            bb_upper = daily_tf.get('bollinger_upper') or daily_tf.get('bb_upper')
            bb_lower = daily_tf.get('bollinger_lower') or daily_tf.get('bb_lower')
        price = daily_tf.get('price', 0)

        # RSI confirms
        rsi_confirms = False
        if rsi is not None:
            if signal_direction == 'BULLISH' and 40 <= rsi <= 70:
                breakdown['confirming_indicators'] += 10
                rsi_confirms = True
            elif signal_direction == 'BEARISH' and 30 <= rsi <= 60:
                breakdown['confirming_indicators'] += 10
                rsi_confirms = True
            elif signal_direction == 'BULLISH' and rsi < 30:
                # Oversold = strong bullish confirmation
                breakdown['confirming_indicators'] += 10
                rsi_confirms = True
            elif signal_direction == 'BEARISH' and rsi > 70:
                # Overbought = strong bearish confirmation
                breakdown['confirming_indicators'] += 10
                rsi_confirms = True

        # MACD confirms
        if signal_direction == 'BULLISH' and macd.get('macd_bullish_cross'):
            breakdown['confirming_indicators'] += 10
        elif signal_direction == 'BEARISH' and macd.get('macd_bearish_cross'):
            breakdown['confirming_indicators'] += 10
        # Also check golden/death cross as MACD-family
        elif signal_direction == 'BULLISH' and macd.get('golden_cross'):
            breakdown['confirming_indicators'] += 10
        elif signal_direction == 'BEARISH' and macd.get('death_cross'):
            breakdown['confirming_indicators'] += 10

        # Volume confirms
        volume_confirms = False
        if volume_ratio and volume_ratio > 1.2:
            breakdown['confirming_indicators'] += 10
            volume_confirms = True

        # Market structure confirms (daily level — separate from 4H check below)
        structure = ms.get('structure', '')
        if signal_direction == 'BULLISH' and structure == 'BULLISH':
            breakdown['confirming_indicators'] += 10
        elif signal_direction == 'BEARISH' and structure == 'BEARISH':
            breakdown['confirming_indicators'] += 10

        # ATR confirms (volatility present = favorable)
        if atr and price and (atr / price) > 0.002:
            breakdown['confirming_indicators'] += 10

        # Stochastic confirms
        stoch_confirms = False
        if stochastic_k is not None:
            if signal_direction == 'BULLISH' and stochastic_k < 80:
                breakdown['confirming_indicators'] += 10
                stoch_confirms = True
            elif signal_direction == 'BEARISH' and stochastic_k > 20:
                breakdown['confirming_indicators'] += 10
                stoch_confirms = True

        # Bollinger Band confirms
        if price and bb_upper and bb_lower:
            if signal_direction == 'BULLISH' and price <= bb_lower * 1.01:
                breakdown['confirming_indicators'] += 10
            elif signal_direction == 'BEARISH' and price >= bb_upper * 0.99:
                breakdown['confirming_indicators'] += 10
            elif bb_lower < price < bb_upper:
                # Price inside bands — mild confirmation if mid-band aligns
                bb_mid = (bb_upper + bb_lower) / 2
                if signal_direction == 'BULLISH' and price > bb_mid:
                    breakdown['confirming_indicators'] += 10
                elif signal_direction == 'BEARISH' and price < bb_mid:
                    breakdown['confirming_indicators'] += 10

        # Cap confirming_indicators at 70
        breakdown['confirming_indicators'] = min(70, breakdown['confirming_indicators'])

        # Strategy template contributions → added into confirming_indicators
        try:
            smc_score, _ = self._evaluate_smc_entry(tech_data, pair)
            pullback_score, _ = self._evaluate_pullback_entry(tech_data, pair)
            breakout_score, _ = self._evaluate_breakout_entry(tech_data, pair)
            reversion_score, _ = self._evaluate_mean_reversion(tech_data, pair)
            session_score, _ = self._evaluate_session_play(tech_data, pair)

            # Convert old ±scale scores to point contribution:
            # Positive scores for matching direction add points, negative subtract
            strategy_scores_raw = {
                'smart_money': smc_score,
                'pullback': pullback_score,
                'breakout': breakout_score,
                'mean_reversion': reversion_score,
                'session_play': session_score,
            }
            for name, s in strategy_scores_raw.items():
                if signal_direction == 'BULLISH' and s > 0:
                    breakdown['confirming_indicators'] += min(10, int(abs(s) * 3))
                elif signal_direction == 'BEARISH' and s < 0:
                    breakdown['confirming_indicators'] += min(10, int(abs(s) * 3))
        except Exception as e:
            logger.warning(f"Strategy contribution error for {pair}: {e}")
            strategy_scores_raw = {}

        # Re-cap after strategy contributions
        breakdown['confirming_indicators'] = min(70, breakdown['confirming_indicators'])

        # ── 3. HTF levels (+15 if daily/weekly S&R aligns) ───────────────
        support_levels = daily_tf.get('support', [])
        resistance_levels = daily_tf.get('resistance', [])
        if price and support_levels and signal_direction == 'BULLISH':
            nearest_support = min(support_levels, key=lambda s: abs(price - s))
            if abs(price - nearest_support) / price < 0.005:
                breakdown['htf_levels'] = 15
        if price and resistance_levels and signal_direction == 'BEARISH':
            nearest_resistance = min(resistance_levels, key=lambda r: abs(price - r))
            if abs(price - nearest_resistance) / price < 0.005:
                breakdown['htf_levels'] = 15

        # ── 4. Market structure on 4H (+15 if HH/HL or LH/LL confirms) ──
        tf_4h = timeframes_data.get('4h', {})
        ms_4h = tf_4h.get('market_structure', {})
        structure_4h = ms_4h.get('structure', '')
        last_swing = ms_4h.get('last_swing', '')  # e.g. 'HH', 'HL', 'LH', 'LL'

        if signal_direction == 'BULLISH':
            if structure_4h == 'BULLISH' or last_swing in ('HH', 'HL'):
                breakdown['market_structure'] = 15
        elif signal_direction == 'BEARISH':
            if structure_4h == 'BEARISH' or last_swing in ('LH', 'LL'):
                breakdown['market_structure'] = 15

        # ── 5. Session bias (+10 if pair aligns with active session) ─────
        if session_info is None:
            session_info = self.get_session_bias(datetime.utcnow().hour)

        if pair in session_info.get('bias_pairs', []):
            breakdown['session_bias'] = 10

        # ── 6. Correlated instruments (+10 if correlated pair confirms) ──
        corr_confirms = False
        if corr_data.get('status') == 'success':
            # Check divergences: if no HIGH divergence for this pair, count as confirming
            divergences = corr_data.get('divergences', [])
            has_high_div = any(
                pair in d.get('pair', '') and d.get('severity') == 'HIGH'
                for d in divergences
            )
            if not has_high_div:
                # Check correlation map for known relationships
                corr_info = CORRELATION_MAP.get(pair, {})
                if corr_info:
                    # If correlated instruments are in the analysis and trending consistently
                    all_pairs = tech_data.get('pairs', {})
                    for inv_pair in corr_info.get('inverse', []):
                        if inv_pair in all_pairs:
                            inv_trend = self._get_daily_tf(all_pairs[inv_pair]).get('trend', '')
                            if signal_direction == 'BULLISH' and inv_trend in self.BEARISH_TRENDS:
                                breakdown['correlated_instruments'] = 10
                                corr_confirms = True
                                break
                            elif signal_direction == 'BEARISH' and inv_trend in self.BULLISH_TRENDS:
                                breakdown['correlated_instruments'] = 10
                                corr_confirms = True
                                break
                    if not corr_confirms:
                        for pos_pair in corr_info.get('positive', []):
                            if pos_pair in all_pairs:
                                pos_trend = self._get_daily_tf(all_pairs[pos_pair]).get('trend', '')
                                if signal_direction == 'BULLISH' and pos_trend in self.BULLISH_TRENDS:
                                    breakdown['correlated_instruments'] = 10
                                    corr_confirms = True
                                    break
                                elif signal_direction == 'BEARISH' and pos_trend in self.BEARISH_TRENDS:
                                    breakdown['correlated_instruments'] = 10
                                    corr_confirms = True
                                    break

            # Also award points from unusual_moves confirmation
            if not corr_confirms and 'unusual_moves' in corr_data:
                for move in corr_data['unusual_moves']:
                    if move.get('pair') == pair and abs(move.get('z_score', 0)) > 2:
                        breakdown['correlated_instruments'] = 10
                        break

        # ── 7. Penalties ─────────────────────────────────────────────────
        # Conflicting RSI / Stochastic → -5
        if rsi_confirms and stoch_confirms:
            # Both confirmed — no penalty (they agree)
            pass
        elif rsi is not None and stochastic_k is not None:
            # Check for actual conflict
            rsi_bullish = (rsi < 70) if signal_direction == 'BULLISH' else (rsi > 30)
            stoch_bullish = (stochastic_k < 80) if signal_direction == 'BULLISH' else (stochastic_k > 20)
            rsi_bearish_sig = rsi > 70
            stoch_bearish_sig = stochastic_k > 80
            rsi_bullish_sig = rsi < 30
            stoch_bullish_sig = stochastic_k < 20
            # Conflict: one says overbought, other says oversold
            if (rsi_bearish_sig and stoch_bullish_sig) or (rsi_bullish_sig and stoch_bearish_sig):
                breakdown['penalties'] -= 5

        # Volume divergence: price rising but volume falling → -10
        if volume_ratio is not None and price:
            trend_str = daily_tf.get('trend', '')
            if trend_str in self.BULLISH_TRENDS and volume_ratio < 0.8:
                breakdown['penalties'] -= 10
            elif trend_str in self.BEARISH_TRENDS and volume_ratio < 0.8:
                breakdown['penalties'] -= 10

        # ── Compute total ────────────────────────────────────────────────
        total_score = sum(breakdown.values())

        if total_score >= self.SCORE_HIGH_CONVICTION:
            signal_status = 'HIGH_CONVICTION'
            conviction_level = 'high'
        elif total_score >= self.SCORE_PASS:
            signal_status = 'PASS'
            conviction_level = 'medium'
        else:
            signal_status = 'HOLD'
            conviction_level = 'low'

        return {
            'total_score': total_score,
            'breakdown': breakdown,
            'signal_status': signal_status,
            'conviction_level': conviction_level,
            'signal_direction': signal_direction,
            'session_info': session_info,
            'strategy_scores': strategy_scores_raw if 'strategy_scores_raw' in dir() else {},
        }

    @staticmethod
    def check_signal_freshness(signal: dict, max_age_minutes: int = 60) -> bool:
        """
        Check whether a signal is still fresh enough to act on.

        If the signal was generated more than *max_age_minutes* ago (default 60),
        it is considered stale and must be re-scored before use.

        Args:
            signal: A trade idea dict containing 'timestamp' (ISO format string).
            max_age_minutes: Maximum allowed age in minutes.

        Returns:
            True if the signal is fresh, False if it needs re-scoring.
        """
        ts_str = signal.get('timestamp')
        if not ts_str:
            return False

        try:
            ts = datetime.fromisoformat(ts_str)
        except (ValueError, TypeError):
            return False

        # Ensure both are offset-aware or both offset-naive for comparison
        from datetime import timezone as _tz
        now = datetime.now(_tz.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=_tz.utc)
        age = (now - ts).total_seconds() / 60
        return age <= max_age_minutes

    def _build_invalidation(self, tech_data: dict, pair: str,
                            direction: str) -> dict:
        """
        Build invalidation conditions for a signal.

        Returns:
            {
                'price_level': float,
                'timeframe': str,
                'condition': str,
            }
        """
        levels = self._extract_pair_levels(tech_data, pair)
        price = levels['current_price']
        atr = levels['atr'] or (price * 0.005 if price else 0)

        if direction == 'LONG':
            support = levels['nearest_support']
            inv_price = round(support * 0.998, 6) if support else round(price - atr * 1.5, 6) if price else 0.0
            return {
                'price_level': inv_price,
                'timeframe': '4H',
                'condition': f'Close below {inv_price} on 4H candle invalidates bullish thesis',
            }
        else:
            resistance = levels['nearest_resistance']
            inv_price = round(resistance * 1.002, 6) if resistance else round(price + atr * 1.5, 6) if price else 0.0
            return {
                'price_level': inv_price,
                'timeframe': '4H',
                'condition': f'Close above {inv_price} on 4H candle invalidates bearish thesis',
            }

    def _extract_pair_levels(self, tech_data: dict, pair: str) -> dict:
        """
        Extract current price, nearest S/R, and ATR from IronMan's output.

        IronMan format:
          tech_data['pairs'][pair]['timeframes']['1d'] = {
              'price': 1.0850, 'support': [1.08, 1.07], 'resistance': [1.09, 1.10],
              'atr': 0.0015, ...
          }

        Returns:
            Dict with 'current_price', 'nearest_support', 'nearest_resistance',
            'next_resistance', 'atr' (or None values).
        """
        result = {
            'current_price': None, 'nearest_support': None,
            'nearest_resistance': None, 'next_resistance': None, 'atr': None,
        }

        pairs_data = tech_data.get('pairs', {})
        if pair not in pairs_data:
            return result

        pair_tech = pairs_data[pair]
        daily = self._get_daily_tf(pair_tech)

        current_price = daily.get('price')
        if not current_price:
            return result

        result['current_price'] = current_price
        result['atr'] = daily.get('atr', current_price * 0.005)

        support_levels = sorted(daily.get('support', []))
        resistance_levels = sorted(daily.get('resistance', []))

        # Nearest support = highest support below current price
        supports_below = [s for s in support_levels if s < current_price]
        if supports_below:
            result['nearest_support'] = supports_below[-1]

        # Nearest resistance = lowest resistance above current price
        resistances_above = [r for r in resistance_levels if r > current_price]
        if resistances_above:
            result['nearest_resistance'] = resistances_above[0]
            if len(resistances_above) > 1:
                result['next_resistance'] = resistances_above[1]
            else:
                result['next_resistance'] = resistances_above[0]

        return result

    # ── Strategy Template Methods ──────────────────────────────────────────

    def _evaluate_smc_entry(self, tech_data, pair):
        """Evaluate Smart Money Concepts entry setup."""
        try:
            score = 0
            details = []

            pairs_data = tech_data.get('pairs', {})
            if pair not in pairs_data:
                return 0, details

            pair_tech = pairs_data[pair]
            tf_data = self._get_daily_tf(pair_tech)
            if not tf_data:
                return 0, details

            ms = tf_data.get('market_structure', {})
            obs = tf_data.get('order_blocks', {})
            fvgs = tf_data.get('fair_value_gaps', {})
            sweeps = tf_data.get('liquidity_sweeps', {})
            price = tf_data.get('price', 0)

            # Market structure direction
            structure = ms.get('structure', 'RANGING')
            if structure == 'BULLISH':
                score += 1.5
                details.append('Bullish market structure')
            elif structure == 'BEARISH':
                score -= 1.5
                details.append('Bearish market structure')

            # BOS/CHoCH
            if ms.get('last_bos'):
                bos_type = ms['last_bos'].get('type', '')
                if bos_type == 'BULLISH':
                    score += 1
                    details.append('Bullish BOS confirmed')
                elif bos_type == 'BEARISH':
                    score -= 1
                    details.append('Bearish BOS confirmed')

            if ms.get('last_choch'):
                choch_type = ms['last_choch'].get('type', '')
                if choch_type == 'BULLISH':
                    score += 1.5
                    details.append('Bullish CHoCH — potential reversal')
                elif choch_type == 'BEARISH':
                    score -= 1.5
                    details.append('Bearish CHoCH — potential reversal')

            # Order blocks near price
            if obs.get('bullish') and price:
                for ob in obs['bullish']:
                    if ob['bottom'] <= price <= ob['top'] * 1.005:
                        score += 1
                        details.append(f"Price at bullish OB ({ob['bottom']}-{ob['top']})")
                        break
            if obs.get('bearish') and price:
                for ob in obs['bearish']:
                    if ob['bottom'] * 0.995 <= price <= ob['top']:
                        score -= 1
                        details.append(f"Price at bearish OB ({ob['bottom']}-{ob['top']})")
                        break

            # Fair value gaps
            if fvgs.get('bullish'):
                score += 0.5
                details.append(f"{len(fvgs['bullish'])} unfilled bullish FVG(s)")
            if fvgs.get('bearish'):
                score -= 0.5
                details.append(f"{len(fvgs['bearish'])} unfilled bearish FVG(s)")

            # Liquidity sweeps (contrarian — sweep of lows is bullish)
            if sweeps.get('bullish_sweeps'):
                score += 1
                details.append('Bullish liquidity sweep detected')
            if sweeps.get('bearish_sweeps'):
                score -= 1
                details.append('Bearish liquidity sweep detected')

            return max(-5, min(5, score)), details
        except Exception as e:
            logger.warning(f"SMC entry evaluation error for {pair}: {e}")
            return 0, []

    def _evaluate_pullback_entry(self, tech_data, pair):
        """Evaluate classic pullback entry: trend + Fibonacci retracement + EMA support."""
        try:
            score = 0
            details = []

            pairs_data = tech_data.get('pairs', {})
            if pair not in pairs_data:
                return 0, details

            pair_tech = pairs_data[pair]
            tf_data = self._get_daily_tf(pair_tech)
            if not tf_data:
                return 0, details

            price = tf_data.get('price', 0)
            trend = tf_data.get('trend', '')

            # Strong trend: ±1.5
            if trend in self.BULLISH_TRENDS:
                score += 1.5
                details.append(f'Trend: {trend}')
            elif trend in self.BEARISH_TRENDS:
                score -= 1.5
                details.append(f'Trend: {trend}')

            # Fibonacci retracement at 38.2-61.8%: ±1
            fib = tf_data.get('fibonacci', {})
            fib_382 = fib.get('level_382')
            fib_618 = fib.get('level_618')
            if price and fib_382 and fib_618:
                fib_low = min(fib_382, fib_618)
                fib_high = max(fib_382, fib_618)
                if fib_low <= price <= fib_high:
                    if trend in self.BULLISH_TRENDS:
                        score += 1
                        details.append('Price at Fib 38.2-61.8% retracement (bullish)')
                    elif trend in self.BEARISH_TRENDS:
                        score -= 1
                        details.append('Price at Fib 38.2-61.8% retracement (bearish)')

            # Price near EMA 21 or 50 (within 0.5%): ±1
            ema21 = tf_data.get('ema_21') or tf_data.get('ema21')
            ema50 = tf_data.get('ema_50') or tf_data.get('ema50')
            if price:
                for ema_val, ema_name in [(ema21, 'EMA21'), (ema50, 'EMA50')]:
                    if ema_val and abs(price - ema_val) / price < 0.005:
                        if trend in self.BULLISH_TRENDS:
                            score += 1
                            details.append(f'Price near {ema_name} support')
                        elif trend in self.BEARISH_TRENDS:
                            score -= 1
                            details.append(f'Price near {ema_name} resistance')
                        break

            # Supertrend confirms direction: ±0.5
            supertrend = tf_data.get('supertrend', {})
            st_direction = supertrend.get('direction', '')
            if st_direction == 'UP' or st_direction == 'BULLISH':
                score += 0.5
                details.append('Supertrend bullish')
            elif st_direction == 'DOWN' or st_direction == 'BEARISH':
                score -= 0.5
                details.append('Supertrend bearish')

            return max(-4, min(4, score)), details
        except Exception as e:
            logger.warning(f"Pullback entry evaluation error for {pair}: {e}")
            return 0, []

    def _evaluate_breakout_entry(self, tech_data, pair):
        """Evaluate breakout play: Bollinger squeeze -> expansion + volume + S/R break."""
        try:
            score = 0
            details = []

            pairs_data = tech_data.get('pairs', {})
            if pair not in pairs_data:
                return 0, details

            pair_tech = pairs_data[pair]
            tf_data = self._get_daily_tf(pair_tech)
            if not tf_data:
                return 0, details

            price = tf_data.get('price', 0)
            patterns = tf_data.get('patterns', {})

            # Bollinger squeeze detected: +1 (direction-neutral)
            if patterns.get('bollinger_squeeze'):
                score += 1
                details.append('Bollinger squeeze detected')

            # Price breaking above resistance: +2 / below support: -2
            support_levels = tf_data.get('support', [])
            resistance_levels = tf_data.get('resistance', [])
            if price and resistance_levels:
                nearest_res = min(resistance_levels, key=lambda r: abs(price - r))
                if price > nearest_res and (price - nearest_res) / nearest_res < 0.01:
                    score += 2
                    details.append(f'Breaking above resistance {nearest_res}')
            if price and support_levels:
                nearest_sup = max(support_levels, key=lambda s: -abs(price - s))
                if price < nearest_sup and (nearest_sup - price) / nearest_sup < 0.01:
                    score -= 2
                    details.append(f'Breaking below support {nearest_sup}')

            # Volume above 1.5x average: ±0.5
            volume_ratio = tf_data.get('volume_ratio', 1.0)
            if volume_ratio > 1.5:
                # Direction follows the breakout direction
                if score > 0:
                    score += 0.5
                    details.append(f'Volume spike confirms breakout ({volume_ratio:.1f}x)')
                elif score < 0:
                    score -= 0.5
                    details.append(f'Volume spike confirms breakdown ({volume_ratio:.1f}x)')

            # ADX rising above 25: ±0.5
            adx = tf_data.get('adx', 0)
            if adx and adx > 25:
                if score > 0:
                    score += 0.5
                    details.append(f'ADX strong at {adx:.1f}')
                elif score < 0:
                    score -= 0.5
                    details.append(f'ADX strong at {adx:.1f}')

            return max(-4, min(4, score)), details
        except Exception as e:
            logger.warning(f"Breakout entry evaluation error for {pair}: {e}")
            return 0, []

    def _evaluate_mean_reversion(self, tech_data, pair):
        """Evaluate mean reversion: BB extreme + RSI divergence + S/D zone."""
        try:
            score = 0
            details = []

            pairs_data = tech_data.get('pairs', {})
            if pair not in pairs_data:
                return 0, details

            pair_tech = pairs_data[pair]
            tf_data = self._get_daily_tf(pair_tech)
            if not tf_data:
                return 0, details

            price = tf_data.get('price', 0)
            rsi = tf_data.get('rsi', 50)
            patterns = tf_data.get('patterns', {})

            # RSI oversold (<30) or overbought (>70): ±1.5
            if rsi and rsi < 30:
                score += 1.5  # Oversold = expect bounce (bullish reversion)
                details.append(f'RSI oversold at {rsi:.1f}')
            elif rsi and rsi > 70:
                score -= 1.5  # Overbought = expect pullback (bearish reversion)
                details.append(f'RSI overbought at {rsi:.1f}')

            # Price at lower/upper Bollinger Band: ±1
            bb_upper = tf_data.get('bollinger_upper') or tf_data.get('bb_upper')
            bb_lower = tf_data.get('bollinger_lower') or tf_data.get('bb_lower')
            if price and bb_lower and price <= bb_lower * 1.002:
                score += 1
                details.append('Price at lower Bollinger Band')
            elif price and bb_upper and price >= bb_upper * 0.998:
                score -= 1
                details.append('Price at upper Bollinger Band')

            # RSI divergence detected: ±1
            if patterns.get('rsi_divergence'):
                if rsi and rsi < 50:
                    score += 1
                    details.append('Bullish RSI divergence')
                else:
                    score -= 1
                    details.append('Bearish RSI divergence')

            # Near demand/supply zone: ±0.5
            demand_zones = tf_data.get('demand_zones', [])
            supply_zones = tf_data.get('supply_zones', [])
            if price and demand_zones:
                for zone in demand_zones:
                    z_low = zone.get('bottom', zone.get('low', 0))
                    z_high = zone.get('top', zone.get('high', 0))
                    if z_low and z_high and z_low <= price <= z_high * 1.005:
                        score += 0.5
                        details.append('Price near demand zone')
                        break
            if price and supply_zones:
                for zone in supply_zones:
                    z_low = zone.get('bottom', zone.get('low', 0))
                    z_high = zone.get('top', zone.get('high', 0))
                    if z_low and z_high and z_low * 0.995 <= price <= z_high:
                        score -= 0.5
                        details.append('Price near supply zone')
                        break

            return max(-4, min(4, score)), details
        except Exception as e:
            logger.warning(f"Mean reversion evaluation error for {pair}: {e}")
            return 0, []

    def _evaluate_session_play(self, tech_data, pair):
        """Evaluate session-based entry: kill zones + Asian range breakout."""
        try:
            score = 0
            details = []

            pairs_data = tech_data.get('pairs', {})
            if pair not in pairs_data:
                return 0, details

            pair_tech = pairs_data[pair]
            tf_data = self._get_daily_tf(pair_tech)
            if not tf_data:
                return 0, details

            now = datetime.utcnow()
            hour = now.hour
            trend = tf_data.get('trend', '')

            # Determine trend direction for alignment
            bullish_trend = trend in self.BULLISH_TRENDS
            bearish_trend = trend in self.BEARISH_TRENDS

            # London Open kill zone (07:00-10:00 UTC)
            if 7 <= hour <= 10:
                if bullish_trend:
                    score += 1
                    details.append('London Open kill zone — bullish alignment')
                elif bearish_trend:
                    score -= 1
                    details.append('London Open kill zone — bearish alignment')

            # NY Open kill zone (12:00-15:00 UTC)
            if 12 <= hour <= 15:
                if bullish_trend:
                    score += 1
                    details.append('NY Open kill zone — bullish alignment')
                elif bearish_trend:
                    score -= 1
                    details.append('NY Open kill zone — bearish alignment')

            # Asian range breakout (check session data if available)
            asian_range = tf_data.get('asian_range', {})
            price = tf_data.get('price', 0)
            if asian_range and price:
                ar_high = asian_range.get('high', 0)
                ar_low = asian_range.get('low', 0)
                if ar_high and price > ar_high:
                    score += 1
                    details.append(f'Asian range breakout above {ar_high}')
                elif ar_low and price < ar_low:
                    score -= 1
                    details.append(f'Asian range breakdown below {ar_low}')

            # London+NY overlap (13:00-16:00 UTC)
            if 13 <= hour <= 16:
                if bullish_trend:
                    score += 1
                    details.append('London/NY overlap — bullish alignment')
                elif bearish_trend:
                    score -= 1
                    details.append('London/NY overlap — bearish alignment')

            return max(-3, min(3, score)), details
        except Exception as e:
            logger.warning(f"Session play evaluation error for {pair}: {e}")
            return 0, []

    def _calculate_partial_tp(self, entry, direction, atr, tp_final):
        """Calculate partial take profit ladder: 1R, 2R, 3R."""
        try:
            if not all([entry, atr]):
                return None

            if direction == 'LONG':
                return {
                    'tp1': round(entry + atr, 6),        # 1R — take 33% off
                    'tp2': round(entry + atr * 2, 6),     # 2R — take 33% off
                    'tp3': round(tp_final if tp_final else entry + atr * 3, 6),  # 3R — close remaining
                    'trail_start': round(entry + atr * 1.5, 6),  # Start trailing after 1.5R
                    'trail_distance': round(atr * 0.75, 6),      # Trail by 0.75 ATR
                }
            else:
                return {
                    'tp1': round(entry - atr, 6),
                    'tp2': round(entry - atr * 2, 6),
                    'tp3': round(tp_final if tp_final else entry - atr * 3, 6),
                    'trail_start': round(entry - atr * 1.5, 6),
                    'trail_distance': round(atr * 0.75, 6),
                }
        except Exception as e:
            logger.warning(f"Partial TP calculation error: {e}")
            return None

    # ── End Strategy Template Methods ────────────────────────────────────

    def _calculate_entry_zone(self, tech_data: dict, pair: str, direction: str) -> tuple:
        """
        Calculate volatility-adjusted entry zone based on current price, nearest S/R,
        and ATR. Wider zones for volatile pairs, tighter zones for stable pairs.

        Uses ATR as a percentage of price to determine the margin instead of
        a hardcoded 0.3% (0.003) value.

        Returns:
            Tuple of (entry_min, entry_max, reference_price)
        """
        levels = self._extract_pair_levels(tech_data, pair)
        current = levels['current_price']

        if not current:
            return (None, None, None)

        atr = levels['atr'] or current * 0.005

        # Volatility-adjusted margin: use ATR as % of price, clamped to reasonable range
        # This replaces the old hardcoded 0.3% (0.003) margin
        atr_pct = atr / current if current > 0 else 0.003
        # Clamp between 0.1% and 2% to avoid extreme values
        margin = max(0.001, min(0.02, atr_pct * 0.5))

        if direction == 'LONG':
            support = levels['nearest_support']
            if support:
                entry_min = support * (1 - margin)
                entry_max = current * (1 - margin)
                return (entry_min, entry_max, current)
            else:
                return (current - atr, current, current)

        else:  # SHORT
            resistance = levels['nearest_resistance']
            if resistance:
                entry_max = resistance * (1 + margin)
                entry_min = current * (1 + margin)
                return (entry_min, entry_max, current)
            else:
                return (current, current + atr, current)

    def _calculate_tp_sl(self, tech_data: dict, pair: str, direction: str,
                         entry_price: float) -> tuple:
        """
        Calculate take profit and stop loss.

        Returns:
            Tuple of (take_profit, stop_loss)
        """
        levels = self._extract_pair_levels(tech_data, pair)
        current = levels['current_price'] or entry_price
        atr = levels['atr'] or current * 0.005

        if direction == 'LONG':
            resistance = levels['next_resistance'] or levels['nearest_resistance']
            tp = resistance if resistance else entry_price + (atr * 2)

            support = levels['nearest_support']
            sl = support * 0.999 if support else entry_price - atr

        else:  # SHORT
            support = levels['nearest_support']
            tp = support if support else entry_price - (atr * 2)

            resistance = levels['nearest_resistance']
            sl = resistance * 1.001 if resistance else entry_price + atr

        return (tp, sl)

    def _calculate_risk_reward(self, entry: float, tp: float, sl: float) -> float:
        """Calculate risk-to-reward ratio."""
        if not all([entry, tp, sl]):
            return None

        risk = abs(entry - sl)
        reward = abs(tp - entry)

        if risk == 0:
            return None

        return round(reward / risk, 2)

    def generate(self, technical: dict, fundamental: dict, sentiment: dict,
                 correlation: dict) -> dict:
        """
        Generate mission briefings from confluence of all intelligence.

        Uses the point-based confluence scoring system:
          - Signals scoring >= 50 are PASSED
          - Signals scoring >= 75 are HIGH_CONVICTION
          - Signals scoring < 50 are HELD (not passed forward)

        Args:
            technical: Output from IronMan (technical analysis)
            fundamental: Output from CaptainAmerica (fundamental analysis)
            sentiment: Output from ScarletWitch (sentiment analysis)
            correlation: Output from Thor (correlation tracking)

        Returns:
            Dictionary with mission briefings and metadata.
        """
        logger.info("Black Widow compiling intelligence from all Avengers")

        now = datetime.utcnow()
        session_info = self.get_session_bias(now.hour)

        trade_ideas = []
        held_signals = []
        pair_scores = {}

        # Get all pairs from technical analysis
        pairs = list(technical.get('pairs', {}).keys())

        for pair in pairs:
            # ── New confluence scoring ───────────────────────────────────
            confluence = self.calculate_confluence_score(
                pair, technical, fundamental, sentiment, correlation,
                session_info=session_info,
            )

            total_score = confluence['total_score']
            signal_direction = confluence['signal_direction']
            strategy_scores = confluence.get('strategy_scores', {})

            # Also keep legacy sub-scores for backward-compatible pair_scores
            tech_score = self._score_technical(technical, pair)
            fund_score = self._score_fundamental(fundamental, pair)
            sent_score = self._score_sentiment(sentiment, pair)
            corr_score = self._score_correlation(correlation, pair)

            pair_scores[pair] = {
                'confluence': total_score,
                'confluence_breakdown': confluence['breakdown'],
                'signal_status': confluence['signal_status'],
                'technical_legacy': tech_score,
                'fundamental_legacy': fund_score,
                'sentiment_legacy': sent_score,
                'correlation_legacy': corr_score,
            }

            # Determine direction
            if signal_direction == 'BULLISH':
                direction = 'LONG'
            elif signal_direction == 'BEARISH':
                direction = 'SHORT'
            else:
                # Neutral — pick from best strategy score sign
                if strategy_scores:
                    best_strat = max(strategy_scores, key=lambda k: abs(strategy_scores[k]))
                    direction = 'LONG' if strategy_scores[best_strat] >= 0 else 'SHORT'
                else:
                    direction = 'LONG'  # default

            # Signals below threshold are HELD
            if confluence['signal_status'] == 'HOLD':
                held_signals.append({
                    'pair': pair,
                    'direction': direction,
                    'score': total_score,
                    'breakdown': confluence['breakdown'],
                    'reason': 'Score below minimum threshold of 50',
                })
                continue

            # ── Build the trade idea ─────────────────────────────────────
            levels = self._extract_pair_levels(technical, pair)
            current_price = levels['current_price']
            if not current_price:
                continue

            # SMC details for the report
            try:
                _, smc_details = self._evaluate_smc_entry(technical, pair)
            except Exception:
                smc_details = []

            # Best strategy identification
            if strategy_scores:
                best_strategy = max(strategy_scores, key=lambda k: abs(strategy_scores[k]))
            else:
                best_strategy = 'none'

            # Calculate levels
            entry_zone = self._calculate_entry_zone(technical, pair, direction)
            entry_price = entry_zone[1] if entry_zone[1] else current_price
            tp, sl = self._calculate_tp_sl(technical, pair, direction, entry_price)

            risk_reward = self._calculate_risk_reward(entry_price, tp, sl) if tp and sl else None

            # Confidence based on new scoring
            if confluence['signal_status'] == 'HIGH_CONVICTION':
                confidence = 'HIGH'
            else:
                confidence = 'MEDIUM'

            # Key reasoning from breakdown
            reasons = []
            bd = confluence['breakdown']
            if bd['timeframe_agreement'] > 0:
                reasons.append(f"TF agreement +{bd['timeframe_agreement']}")
            if bd['confirming_indicators'] > 0:
                reasons.append(f"indicators +{bd['confirming_indicators']}")
            if bd['htf_levels'] > 0:
                reasons.append("HTF level aligned")
            if bd['market_structure'] > 0:
                reasons.append("4H structure confirms")
            if bd['session_bias'] > 0:
                reasons.append(f"session bias ({session_info['primary_session']})")
            if bd['correlated_instruments'] > 0:
                reasons.append("correlated pair confirms")
            if bd['penalties'] < 0:
                reasons.append(f"penalties {bd['penalties']}")
            reasoning = "; ".join(reasons) if reasons else "Confluence signal"

            # Partial TP ladder
            try:
                atr = levels.get('atr') or (current_price * 0.005)
                partial_tp = self._calculate_partial_tp(entry_price, direction, atr, tp)
            except Exception as e:
                logger.warning(f"Partial TP calculation error for {pair}: {e}")
                partial_tp = None

            # Invalidation conditions
            invalidation = self._build_invalidation(technical, pair, direction)

            # Confidence score 0-100 mapped from total_score
            confidence_score_100 = min(100, max(0, total_score))

            # Risk level
            if confidence_score_100 >= 75:
                risk_level = 'LOW'
            elif confidence_score_100 >= 60:
                risk_level = 'MEDIUM'
            else:
                risk_level = 'HIGH'

            # Structured output per rulebook
            structured_output = {
                'market': 'crypto' if pair in ('BTCUSD', 'ETHUSD', 'SOLUSD') else 'forex',
                'instrument': pair,
                'session': session_info['primary_session'],
                'account_type': 'live',
                'dollar_risk': None,          # to be filled by risk manager
                'position_size': None,         # to be filled by risk manager
                'finding': reasoning,
                'confidence_score': confidence_score_100,
                'timeframe': 'multi',
                'data_source': 'IronMan+CaptainAmerica+ScarletWitch+Thor',
                'confluence_score': total_score,
                'recommended_action': direction,
                'risk_level': risk_level,
                'invalidation_condition': invalidation['condition'],
            }

            idea = {
                'pair': pair,
                'direction': direction,
                'timestamp': now.isoformat(),
                'entry_zone': {
                    'min': round(entry_zone[0], 6) if entry_zone[0] else None,
                    'max': round(entry_zone[1], 6) if entry_zone[1] else None,
                    'current': round(current_price, 6),
                },
                'take_profit': round(tp, 6) if tp else None,
                'stop_loss': round(sl, 6) if sl else None,
                'confidence': confidence,
                'risk_reward': risk_reward,
                'reasoning': reasoning,
                'confluence_score': total_score,
                'confluence_breakdown': confluence['breakdown'],
                'signal_status': confluence['signal_status'],
                'conviction_level': confluence['conviction_level'],
                'signal_breakdown': pair_scores[pair],
                'strategy': best_strategy,
                'strategy_scores': strategy_scores,
                'smc_details': smc_details,
                'partial_tp': partial_tp,
                'invalidation': invalidation,
                'session_info': {
                    'sessions': session_info['sessions'],
                    'primary_session': session_info['primary_session'],
                },
                'structured_output': structured_output,
            }

            trade_ideas.append(idea)

        # Risk warnings
        risk_warnings = []
        today_events = fundamental.get('today_events', [])
        high_impact_today = [e for e in today_events if e.get('impact', 0) >= 4]
        if high_impact_today:
            risk_warnings.append(
                f"⚠️ {len(high_impact_today)} high-impact events today - "
                "mission parameters may shift"
            )

        correlation_warnings = correlation.get('divergences', [])
        high_severity_divs = [d for d in correlation_warnings if d.get('severity') == 'HIGH']
        if high_severity_divs:
            risk_warnings.append(
                f"⚠️ {len(high_severity_divs)} major cross-realm divergences - "
                "collateral risk elevated"
            )

        result = {
            'timestamp': now.isoformat(),
            'status': 'success',
            'trade_ideas': sorted(
                trade_ideas,
                key=lambda x: x['confluence_score'],
                reverse=True,
            ),
            'held_signals': held_signals,
            'pair_scores': pair_scores,
            'risk_warnings': risk_warnings,
            'session_info': {
                'sessions': session_info['sessions'],
                'primary_session': session_info['primary_session'],
                'description': session_info['description'],
            },
            'total_ideas': len(trade_ideas),
            'total_held': len(held_signals),
            'high_conviction': len([i for i in trade_ideas if i['signal_status'] == 'HIGH_CONVICTION']),
            'passed': len([i for i in trade_ideas if i['signal_status'] == 'PASS']),
        }

        logger.info(
            f"Mission briefing compiled: {len(trade_ideas)} targets passed "
            f"({result['high_conviction']} high-conviction), "
            f"{len(held_signals)} held"
        )

        return result

    def format_report(self, ideas: dict) -> str:
        """
        Format mission briefings for Telegram MarkdownV2.

        Args:
            ideas: Output from generate()

        Returns:
            Formatted markdown string.
        """
        if ideas.get('status') != 'success':
            return "❌ Mission briefing compilation failed"

        session = ideas.get('session_info', {})
        session_label = session.get('primary_session', 'Unknown')

        lines = [
            "🕷️ *WIDOW'S MISSION BRIEFING*",
            f"_{PERSONA}_",
            f"Session: {session_label}",
            "",
        ]

        # Risk warnings
        for warning in ideas.get('risk_warnings', []):
            warning_escaped = warning.replace('-', '\\-')
            lines.append(warning_escaped)

        if ideas.get('risk_warnings'):
            lines.append("")

        # Trade ideas (mission targets — only PASS and HIGH_CONVICTION)
        trade_ideas = ideas.get('trade_ideas', [])
        held = ideas.get('held_signals', [])

        if not trade_ideas:
            lines.append("No targets with sufficient confluence \\(min 50 pts\\)")
            lines.append("")
        else:
            lines.append(f"*{len(trade_ideas)} Targets Acquired:*")
            lines.append("")

            for i, idea in enumerate(trade_ideas[:5], 1):
                pair = idea['pair'].replace('-', '\\-').replace('=', '\\=')
                direction = idea['direction']
                status = idea.get('signal_status', 'PASS')
                score = idea['confluence_score']
                rr = idea['risk_reward']

                # Header
                emoji = "📈" if direction == "LONG" else "📉"
                status_emoji = "🔴" if status == "HIGH_CONVICTION" else "🟡"
                lines.append(
                    f"{i}\\. {emoji} {pair} {direction} {status_emoji} "
                    f"{status} \\({score} pts\\)"
                )

                # Entry
                entry_min = idea['entry_zone']['min']
                entry_max = idea['entry_zone']['max']
                entry_current = idea['entry_zone']['current']
                if entry_min and entry_max:
                    lines.append(
                        f"   Entry: {entry_min:.6g}\\-{entry_max:.6g} "
                        f"\\(current: {entry_current:.6g}\\)"
                    )

                # TP/SL
                tp = idea['take_profit']
                sl = idea['stop_loss']
                if tp and sl:
                    lines.append(f"   TP: {tp:.6g} | SL: {sl:.6g}")

                # Risk/Reward
                if rr:
                    lines.append(f"   RR: 1\\:{rr}")

                # Strategy
                strategy = idea.get('strategy', '')
                if strategy:
                    strategy_label = strategy.replace('_', ' ').title()
                    lines.append(f"   Strategy: {strategy_label}")

                # Partial TP ladder
                partial_tp = idea.get('partial_tp')
                if partial_tp:
                    lines.append(
                        f"   TP Ladder: TP1={partial_tp['tp1']:.6g} \\| "
                        f"TP2={partial_tp['tp2']:.6g} \\| "
                        f"TP3={partial_tp['tp3']:.6g}"
                    )
                    lines.append(
                        f"   Trail: start {partial_tp['trail_start']:.6g}, "
                        f"distance {partial_tp['trail_distance']:.6g}"
                    )

                # Invalidation
                inv = idea.get('invalidation', {})
                if inv.get('price_level'):
                    lines.append(
                        f"   Invalidation: {inv['price_level']:.6g} "
                        f"\\({inv.get('timeframe', '4H')}\\)"
                    )

                # Confluence breakdown
                bd = idea.get('confluence_breakdown', {})
                bd_parts = []
                if bd.get('timeframe_agreement'):
                    bd_parts.append(f"TF:{bd['timeframe_agreement']}")
                if bd.get('confirming_indicators'):
                    bd_parts.append(f"Ind:{bd['confirming_indicators']}")
                if bd.get('htf_levels'):
                    bd_parts.append(f"HTF:{bd['htf_levels']}")
                if bd.get('market_structure'):
                    bd_parts.append(f"MS:{bd['market_structure']}")
                if bd.get('session_bias'):
                    bd_parts.append(f"Ses:{bd['session_bias']}")
                if bd.get('correlated_instruments'):
                    bd_parts.append(f"Corr:{bd['correlated_instruments']}")
                if bd.get('penalties', 0) < 0:
                    bd_parts.append(f"Pen:{bd['penalties']}")
                if bd_parts:
                    lines.append(f"   Breakdown: {' | '.join(bd_parts)}")

                lines.append(f"   Reasoning: {idea['reasoning']}")
                lines.append("")

        # Held signals summary
        if held:
            lines.append(f"*{len(held)} Signals HELD \\(below 50 pts\\):*")
            for h in held[:3]:
                hp = h['pair'].replace('-', '\\-').replace('=', '\\=')
                lines.append(f"  \\- {hp} {h['direction']} \\({h['score']} pts\\)")
            lines.append("")

        # Summary
        lines.append("*Mission Summary:*")
        lines.append(f"High Conviction: {ideas.get('high_conviction', 0)}")
        lines.append(f"Passed: {ideas.get('passed', 0)}")
        lines.append(f"Held: {ideas.get('total_held', 0)}")
        lines.append("")
        lines.append("_I've got red in my ledger\\. \\-\\- Black Widow_")

        return "\n".join(lines)


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Mock data for testing (matching actual agent output formats)
    mock_tech = {
        'status': 'success',
        'pairs': {
            'EURUSD': {
                'pair': 'EURUSD',
                'timeframes': {
                    '1d': {
                        'price': 1.0850,
                        'trend': 'Uptrend',
                        'atr': 0.0015,
                        'support': [1.0800, 1.0750],
                        'resistance': [1.0900, 1.0950],
                        'patterns': {'golden_cross': True, 'death_cross': False,
                                     'macd_bullish_cross': False, 'macd_bearish_cross': False,
                                     'bollinger_squeeze': False, 'rsi_divergence': False},
                        'rsi': 55.0,
                    },
                    '4h': {'price': 1.0850, 'trend': 'Uptrend', 'patterns': {}},
                    '1h': {'price': 1.0850, 'trend': 'Ranging', 'patterns': {}},
                }
            }
        }
    }

    mock_fund = {
        'status': 'success',
        'today_events': [],
        'week_events': [],
        'high_impact_pairs': {},
        'central_bank_bias': {'FED': {'bias': 'neutral'}, 'ECB': {'bias': 'neutral'}},
    }
    mock_sent = {
        'status': 'success',
        'pairs': {'EURUSD=X': {'volume': {'volume_ratio': 1.2}, 'momentum': {'momentum_score': 6.5}}},
        'fear_and_greed': {'current_value': 55},
    }
    mock_corr = {'status': 'success', 'divergences': []}

    generator = BlackWidow()
    result = generator.generate(mock_tech, mock_fund, mock_sent, mock_corr)
    print(generator.format_report(result))
