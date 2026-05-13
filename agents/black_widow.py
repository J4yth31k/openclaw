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

    def __init__(self):
        """Initialize Black Widow - the intelligence synthesizer."""
        # Confluence scoring thresholds
        self.confluence_threshold_high = 4
        self.confluence_threshold_low = -4
        self.confidence_min = 3

    def _score_technical(self, tech_data: dict, pair: str) -> float:
        """
        Score technical signals.

        Points scale: -3 to +3
        - Trend alignment across timeframes: +/-2
        - Key level proximity: +/-1
        - Pattern signals: +/-2
        """
        score = 0

        if 'status' not in tech_data or tech_data['status'] != 'success':
            return 0

        pairs_analysis = tech_data.get('pairs', {})
        if pair not in pairs_analysis:
            return 0

        pair_tech = pairs_analysis[pair]

        # Trend alignment
        timeframes = ['1h', '4h', 'daily']
        bullish_count = 0
        for tf in timeframes:
            if tf in pair_tech:
                if pair_tech[tf].get('trend') == 'BULLISH':
                    bullish_count += 1

        if bullish_count == 3:
            score += 2
        elif bullish_count == 2:
            score += 1
        elif bullish_count == 0:
            score -= 2

        # Key level proximity
        if pair_tech.get('nearest_support_distance', float('inf')) < 0.003:
            score += 1  # Near support (bullish)
        elif pair_tech.get('nearest_resistance_distance', float('inf')) < 0.003:
            score -= 1  # Near resistance (bearish)

        # Pattern signals
        patterns = pair_tech.get('detected_patterns', [])
        bullish_patterns = ['breakout', 'hammer', 'inverse_head_shoulders']
        bearish_patterns = ['breakdown', 'shooting_star', 'head_shoulders']

        for pattern in patterns:
            if pattern in bullish_patterns:
                score += 1
            elif pattern in bearish_patterns:
                score -= 1

        return max(-3, min(3, score))

    def _score_fundamental(self, fund_data: dict, pair: str) -> float:
        """
        Score fundamental signals.

        Points scale: -2 to +2
        - Upcoming events that could move the pair
        - Central bank bias
        """
        score = 0

        if 'status' not in fund_data or fund_data['status'] != 'success':
            return 0

        pairs_events = fund_data.get('pairs', {})
        if pair not in pairs_events:
            return 0

        pair_fund = pairs_events[pair]

        # Check 24h events
        events_24h = pair_fund.get('events_24h', [])
        for event in events_24h:
            impact = event.get('impact', 'LOW')
            forecast = event.get('forecast')
            previous = event.get('previous')

            if impact == 'HIGH':
                # Look for beat/miss potential
                if forecast and previous:
                    try:
                        forecast_val = float(str(forecast).rstrip('%'))
                        previous_val = float(str(previous).rstrip('%'))
                        if forecast_val > previous_val:
                            score += 1  # Bullish bias
                        elif forecast_val < previous_val:
                            score -= 1  # Bearish bias
                    except (ValueError, TypeError):
                        pass

        # Central bank bias
        cb_bias = pair_fund.get('cb_bias')
        if cb_bias == 'HAWKISH':
            score += 1
        elif cb_bias == 'DOVISH':
            score -= 1

        return max(-2, min(2, score))

    def _score_sentiment(self, sent_data: dict, pair: str) -> float:
        """
        Score sentiment signals.

        Points scale: -2 to +2
        - Momentum score
        - Fear/greed index
        - Volume confirmation
        """
        score = 0

        if 'status' not in sent_data or sent_data['status'] != 'success':
            return 0

        pairs_sentiment = sent_data.get('pairs', {})
        if pair not in pairs_sentiment:
            return 0

        pair_sent = pairs_sentiment[pair]

        # Momentum score (0-100)
        momentum = pair_sent.get('momentum_score', 50)
        if momentum > 65:
            score += 1
        elif momentum < 35:
            score -= 1

        # Fear/greed (if available)
        if 'fear_greed' in pair_sent:
            fg = pair_sent['fear_greed']
            if fg == 'EXTREME_GREED':
                score += 1
            elif fg == 'EXTREME_FEAR':
                score -= 1

        # Volume confirmation
        vol_profile = pair_sent.get('volume_profile')
        if vol_profile == 'EXPANDING':
            score += 0.5

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

    def _calculate_entry_zone(self, tech_data: dict, pair: str, direction: str) -> tuple:
        """
        Calculate entry zone based on current price and nearest S/R.

        Returns:
            Tuple of (entry_min, entry_max, reference_price)
        """
        if pair not in tech_data.get('pairs', {}):
            return (None, None, None)

        pair_tech = tech_data['pairs'][pair]
        current = pair_tech.get('current_price')

        if not current:
            return (None, None, None)

        if direction == 'LONG':
            # Buy near support or at pullback
            support = pair_tech.get('nearest_support')
            if support:
                entry_min = support * 0.999  # Slightly below support
                entry_max = current * 0.998  # Pullback zone
                return (entry_min, entry_max, current)
            else:
                # Use ATR-based entry
                atr = pair_tech.get('atr', current * 0.005)
                return (current - atr, current, current)

        else:  # SHORT
            resistance = pair_tech.get('nearest_resistance')
            if resistance:
                entry_max = resistance * 1.001
                entry_min = current * 1.002
                return (entry_min, entry_max, current)
            else:
                atr = pair_tech.get('atr', current * 0.005)
                return (current, current + atr, current)

    def _calculate_tp_sl(self, tech_data: dict, pair: str, direction: str,
                         entry_price: float) -> tuple:
        """
        Calculate take profit and stop loss.

        Returns:
            Tuple of (take_profit, stop_loss)
        """
        if pair not in tech_data.get('pairs', {}):
            return (None, None)

        pair_tech = tech_data['pairs'][pair]
        current = pair_tech.get('current_price', entry_price)
        atr = pair_tech.get('atr', current * 0.005)

        if direction == 'LONG':
            # TP at next resistance
            resistance = pair_tech.get('next_resistance')
            if resistance:
                tp = resistance
            else:
                tp = entry_price + (atr * 2)

            # SL below support
            support = pair_tech.get('nearest_support')
            if support:
                sl = support * 0.999
            else:
                sl = entry_price - atr

        else:  # SHORT
            support = pair_tech.get('nearest_support')
            if support:
                tp = support
            else:
                tp = entry_price - (atr * 2)

            resistance = pair_tech.get('nearest_resistance')
            if resistance:
                sl = resistance * 1.001
            else:
                sl = entry_price + atr

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

                # Get tech data for calculations
                pair_tech = technical.get('pairs', {}).get(pair, {})
                current_price = pair_tech.get('current_price')

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
        events_24h = fundamental.get('high_impact_events_24h', [])
        if events_24h:
            risk_warnings.append(
                f"⚠️ {len(events_24h)} high-impact events within 24h - "
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

    # Mock data for testing
    mock_tech = {
        'status': 'success',
        'pairs': {
            'EURUSD=X': {
                'current_price': 1.0850,
                'trend': 'BULLISH',
                'atr': 0.0015,
                'nearest_support': 1.0800,
                'nearest_resistance': 1.0900
            }
        }
    }

    mock_fund = {'status': 'success', 'pairs': {'EURUSD=X': {'events_24h': []}}}
    mock_sent = {'status': 'success', 'pairs': {'EURUSD=X': {'momentum_score': 65}}}
    mock_corr = {'status': 'success', 'divergences': []}

    generator = BlackWidow()
    result = generator.generate(mock_tech, mock_fund, mock_sent, mock_corr)
    print(generator.format_report(result))
