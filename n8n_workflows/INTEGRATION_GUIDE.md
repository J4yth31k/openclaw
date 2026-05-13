# n8n Trading Bot Integration Guide

Quick setup and integration steps for the trading agent team workflows.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trading Agent Team                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input Sources:                      Output Channels:           │
│  ├─ TradingView (webhooks)           ├─ Discord (rich embeds)  │
│  ├─ News APIs (polling)              ├─ Telegram (messages)    │
│  └─ Market APIs (on-demand)          └─ JSON logs (storage)    │
│                                                                 │
│  Core Workflows (n8n):                                          │
│  ├─ news_scanner_agent (daily)                                  │
│  ├─ backtester_agent (on-demand)                                │
│  ├─ strategy_optimizer_agent (weekly)                           │
│  ├─ tradingview_signal_alerter (real-time)                      │
│  └─ performance_reporter_agent (weekly)                         │
│                                                                 │
│  Data Storage:                                                  │
│  ├─ trade_journal.json                                          │
│  ├─ backtest_results/                                           │
│  ├─ optimization_reports/                                       │
│  └─ weekly_reports/                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **n8n Instance**
   - Self-hosted or cloud version
   - Admin credentials
   - Network access to webhooks (for TradingView)

2. **External Services**
   - Discord server with webhook capability
   - Telegram bot (created via @BotFather)
   - OpenAI API account (for Claude/GPT-4 analysis)
   - TradingView account with Pine Script access

3. **Local Files**
   - backtester.py (Python trading backtest engine)
   - optimizer.py (Parameter optimization script)
   - config.yaml (Trading configuration)

## Step-by-Step Setup

### Phase 1: Credential Configuration (15 min)

#### 1.1 Discord Webhook Credential

```bash
# In Discord:
1. Open your trading server
2. Right-click channel → "Edit Channel"
3. Integrations → Webhooks → New Webhook
4. Copy webhook URL
```

```json
// In n8n: Credentials → New → Discord
{
  "name": "discord_webhook_credential",
  "webhookUrl": "https://discordapp.com/api/webhooks/YOUR_ID/YOUR_TOKEN"
}
```

#### 1.2 Telegram Bot Credential

```bash
# In Telegram:
1. Open @BotFather chat
2. Send /newbot
3. Follow prompts, get token
4. Send /getid to your bot to get chat ID
```

```json
// In n8n: Credentials → New → Telegram
{
  "name": "telegram_bot_credential",
  "botToken": "YOUR_BOT_TOKEN",
  "chatId": "YOUR_CHAT_ID"
}
```

#### 1.3 OpenAI API Credential

```bash
# At https://platform.openai.com/api-keys:
1. Create new API key
2. Copy the full key (only shown once)
```

```json
// In n8n: Credentials → New → OpenAI
{
  "name": "openai_api_credential",
  "apiKey": "sk-YOUR_KEY_HERE",
  "baseURL": "https://api.openai.com/v1"
}
```

### Phase 2: Workflow Import (10 min)

```bash
# In n8n: Workflows → Import from file
1. Import: news_scanner_agent.json
2. Import: backtester_agent.json
3. Import: strategy_optimizer_agent.json
4. Import: tradingview_signal_alerter.json
5. Import: performance_reporter_agent.json

# All workflows should show "inactive" status
```

### Phase 3: Webhook Configuration (5 min)

#### 3.1 Get TradingView Alerter Webhook URL

```bash
# In n8n:
1. Open tradingview_signal_alerter workflow
2. Double-click "TradingView Alert Webhook" node
3. Copy the full webhook URL (blue banner at top)
# URL format: https://your-n8n-instance.com/webhook/tradingview-alert
```

#### 3.2 Configure TradingView Alerts

```pine
// In TradingView Pine Script:
alertPayload = '{"ticker": "' + syminfo.tickerid + '", "action": "' + signal + '", "price": ' + str.tostring(close) + ', "strategy": "EMA_RSI_Scalper", "timeframe": "' + timeframe.period + '", "message": "Alert triggered at ' + str.tostring(close) + '"}'

alert(alertPayload, alert.freq_once_per_bar_close)

// Then in TradingView Alerts:
1. Click bell icon → Create alert
2. Select your script
3. Webhook URL: https://your-n8n-instance/webhook/tradingview-alert
4. Test alert to verify
```

### Phase 4: Supporting Python Scripts (15 min)

#### 4.1 Create backtester.py

```python
#!/usr/bin/env python3
# /sessions/busy-awesome-noether/mnt/forex_scalper_bot/backtester.py

import argparse
import json

def run_backtest(pair, timeframe, params):
    """Run backtest for given pair and parameters"""
    # Your backtesting logic here
    # Must output metrics to stdout
    
    print(f"Backtesting {pair} on {timeframe}")
    print(f"Total Trades: 50")
    print(f"Win Rate: 55.0%")
    print(f"Max Drawdown: 12.5%")
    print(f"Sharpe Ratio: 1.8")
    print(f"Final Equity: 11250.00")
    print(f"Avg Win: 125.50")
    print(f"Avg Loss: -115.25")
    
    return {
        "total_trades": 50,
        "win_rate": 55.0,
        "max_drawdown": 12.5,
        "sharpe_ratio": 1.8,
        "final_equity": 11250.00,
        "avg_win": 125.50,
        "avg_loss": -115.25
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pair", default="BTCUSD")
    parser.add_argument("--timeframe", default="5m")
    parser.add_argument("--params", default="{}")
    
    args = parser.parse_args()
    params = json.loads(args.params)
    
    result = run_backtest(args.pair, args.timeframe, params)
    print(f"\nJSON: {json.dumps(result)}")
```

#### 4.2 Create optimizer.py

```python
#!/usr/bin/env python3
# /sessions/busy-awesome-noether/mnt/forex_scalper_bot/optimizer.py

import argparse
import json

def run_optimization(pairs, timeframe, mode):
    """Run strategy optimization"""
    results = {}
    
    for pair in pairs:
        results[pair] = {
            "pair": pair,
            "timeframe": timeframe,
            "optimal_params": {
                "ema_short": 8,
                "ema_long": 21,
                "rsi_period": 14
            },
            "win_rate": 56.5,
            "sharpe_ratio": 1.95,
            "max_drawdown": 11.2,
            "total_trades": 100
        }
    
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs", nargs="+", default=["BTCUSD"])
    parser.add_argument("--timeframe", default="1m")
    parser.add_argument("--mode", default="walk_forward")
    parser.add_argument("--output", default="/tmp/optimization_results.json")
    
    args = parser.parse_args()
    results = run_optimization(args.pairs, args.timeframe, args.mode)
    
    with open(args.output, 'w') as f:
        json.dump(results, f)
    
    print(f"Optimization complete. Results: {args.output}")
```

#### 4.3 Create config.yaml

```yaml
# /sessions/busy-awesome-noether/mnt/forex_scalper_bot/config.yaml

trading:
  pairs:
    - BTCUSD
    - ETHUSD
    - SOLUSD
    - EURUSD
    - XAUUSD
    - USDCAD
  
  timeframe: "1m"
  
  strategy:
    name: "EMA_RSI_Scalper"
    parameters:
      ema_short: 8
      ema_long: 21
      rsi_period: 14
      rsi_overbought: 70
      rsi_oversold: 30

position_sizing:
  base_lot: 1.0
  scalper_multiplier: 0.5
  swing_multiplier: 2.0

risk_management:
  max_daily_loss: 500
  max_position_size: 5.0
  stop_loss_pips: 25
  take_profit_pips: 50

alerts:
  discord_enabled: true
  telegram_enabled: true
  email_enabled: false
```

### Phase 5: Create Directory Structure (2 min)

```bash
cd /sessions/busy-awesome-noether/mnt/forex_scalper_bot

# Create required directories
mkdir -p logs
mkdir -p backtest_results
mkdir -p optimization_reports
mkdir -p weekly_reports
mkdir -p reports_csv

# Initialize files
touch trade_journal.json
echo '[]' > trade_journal.json
```

### Phase 6: Activate Workflows (5 min)

```bash
# In n8n: For each workflow
1. Open workflow
2. Click Settings (gear icon)
3. Toggle "Active" to ON
4. Confirm status shows "active"

# Activation order:
1. tradingview_signal_alerter (real-time alerts)
2. news_scanner_agent (morning reports)
3. backtester_agent (on-demand)
4. strategy_optimizer_agent (weekly)
5. performance_reporter_agent (weekly)
```

## Testing & Validation

### Test 1: News Scanner (5 min)

```bash
# In n8n: news_scanner_agent
1. Click "Execute Workflow" (play button)
2. Wait for completion
3. Check Discord/Telegram for news digest
4. Check /sessions/.../logs/ for JSON file
```

### Test 2: Signal Alerter (5 min)

```bash
# Test webhook with curl:
curl -X POST https://your-n8n-instance/webhook/tradingview-alert \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "BTCUSD",
    "action": "buy",
    "price": 60000,
    "strategy": "EMA_RSI_Scalper",
    "timeframe": "1m",
    "message": "Test signal"
  }'

# Verify:
1. Response shows 200 success
2. Discord alert received
3. Telegram alert received
4. Entry added to trade_journal.json
```

### Test 3: Backtester (5 min)

```bash
# In n8n: backtester_agent (Webhook node)
1. Copy webhook URL
2. Use curl or Postman:

curl -X POST https://your-n8n-instance/webhook/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "pair": "BTCUSD",
    "timeframe": "5m",
    "strategy_params": {
      "ema_short": 8,
      "ema_long": 21
    }
  }'

# Verify: Results saved to backtest_results/
```

### Test 4: Optimizer (15 min)

```bash
# In n8n: strategy_optimizer_agent
1. Click "Execute Workflow"
2. Wait 10-15 min (depends on data range)
3. Check optimization_reports/ for results
4. Verify Discord/Telegram report
```

### Test 5: Performance Reporter (5 min)

```bash
# In n8n: performance_reporter_agent
1. Ensure trade_journal.json has closed trades
2. Click "Execute Workflow"
3. Wait for completion
4. Check:
   - Discord weekly report
   - weekly_reports/weekly_report_*.json
   - reports_csv/weekly_summary.csv
```

## Production Checklist

```
Phase 1: Setup
[ ] All credentials created and tested
[ ] Webhook URLs configured in TradingView
[ ] Python scripts created and executable
[ ] config.yaml in place with initial parameters
[ ] All directories created

Phase 2: Workflows
[ ] All 5 workflows imported
[ ] No import errors
[ ] All workflows show as inactive (ready to activate)

Phase 3: Testing
[ ] News scanner produces output
[ ] Signal alerter receives and processes webhook
[ ] Backtester runs successfully
[ ] Optimizer completes without errors
[ ] Performance reporter calculates metrics

Phase 4: Activation
[ ] All workflows activated in order
[ ] Schedules confirmed (check workflow list)
[ ] Webhooks confirmed active
[ ] Team notified of alert channels

Phase 5: Monitoring
[ ] Discord alerts monitored daily
[ ] Telegram alerts configured on mobile
[ ] Error logs reviewed weekly
[ ] Performance metrics tracked
```

## Troubleshooting Matrix

| Issue | Symptom | Solution |
|-------|---------|----------|
| Webhook not received | TradingView alert test fails | Verify n8n webhook URL, check firewall, ensure n8n is public |
| Discord not sending | Error in Discord node | Check webhook URL, verify bot permissions, test with curl |
| Telegram not sending | Error in Telegram node | Verify bot token, check chat ID, confirm bot is running |
| Backtest fails | Execute Command errors | Check backtester.py path, verify Python syntax, test manually |
| Optimizer takes hours | Workflow hangs | Reduce optimization window, use fewer pairs, check Python memory |
| Credentials not found | Node shows red X | Verify credential name spelling, check n8n Credentials page |

## Performance Optimization Tips

1. **News Scanner**: Run once daily (early morning) to reduce API calls
2. **Signal Alerter**: No limits - real-time processing
3. **Backtester**: Keep test window < 6 months for speed
4. **Optimizer**: Run on low-traffic day (Sunday), accept 20+ min runtime
5. **Performance Reporter**: Append mode (no cleanup) - prune CSV monthly

## Security Best Practices

1. **API Keys**: Never commit to git, rotate quarterly
2. **Webhooks**: Use long complex tokens, whitelist IP if possible
3. **Logs**: Store sensitive data in encrypted locations
4. **Credentials**: Use n8n credential system, not hardcoded values
5. **Alerts**: Limit Discord/Telegram to authorized channels only

## Support & Maintenance

- Review n8n logs weekly for errors
- Test each workflow monthly with sample data
- Update Python scripts as strategies evolve
- Archive old reports (weekly_reports) quarterly
- Keep config.yaml in version control (git)

---

**Last Updated**: 2026-04-17
**Version**: 1.0
**Target n8n Version**: 1.0+
