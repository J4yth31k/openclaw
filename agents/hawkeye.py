"""
Hawkeye (Clint Barton) - TradingView Webhook Receiver Agent

"I see better from a distance." -- Clint Barton

Hawkeye watches for incoming TradingView webhook alerts and processes them
in real-time. He logs every signal, enriches it with context from the other
Avengers, and forwards it to Telegram instantly.

Run as a standalone Flask server:
    python hawkeye.py --port 5000 --telegram-token YOUR_TOKEN --chat-id YOUR_ID

Then point your TradingView alert webhook to:
    http://YOUR_SERVER_IP:5000/webhook
"""

import argparse
import json
import logging
import os
import csv
from datetime import datetime
from typing import Optional, Dict
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import requests

logger = logging.getLogger('hawkeye')

PERSONA = "I see better from a distance. Every signal, every movement -- nothing escapes my eye."

# Trade journal file
TRADE_JOURNAL = os.path.join(os.path.dirname(__file__), '..', 'trade_journal.json')
TRADE_CSV = os.path.join(os.path.dirname(__file__), '..', 'trade_journal.csv')


class SignalLog:
    """Logs all incoming TradingView signals to JSON and CSV."""

    def __init__(self, json_path: str = TRADE_JOURNAL, csv_path: str = TRADE_CSV):
        self.json_path = json_path
        self.csv_path = csv_path
        self._ensure_files()

    def _ensure_files(self):
        """Create log files if they don't exist."""
        if not os.path.exists(self.json_path):
            with open(self.json_path, 'w') as f:
                json.dump([], f)

        if not os.path.exists(self.csv_path):
            with open(self.csv_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'timestamp', 'ticker', 'action', 'price',
                    'tp', 'sl', 'strategy', 'timeframe', 'source'
                ])

    def log_signal(self, signal: dict):
        """Append signal to both JSON and CSV logs."""
        # JSON
        try:
            with open(self.json_path, 'r') as f:
                signals = json.load(f)
            signals.append(signal)
            # Keep last 1000 signals
            if len(signals) > 1000:
                signals = signals[-1000:]
            with open(self.json_path, 'w') as f:
                json.dump(signals, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error writing JSON log: {e}")

        # CSV
        try:
            with open(self.csv_path, 'a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([
                    signal.get('received_at', ''),
                    signal.get('ticker', ''),
                    signal.get('action', ''),
                    signal.get('price', ''),
                    signal.get('tp', ''),
                    signal.get('sl', ''),
                    signal.get('strategy', ''),
                    signal.get('timeframe', ''),
                    'tradingview'
                ])
        except Exception as e:
            logger.error(f"Error writing CSV log: {e}")

    def get_recent(self, count: int = 20) -> list:
        """Get the most recent signals."""
        try:
            with open(self.json_path, 'r') as f:
                signals = json.load(f)
            return signals[-count:]
        except Exception:
            return []

    def get_stats(self) -> dict:
        """Get signal statistics."""
        try:
            with open(self.json_path, 'r') as f:
                signals = json.load(f)

            if not signals:
                return {'total': 0}

            buys = sum(1 for s in signals if s.get('action', '').upper() in ('BUY', 'LONG'))
            sells = sum(1 for s in signals if s.get('action', '').upper() in ('SELL', 'SHORT'))
            tickers = {}
            for s in signals:
                t = s.get('ticker', 'UNKNOWN')
                tickers[t] = tickers.get(t, 0) + 1

            return {
                'total': len(signals),
                'buys': buys,
                'sells': sells,
                'by_ticker': tickers,
                'last_signal': signals[-1].get('received_at', 'N/A')
            }
        except Exception:
            return {'total': 0}


class Hawkeye:
    """
    Clint Barton's eagle-eye webhook receiver.

    Receives TradingView alerts, validates them, logs them,
    and fires them off to Telegram.
    """

    REQUIRED_FIELDS = ['ticker', 'action']

    def __init__(self, telegram_token: str = None, chat_id: str = None):
        self.telegram_token = telegram_token
        self.chat_id = chat_id
        self.signal_log = SignalLog()
        logger.info("Hawkeye online. Eyes on the target.")

    def validate_signal(self, payload: dict) -> tuple[bool, str]:
        """
        Validate incoming webhook payload.

        Expected format from Pine Script:
        {
            "ticker": "BTCUSD",
            "action": "buy",
            "price": 104000,
            "strategy": "EMA_RSI_Scalper",
            "timeframe": "1m",
            "tp": 104080,
            "sl": 103940,
            "timestamp": "2026-05-13T..."
        }
        """
        for field in self.REQUIRED_FIELDS:
            if field not in payload:
                return False, f"Missing required field: {field}"

        action = payload.get('action', '').upper()
        if action not in ('BUY', 'SELL', 'LONG', 'SHORT', 'CLOSE'):
            return False, f"Invalid action: {action}"

        return True, "Valid"

    def process_signal(self, payload: dict) -> dict:
        """
        Process and enrich an incoming signal.

        Returns enriched signal dict.
        """
        signal = {
            'received_at': datetime.utcnow().isoformat(),
            'ticker': payload.get('ticker', 'UNKNOWN').upper(),
            'action': payload.get('action', '').upper(),
            'price': payload.get('price'),
            'tp': payload.get('tp'),
            'sl': payload.get('sl'),
            'strategy': payload.get('strategy', 'Unknown'),
            'timeframe': payload.get('timeframe', 'N/A'),
            'source_timestamp': payload.get('timestamp', ''),
            'message': payload.get('message', ''),
        }

        # Calculate risk:reward if TP and SL are present
        if signal['price'] and signal['tp'] and signal['sl']:
            try:
                price = float(signal['price'])
                tp = float(signal['tp'])
                sl = float(signal['sl'])

                if signal['action'] in ('BUY', 'LONG'):
                    reward = tp - price
                    risk = price - sl
                else:
                    reward = price - tp
                    risk = sl - price

                if risk > 0:
                    signal['risk_reward'] = round(reward / risk, 2)
                else:
                    signal['risk_reward'] = None

                signal['risk_pips'] = round(abs(risk), 2)
                signal['reward_pips'] = round(abs(reward), 2)
            except (ValueError, TypeError):
                signal['risk_reward'] = None

        # Log the signal
        self.signal_log.log_signal(signal)
        logger.info(f"🏹 Signal logged: {signal['action']} {signal['ticker']} @ {signal['price']}")

        return signal

    def format_telegram_alert(self, signal: dict) -> str:
        """Format signal as a Telegram message."""
        action = signal['action']
        ticker = signal['ticker']
        price = signal.get('price', 'N/A')

        # Direction emoji
        if action in ('BUY', 'LONG'):
            emoji = '🟢🔺'
            direction = 'LONG'
        elif action in ('SELL', 'SHORT'):
            emoji = '🔴🔻'
            direction = 'SHORT'
        else:
            emoji = '⚪'
            direction = action

        lines = [
            f"🏹 *HAWKEYE ALERT*",
            f"_\"I never miss.\"_",
            f"",
            f"{emoji} *{direction} {ticker}*",
            f"",
            f"📍 Entry: `{price}`",
        ]

        if signal.get('tp'):
            lines.append(f"🎯 Take Profit: `{signal['tp']}`")
        if signal.get('sl'):
            lines.append(f"🛑 Stop Loss: `{signal['sl']}`")
        if signal.get('risk_reward'):
            lines.append(f"⚖️ Risk:Reward: `1:{signal['risk_reward']}`")

        lines.append(f"")
        lines.append(f"📊 Strategy: {signal.get('strategy', 'N/A')}")
        lines.append(f"⏱️ Timeframe: {signal.get('timeframe', 'N/A')}")
        lines.append(f"🕐 {signal['received_at'][:19]} UTC")

        return "\n".join(lines)

    def send_telegram(self, message: str) -> bool:
        """Send alert to Telegram."""
        if not self.telegram_token or not self.chat_id:
            logger.warning("Telegram not configured - skipping send")
            return False

        try:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            payload = {
                'chat_id': self.chat_id,
                'text': message,
                'parse_mode': 'Markdown'
            }
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                logger.info("📱 Alert sent to Telegram")
                return True
            else:
                logger.error(f"Telegram error: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return False

    def handle_webhook(self, raw_body: str) -> dict:
        """
        Main entry point for processing a webhook.

        Args:
            raw_body: Raw JSON string from TradingView

        Returns:
            Response dict with status
        """
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            return {'status': 'error', 'message': 'Invalid JSON'}

        # Validate
        valid, reason = self.validate_signal(payload)
        if not valid:
            return {'status': 'error', 'message': reason}

        # Process
        signal = self.process_signal(payload)

        # Alert via Telegram
        alert_msg = self.format_telegram_alert(signal)
        self.send_telegram(alert_msg)

        return {
            'status': 'ok',
            'signal': signal
        }


# ============================================================================
# HTTP SERVER (standalone mode)
# ============================================================================

_hawkeye_instance: Optional[Hawkeye] = None


class WebhookHandler(BaseHTTPRequestHandler):
    """HTTP handler for TradingView webhooks."""

    def do_POST(self):
        if self.path == '/webhook':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')

            logger.info(f"🏹 Incoming webhook: {body[:200]}")
            result = _hawkeye_instance.handle_webhook(body)

            self.send_response(200 if result['status'] == 'ok' else 400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            stats = _hawkeye_instance.signal_log.get_stats()
            self.wfile.write(json.dumps({
                'status': 'Hawkeye online',
                'persona': PERSONA,
                'stats': stats
            }).encode())

        elif self.path == '/signals':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            recent = _hawkeye_instance.signal_log.get_recent(20)
            self.wfile.write(json.dumps(recent, default=str).encode())

        else:
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b"""
            <h1>&#127993; Hawkeye - TradingView Webhook Receiver</h1>
            <p><i>"I see better from a distance."</i></p>
            <ul>
                <li><b>POST /webhook</b> - Receive TradingView alerts</li>
                <li><b>GET /health</b> - Server status + signal stats</li>
                <li><b>GET /signals</b> - Recent signals (JSON)</li>
            </ul>
            """)

    def log_message(self, format, *args):
        """Suppress default HTTP logs, use our logger instead."""
        pass


def main():
    """CLI entry point for Hawkeye webhook server."""
    global _hawkeye_instance

    parser = argparse.ArgumentParser(
        description='Hawkeye - TradingView Webhook Receiver',
        epilog='''
Examples:
  # Start webhook server on port 5000
  python hawkeye.py --port 5000

  # With Telegram alerts
  python hawkeye.py --port 5000 --telegram-token BOT_TOKEN --chat-id 123456

  # Test with curl:
  curl -X POST http://localhost:5000/webhook \\
    -H "Content-Type: application/json" \\
    -d '{"ticker":"BTCUSD","action":"buy","price":104000,"tp":104080,"sl":103940,"strategy":"EMA_RSI","timeframe":"1m"}'
        '''
    )

    parser.add_argument('--port', type=int, default=5000, help='Port to listen on (default: 5000)')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind to (default: 0.0.0.0)')
    parser.add_argument('--telegram-token', type=str, help='Telegram Bot API token')
    parser.add_argument('--chat-id', type=str, help='Telegram chat ID')

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    _hawkeye_instance = Hawkeye(
        telegram_token=args.telegram_token,
        chat_id=args.chat_id
    )

    server = HTTPServer((args.host, args.port), WebhookHandler)

    print(f"""
    ╔══════════════════════════════════════════════╗
    ║  🏹 HAWKEYE - TradingView Webhook Receiver  ║
    ║  "I see better from a distance."            ║
    ╠══════════════════════════════════════════════╣
    ║  Server: http://{args.host}:{args.port}              ║
    ║  Webhook: POST /webhook                     ║
    ║  Health:  GET  /health                      ║
    ║  Signals: GET  /signals                     ║
    ║  Telegram: {'✓ Connected' if args.telegram_token else '✗ Not configured'}                   ║
    ╚══════════════════════════════════════════════╝
    """)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Hawkeye signing off.")
        server.shutdown()


if __name__ == '__main__':
    main()
