"""
Black Widow (Natasha Romanoff) - Trade Ideas Generator / Intelligence Synthesizer

The intelligence synthesizer. Combines technical, fundamental, sentiment,
and correlation signals into actionable mission briefings with entry/exit
levels and risk metrics. Intel compiled. Here are the targets.
"""

import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger('black_widow')

PERSONA = "Intel compiled. Here are the targets. Move fast, stay sharp."


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

    def __init__(self):
        """Initialize Black Widow - the intelligence synthesizer."""
        # Confluence scoring thresholds
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

        Args:
            technical: Output from IronMan (technical analysis)
            fundamental: Output from CaptainAmerica (fundamental analysis)
            sentiment: Output from ScarletWitch (sentiment analysis)
            correlation: Output from Thor (correlation tracking)

        Returns:
            Dictionary with mission briefings and metadata.
        """
        logger.info("Black Widow compiling intelligence from all Avengers")

        trade_ideas = []
        pair_scores = {}

        # Get all pairs from technical analysis
        pairs = list(technical.get('pairs', {}).keys())

        for pair in pairs:
            # Score each signal
            tech_score = self._score_technical(technical, pair)
            fund_score = self._score_fundamental(fundamental, pair)
            sent_score = self._score_sentiment(sentiment, pair)
            corr_score = self._score_correlation(correlation, pair)

            # Total confluence score
            confluence_score = tech_score + fund_score + sent_score + corr_score
            pair_scores[pair] = {
                'confluence': confluence_score,
                'technical': tech_score,
                'fundamental': fund_score,
                'sentiment': sent_score,
                'correlation': corr_score
            }

            # Generate idea if confluence meets threshold
            if abs(confluence_score) >= self.confidence_min:
                direction = 'LONG' if confluence_score > 0 else 'SHORT'

                # Get current price from IronMan's timeframe data
                levels = self._extract_pair_levels(technical, pair)
                current_price = levels['current_price']

                if not current_price:
                    continue

                # Calculate levels
                entry_zone = self._calculate_entry_zone(technical, pair, direction)
                tp, sl = self._calculate_tp_sl(technical, pair, direction,
                                              entry_zone[1] if entry_zone[1] else current_price)

                entry_price = entry_zone[1] if entry_zone[1] else current_price

                if tp and sl:
                    risk_reward = self._calculate_risk_reward(entry_price, tp, sl)
                else:
                    risk_reward = None

                # Confidence level
                if abs(confluence_score) >= 6:
                    confidence = 'HIGH'
                elif abs(confluence_score) >= 4:
                    confidence = 'MEDIUM'
                else:
                    confidence = 'LOW'

                # Key reasoning
                reasons = []
                if tech_score > 0:
                    reasons.append(f"technical bullish (+{tech_score})")
                elif tech_score < 0:
                    reasons.append(f"technical bearish ({tech_score})")

                if fund_score != 0:
                    direction_fund = "event/CB support" if fund_score > 0 else "event/CB headwind"
                    reasons.append(direction_fund)

                if sent_score > 0:
                    reasons.append("strong momentum")

                reasoning = "; ".join(reasons) if reasons else "Confluence signal"

                idea = {
                    'pair': pair,
                    'direction': direction,
                    'entry_zone': {
                        'min': round(entry_zone[0], 6) if entry_zone[0] else None,
                        'max': round(entry_zone[1], 6) if entry_zone[1] else None,
                        'current': round(current_price, 6)
                    },
                    'take_profit': round(tp, 6) if tp else None,
                    'stop_loss': round(sl, 6) if sl else None,
                    'confidence': confidence,
                    'risk_reward': risk_reward,
                    'reasoning': reasoning,
                    'confluence_score': round(confluence_score, 2),
                    'signal_breakdown': pair_scores[pair]
                }

                trade_ideas.append(idea)

        # Risk warnings
        risk_warnings = []
        # CaptainAmerica uses 'today_events' (not 'high_impact_events_24h')
        today_events = fundamental.get('today_events', [])
        high_impact_today = [e for e in today_events if e.get('impact', 0) >= 4]
        if high_impact_today:
            risk_warnings.append(
                f"⚠️ {len(high_impact_today)} high-impact events today - "
                "mission parameters may shift"
            )

        correlation_warnings = correlation.get('divergences', [])
        high_severity_divs = [d for d in correlation_warnings if d['severity'] == 'HIGH']
        if high_severity_divs:
            risk_warnings.append(
                f"⚠️ {len(high_severity_divs)} major cross-realm divergences - "
                "collateral risk elevated"
            )

        result = {
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'success',
            'trade_ideas': sorted(
                trade_ideas,
                key=lambda x: abs(x['confluence_score']),
                reverse=True
            ),
            'pair_scores': pair_scores,
            'risk_warnings': risk_warnings,
            'total_ideas': len(trade_ideas),
            'high_confidence': len([i for i in trade_ideas if i['confidence'] == 'HIGH']),
            'medium_confidence': len([i for i in trade_ideas if i['confidence'] == 'MEDIUM'])
        }

        logger.info(f"Mission briefing compiled: {len(trade_ideas)} targets "
                   f"({result['high_confidence']} high-priority, {result['medium_confidence']} medium)")

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
            return f"❌ Mission briefing compilation failed"

        lines = [
            "🕷️ *WIDOW'S MISSION BRIEFING*",
            f"_{PERSONA}_",
            "",
        ]

        # Risk warnings
        for warning in ideas.get('risk_warnings', []):
            warning_escaped = warning.replace('-', '\\-')
            lines.append(warning_escaped)

        if ideas.get('risk_warnings'):
            lines.append("")

        # Trade ideas (mission targets)
        trade_ideas = ideas.get('trade_ideas', [])
        if not trade_ideas:
            lines.append("No targets with sufficient intelligence confluence")
            lines.append("")
        else:
            lines.append(f"*{len(trade_ideas)} Targets Acquired:*")
            lines.append("")

            for i, idea in enumerate(trade_ideas[:5], 1):
                pair = idea['pair'].replace('-', '\\-').replace('=', '\\=')
                direction = idea['direction']
                confidence = idea['confidence']
                confluence = idea['confluence_score']
                rr = idea['risk_reward']

                # Header
                emoji = "📈" if direction == "LONG" else "📉"
                conf_emoji = "🟢" if confidence == "HIGH" else "🟡" if confidence == "MEDIUM" else "⚪"
                lines.append(f"{i}\\. {emoji} {pair} {direction} {conf_emoji} {confidence} priority")

                # Entry
                entry_min = idea['entry_zone']['min']
                entry_max = idea['entry_zone']['max']
                entry_current = idea['entry_zone']['current']
                if entry_min and entry_max:
                    lines.append(
                        f"   Entry: {entry_min:.6g}\\-{entry_max:.6g} \\(current: {entry_current:.6g}\\)"
                    )

                # TP/SL
                tp = idea['take_profit']
                sl = idea['stop_loss']
                if tp and sl:
                    lines.append(f"   TP: {tp:.6g} | SL: {sl:.6g}")

                # Risk/Reward
                if rr:
                    lines.append(f"   RR: 1\\:{rr}")

                # Confluence
                lines.append(f"   Intel Score: {confluence} | Reasoning: {idea['reasoning']}")
                lines.append("")

        # Summary
        lines.append("*Mission Summary:*")
        lines.append(f"High Priority: {ideas['high_confidence']}")
        lines.append(f"Medium Priority: {ideas['medium_confidence']}")
        lines.append("")
        lines.append("_I've got red in my ledger. -- Black Widow_")

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
