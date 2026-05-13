# n8n Trading Bot Workflows - Complete Index

## Delivery Package Contents

### 5 Importable Workflow JSON Files

| File | Size | Nodes | Purpose | Trigger |
|------|------|-------|---------|---------|
| **news_scanner_agent.json** | 8.0 KB | 9 | Daily market news + sentiment analysis | Cron: Weekdays 7 AM UTC |
| **backtester_agent.json** | 12 KB | 8 | Strategy backtesting with metrics | Webhook (on-demand) |
| **strategy_optimizer_agent.json** | 12 KB | 9 | Weekly parameter walk-forward optimization | Cron: Sunday 10 PM UTC |
| **tradingview_signal_alerter.json** | 12 KB | 10 | Real-time TradingView alert processing | Webhook (real-time) |
| **performance_reporter_agent.json** | 16 KB | 9 | Weekly performance analysis & reporting | Cron: Friday 6 PM UTC |

**Total**: 60 KB, 45 nodes, 47 connections

### 2 Comprehensive Documentation Files

| File | Size | Purpose |
|------|------|---------|
| **README.md** | 8.6 KB | Overview, import instructions, architecture, customization |
| **INTEGRATION_GUIDE.md** | 14 KB | Step-by-step setup, credential config, testing, troubleshooting |

### This File

| File |
|------|
| **INDEX.md** (you are here) |

---

## Quick Reference

### Workflow Purposes

1. **news_scanner_agent** - Daily intelligent news digest
   - Fetches: CryptoCompare news, Fear & Greed index, forex calendars
   - Analyzes: AI-powered ranking of 10 most impactful items
   - Alerts: Discord + Telegram + JSON log

2. **backtester_agent** - On-demand strategy validation
   - Accepts: pair, timeframe, strategy parameters (via webhook)
   - Executes: Python backtesting script
   - Returns: Win rate, max drawdown, Sharpe ratio, equity metrics
   - Reports: Discord + Telegram + JSON file

3. **strategy_optimizer_agent** - Weekly parameter tuning
   - Runs: Walk-forward optimization for 6 trading pairs
   - Analyzes: Which parameters perform best
   - Recommends: Parameter adjustments via AI
   - Creates: config_candidate.yaml for manual review

4. **tradingview_signal_alerter** - Real-time trade signal handling
   - Receives: TradingView Pine Script alerts via webhook
   - Validates: Pair and action
   - Enriches: Entry, TP/SL levels, position sizing
   - Logs: Trade to trade_journal.json
   - Alerts: Discord + Telegram with full trade details

5. **performance_reporter_agent** - Weekly performance summary
   - Reads: trade_journal.json
   - Calculates: P&L, win rate, Sharpe ratio, per-pair stats
   - Analyzes: AI-generated narrative report
   - Reports: Discord embed + Telegram + JSON + CSV append

### Asset Pairs Supported

**Crypto**: BTCUSD, ETHUSD, SOLUSD
**Forex**: EURUSD, XAUUSD, USDCAD

### Notification Channels

- **Discord**: Rich embeds with formatted metrics
- **Telegram**: Text messages with key stats
- **JSON Files**: Detailed data logging for analysis
- **CSV**: Weekly summary for long-term tracking

### Required Credentials (3 total)

```
discord_webhook_credential   → Discord server webhook URL
telegram_bot_credential     → Telegram bot token + chat ID
openai_api_credential       → OpenAI API key for AI analysis
```

### External Dependencies (3 files to create)

```
backtester.py      → Python script for backtesting
optimizer.py       → Python script for optimization
config.yaml        → Trading configuration file
```

---

## Setup Workflow

### Step 1: Credentials (15 min)
1. Create Discord webhook in Discord server settings
2. Create Telegram bot via @BotFather
3. Get OpenAI API key from platform.openai.com
4. Add all 3 as n8n credentials

### Step 2: Python Scripts (20 min)
1. Create backtester.py with expected interface
2. Create optimizer.py with expected interface
3. Ensure scripts output metrics to stdout

### Step 3: Import Workflows (10 min)
1. Go to n8n → Workflows → Import
2. Import all 5 JSON files (will be inactive)
3. Verify no errors

### Step 4: Configure (10 min)
1. Copy TradingView alert webhook URL
2. Configure webhook in TradingView alerts
3. Verify credential references in each workflow

### Step 5: Activate (5 min)
1. Open each workflow
2. Settings → Active (toggle on)
3. Verify all 5 show as "active"

### Step 6: Test (30 min)
1. Test signal alerter with curl
2. Run news scanner manually
3. Test backtester via webhook
4. Monitor Discord/Telegram for outputs

**Total Setup Time**: ~90 minutes

---

## Data Flow Architecture

```
INPUTS                         WORKFLOWS                    OUTPUTS
────────────────────────────────────────────────────────────────────────
                           
TradingView              tradingview_signal_alerter      trade_journal.json
Pine Scripts                    ├─ Validates             Discord alerts
(webhooks)                      ├─ Enriches              Telegram alerts
                                └─ Logs
                                    │
Market News APIs          news_scanner_agent             Discord/Telegram
(HTTP requests)               ├─ Fetches                 logs/news_digest_*.json
                              ├─ Analyzes
                              └─ Reports
                                    │
Python Backtester         backtester_agent              backtest_results/
(on-demand)                   ├─ Executes               Discord/Telegram
                              ├─ Parses
                              └─ Reports
                                    │
Python Optimizer          strategy_optimizer_agent      optimization_reports/
(weekly)                      ├─ Optimizes              config_candidate.yaml
                              ├─ Analyzes              Discord/Telegram
                              └─ Recommends
                                    │
Trade Journal             performance_reporter_agent    weekly_reports/
(accumulated)                 ├─ Calculates             reports_csv/summary.csv
                              ├─ Analyzes              Discord/Telegram
                              └─ Reports
```

---

## File Locations

All files are in:
```
/sessions/busy-awesome-noether/mnt/forex_scalper_bot/n8n_workflows/
```

Copy this entire directory into your n8n instance or version control system.

---

## Customization Points

| Workflow | Customize | How |
|----------|-----------|-----|
| **news_scanner** | Schedule | Edit "Schedule Trigger" rule |
| **news_scanner** | News sources | Add HTTP nodes before "Combine News Data" |
| **backtester** | Python args | Edit "Execute Command" node |
| **optimizer** | Pairs list | Edit "Setup Optimization" assignments |
| **optimizer** | Optimization mode | Edit Execute Command (add --mode grid_search) |
| **signal_alerter** | Allowed pairs | Edit "Validate Signal" If conditions |
| **signal_alerter** | Position sizing | Edit "Enrich with Entry/TP/SL" code |
| **performance_reporter** | Schedule | Edit "Weekly Schedule" rule |

---

## Monitoring & Maintenance

### Daily
- Check Discord for signal alerts
- Verify trade journal is updating

### Weekly
- Review optimization report
- Check performance metrics
- Monitor Telegram alerts

### Monthly
- Archive old reports
- Review backtest results
- Update strategy parameters

### Quarterly
- Rotate API credentials
- Update Python scripts
- Review optimization trends

---

## Troubleshooting Quick Links

- **Webhook not receiving**: INTEGRATION_GUIDE.md → Testing & Validation
- **Credentials not found**: INTEGRATION_GUIDE.md → Phase 1: Credential Configuration
- **Python script errors**: INTEGRATION_GUIDE.md → Phase 4: Supporting Python Scripts
- **Alerts not sending**: INTEGRATION_GUIDE.md → Troubleshooting Matrix
- **Customization needed**: README.md → Customization Guide

---

## Support

For detailed information:
- **Setup instructions**: See INTEGRATION_GUIDE.md
- **Workflow details**: See README.md
- **Troubleshooting**: See INTEGRATION_GUIDE.md → Troubleshooting Matrix

---

## Version Info

- **Created**: 2026-04-17
- **n8n Version**: 1.0+
- **Compatibility**: Self-hosted and cloud instances
- **Workflows**: 5 production-ready templates
- **Total Lines**: 1,086 JSON configuration lines

---

## Next Steps

1. Read INTEGRATION_GUIDE.md from start to finish
2. Gather credentials (Discord, Telegram, OpenAI)
3. Create Python scripts (backtester.py, optimizer.py)
4. Import all 5 JSON workflows
5. Test each workflow with sample data
6. Activate all workflows
7. Monitor Discord/Telegram channels

Happy trading!

