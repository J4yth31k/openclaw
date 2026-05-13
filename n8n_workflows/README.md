# n8n Trading Agent Team Workflows

This directory contains 5 importable n8n workflow JSON files for an automated forex and crypto trading agent system.

## Workflows

### 1. **news_scanner_agent.json**
- **Trigger**: Cron (every weekday at 7 AM UTC)
- **Purpose**: Fetches and analyzes market news from CryptoCompare, Fear & Greed Index, and forex sources
- **Output**: Summarized top-10 news digest with AI analysis
- **Notifications**: Discord embed + Telegram message + JSON log file
- **Key Nodes**: HTTP requests, AI Agent (Claude/OpenAI), Discord/Telegram senders

### 2. **backtester_agent.json**
- **Trigger**: Webhook (on-demand or scheduled)
- **Purpose**: Runs Python backtesting script for strategy validation
- **Input Parameters**: pair, timeframe, strategy_params
- **Output**: Performance metrics (win rate, max drawdown, Sharpe ratio, equity curve)
- **Notifications**: Discord embed + Telegram + JSON result file
- **Key Nodes**: Webhook, Execute Command (Python), Code parsing, Discord/Telegram

### 3. **strategy_optimizer_agent.json**
- **Trigger**: Cron (every Sunday at 10 PM UTC)
- **Purpose**: Walk-forward optimization for parameter tuning across all trading pairs
- **Pairs**: BTCUSD, ETHUSD, SOLUSD, EURUSD, XAUUSD, USDCAD
- **Output**: Best/worst performer analysis + AI recommendations
- **Side Effect**: Creates config_candidate.yaml for manual review
- **Notifications**: Discord + Telegram + detailed JSON report
- **Key Nodes**: Schedule, Execute Command, AI Agent, Config generator

### 4. **tradingview_signal_alerter.json**
- **Trigger**: Webhook (receives TradingView alert POST)
- **Purpose**: Real-time alert handling from TradingView Pine Scripts
- **Input Payload**: ticker, action (buy/sell/close), price, strategy, timeframe, message
- **Processing**: Validates pair + action, enriches with entry/TP/SL levels, logs to trade journal
- **Output**: Position sizing and risk/reward calculations
- **Notifications**: Discord rich embed + Telegram alert
- **Storage**: trade_journal.json (used by Performance Reporter)
- **Key Nodes**: Webhook, If (validation), HTTP (price check), Code (enrichment), Discord/Telegram

### 5. **performance_reporter_agent.json**
- **Trigger**: Cron (every Friday at 6 PM UTC)
- **Purpose**: Weekly performance analysis from trade journal
- **Metrics**: Total P&L, win rate, Sharpe ratio, max drawdown, profit factor, per-pair stats
- **AI Analysis**: GPT-4 narrative report with recommendations
- **Output**: Discord embed + Telegram message + JSON report + CSV history
- **Storage**: Appends to weekly_summary.csv for historical tracking
- **Key Nodes**: Schedule, Code (metrics calculation), AI Agent, Discord/Telegram, File storage

## Import Instructions

### Step 1: Prepare n8n Instance
- Ensure n8n is running and you have admin access
- Go to Workflows → Import

### Step 2: Import Each Workflow
1. Click "Import from file"
2. Select each JSON file from this directory
3. Workflows import in inactive state (safe for configuration)

### Step 3: Configure Credentials
All workflows require these credentials. Set them up once in n8n:

**Discord Webhook** (credential: `discord_webhook_credential`)
- Create in Discord server → Channel → Integrations → Webhooks
- Copy webhook URL
- In n8n: New Credential → Discord → Webhook URL

**Telegram Bot** (credential: `telegram_bot_credential`)
- Message @BotFather on Telegram
- Create new bot → get token and your chat ID
- In n8n: New Credential → Telegram → Bot Token + Chat ID

**OpenAI API** (credential: `openai_api_credential`)
- Get key from https://platform.openai.com/api-keys
- In n8n: New Credential → OpenAI → API Key

### Step 4: Update Webhook URLs in Workflows
For workflows that receive webhooks:

**tradingview_signal_alerter.json**:
- Copy webhook URL from "TradingView Alert Webhook" node
- In TradingView alerts, use: `[your-n8n-instance]/webhook/tradingview-alert`

**backtester_agent.json**:
- Copy webhook URL from "Webhook Trigger" node
- Use for on-demand backtest requests

### Step 5: Prepare Supporting Files
Create these files/directories before activating workflows:

```
/sessions/busy-awesome-noether/mnt/forex_scalper_bot/
├── backtester.py                 # Python backtesting script
├── optimizer.py                  # Python walk-forward optimizer
├── config.yaml                   # Trading configuration
├── trade_journal.json            # Auto-created by Signal Alerter
├── logs/                         # News digests (auto-created)
├── backtest_results/             # Backtest outputs (auto-created)
├── optimization_reports/         # Optimization results (auto-created)
└── weekly_reports/               # Performance reports (auto-created)
```

### Step 6: Activate Workflows
1. For each workflow: Settings → Active (toggle on)
2. Confirm in workflow list that status shows "active"
3. Schedules will start at their configured times
4. Webhooks are immediately available

## Data Flow Architecture

```
TradingView Pine Script
        ↓
        └─→ tradingview_signal_alerter
            ├─→ trade_journal.json
            ├─→ Discord/Telegram
            └─→ (daily, real-time)

        ↓
Scheduled Triggers:
  Mon-Fri 7 AM UTC  → news_scanner_agent     → Discord/Telegram + news digest
  On-demand         → backtester_agent       → backtest_results/ + alerts
  Sunday 10 PM UTC  → strategy_optimizer     → optimization_reports/ + config candidate
  Friday 6 PM UTC   → performance_reporter   → weekly_reports/ + summary CSV

        ↓
Storage:
  - trade_journal.json: Real-time signal log
  - backtest_results/: Historical backtest data
  - optimization_reports/: Parameter tuning history
  - weekly_reports/: Performance analytics
  - reports_csv/weekly_summary.csv: Summary metrics over time
```

## Customization Guide

### News Scanner
- **Change Schedule**: Edit "Schedule Trigger" node rule (currently `everyWeekDay` at 7 AM UTC)
- **Add News Sources**: Add more HTTP Request nodes before "Combine News Data"
- **Customize Analysis**: Modify AI Agent prompt

### Backtester
- **Python Script**: Ensure backtester.py outputs metrics in expected format
- **Parameter Passing**: Uses `--pair`, `--timeframe`, `--params` flags
- **Output Parsing**: Edit "Parse Backtest Results" code node to match script output

### Strategy Optimizer
- **Pairs List**: Edit "Setup Optimization" node (currently 6 pairs)
- **Optimization Mode**: Add `--mode grid_search` or `--mode genetic` in "Run Walk-Forward Optimizer"
- **Config Update**: Enable "Create Config Candidate" to auto-apply (not recommended without review)

### TradingView Alerter
- **Position Sizing**: Adjust in "Enrich with Entry/TP/SL" code node
- **Validation Rules**: Edit "Validate Signal" If node to allow additional pairs/actions
- **Price Source**: Replace HTTP call with your broker's API if needed

### Performance Reporter
- **Report Schedule**: Edit "Weekly Schedule" (currently Friday 6 PM UTC)
- **CSV Output**: CSV file auto-appends; clear monthly if needed
- **Metrics Calculation**: Adjust in "Calculate Performance Metrics" code node

## Troubleshooting

### Credentials Not Found
- Verify credential IDs match exactly: `discord_webhook_credential`, `telegram_bot_credential`, `openai_api_credential`
- Check n8n Credentials page for typos in names

### Webhook Not Receiving Alerts
- Verify webhook URL is correct (copy from workflow)
- Check TradingView alert configuration
- Test with curl: `curl -X POST [webhook-url] -H "Content-Type: application/json" -d '{"ticker":"BTCUSD","action":"buy",...}'`

### Python Scripts Fail
- Ensure backtester.py and optimizer.py exist at expected paths
- Verify script outputs match parsing expectations
- Check /tmp/optimization_results.json exists after optimizer runs

### Discord/Telegram Not Sending
- Test credentials: `curl -X POST [discord-webhook-url] -d "content=test"`
- Verify bot has message permissions in Discord
- Ensure Telegram bot is running and bot token is correct

## Production Checklist

- [ ] All 5 credentials configured
- [ ] Webhook URLs copied to external systems (TradingView)
- [ ] Supporting Python scripts (backtester.py, optimizer.py) in place
- [ ] Directories created: logs/, backtest_results/, etc.
- [ ] config.yaml exists with initial strategy parameters
- [ ] All 5 workflows activated
- [ ] Test each workflow manually before relying on schedules
- [ ] Set up Discord/Telegram channels for alerts
- [ ] Document alert handling procedures for team

## License & Support

These workflows are templates designed for the forex_scalper_bot trading system. Modify as needed for your infrastructure and trading strategy.
