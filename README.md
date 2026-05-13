# OpenClaw — Avengers Market Intelligence

> "Avengers, assemble!" — Your AI-powered market analyst team, themed as Earth's Mightiest Heroes.

OpenClaw is an open-source market intelligence system that deploys a team of AI agents — each with the personality of an Avenger — to analyze crypto and forex markets and deliver actionable daily briefings.

---

## Meet the Team

| Agent | Codename | Role |
|-------|----------|------|
| Iron Man | Tony Stark | **Technical Analysis** — Multi-timeframe EMA, RSI, MACD, support/resistance levels |
| Captain America | Steve Rogers | **Fundamental Analysis** — Economic calendar, central bank bias, rate differentials |
| Scarlet Witch | Wanda Maximoff | **Sentiment Analysis** — Fear & Greed Index, volume, momentum, market regime detection |
| Thor | Thor Odinson | **Correlation Tracking** — Cross-asset correlation matrix, DXY impact, divergence detection |
| Black Widow | Natasha Romanoff | **Trade Ideas** — Confluence scoring, entry/TP/SL levels, confidence ratings |
| Nick Fury | The Director | **Orchestrator** — Assembles the team, compiles briefings, delivers via Telegram |

---

## Assets Tracked

**Crypto:** BTC, ETH, SOL
**Forex:** EUR/USD, USD/CAD
**Commodities:** XAU/USD (Gold)
**Indices:** DXY (US Dollar Index), VIX (Volatility Index)

---

## Quick Start

### Install

```bash
pip install .
```

Or with Telegram delivery:

```bash
pip install ".[telegram]"
```

### Configure

Copy the example config and add your API keys:

```bash
cp configs/config.example.yaml configs/config.yaml
```

Set your Telegram bot token and chat ID in the config (or via environment variables):

```bash
export TELEGRAM_BOT_TOKEN="your-bot-token"
export TELEGRAM_CHAT_ID="your-chat-id"
```

### Run

```bash
# Run the full agent pipeline
openclaw

# Or run directly
python -m agents.nick_fury
```

Nick Fury will assemble the team, run all analyses, and deliver your briefing.

---

## Architecture

OpenClaw follows a three-stage pipeline:

```
Data Collection → Agent Synthesis → Delivery
```

1. **Data** — Each agent pulls market data via yfinance and external APIs (economic calendars, sentiment feeds).
2. **Synthesis** — Agents run their specialized analysis independently, then Nick Fury merges their findings into a unified briefing with confluence scores.
3. **Delivery** — The compiled report is sent via Telegram (or printed to console if Telegram is not configured).

---

## Also Includes

- **Optimized forex scalper bot** (`src/`) — A rules-based 1-5 minute scalping strategy with backtester and walk-forward validation.
- **n8n workflow templates** (`n8n_workflows/`) — Ready-to-import automation workflows for scheduling and alerting.
- **TradingView Pine Script** (`tradingview/`) — Webhook alert template for TradingView integration.

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Disclaimer

This software is for educational and research purposes only. It does not constitute financial advice. Trade at your own risk.

## License

[MIT](LICENSE) — Copyright (c) 2026 JJ
