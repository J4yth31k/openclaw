# TradingView Pine Script to n8n Webhook Setup Guide

## Overview
This guide explains how to set up the EMA/RSI Scalper strategy in TradingView and connect it to your n8n workflow via webhook alerts.

## Prerequisites
- Active TradingView account (free or premium)
- n8n instance running and accessible
- n8n Webhook node configured to receive POST requests
- Basic understanding of TradingView alerts

---

## Step 1: Import Pine Script into TradingView

### 1a. Access the Pine Script Editor
1. Open TradingView and navigate to any forex chart (e.g., EURUSD, GBPUSD)
2. Click on the chart settings (three dots) → "Pine Script" → "New Script"
3. Alternatively, go to **Pine Script Editor** from the top menu

### 1b. Create New Strategy
1. In the Pine Script Editor, click **New** → **Strategy**
2. Name it: `EMA_RSI_Scalper_Webhook`
3. Clear the default template code

### 1c. Copy & Paste the Template
1. Copy all code from `webhook_alert_template.pine`
2. Paste into the Pine Script Editor
3. Click **Save**

### 1d. Compile & Test
1. Click the blue **"Add to Chart"** button (bottom-right)
2. The strategy should appear on your chart with:
   - Blue line = EMA Fast (9-period)
   - Orange line = EMA Slow (21-period)
   - Strategy plots on chart when signals trigger

---

## Step 2: Configure Strategy Input Parameters

### Customize for Your Preferences
In the strategy settings, adjust these parameters:

**EMA Settings:**
- `EMA Fast Period`: 9 (default, adjustable)
- `EMA Slow Period`: 21 (default, adjustable)

**RSI Settings:**
- `RSI Period`: 14 (default, standard)
- `RSI Buy Zone Min`: 45 (oversold recovery)
- `RSI Buy Zone Max`: 70 (overbought, momentum)
- `RSI Sell Zone Min`: 30 (oversold, reversal)
- `RSI Sell Zone Max`: 55 (sell confirmation)

**Risk Management:**
- `Take Profit (pips)`: 8 (adjust based on volatility)
- `Stop Loss (pips)`: 6 (adjust based on instrument)
- `Trade Size`: 1.0 (position size multiplier)

**Recommendation:** Start with 5m or 15m timeframes for scalping.

---

## Step 3: Set Up n8n Webhook Receiver

### 3a. Create n8n Webhook Node
1. Open your n8n workflow editor
2. Add a **Webhook** node (input node)
3. Set method to **POST**
4. Copy the webhook URL
   - Format: `https://[n8n-instance-url]/webhook/[path-name]`
   - Example: `https://my-n8n.com/webhook/forex-scalper-alerts`
5. Save the webhook node

### 3b. Parse Incoming JSON
1. Add a **Code** node after the Webhook node
2. Parse the incoming JSON:
   ```javascript
   // The alert message from TradingView arrives as JSON
   // Extract fields for further processing
   
   const payload = JSON.parse(this.getNodeParameter('body'));
   return {
     ticker: payload.ticker,
     action: payload.action,
     price: payload.price,
     tp: payload.tp,
     sl: payload.sl,
     strategy: payload.strategy,
     timeframe: payload.timeframe,
     timestamp: payload.timestamp
   };
   ```

### 3c. Connect to Your Trading Engine
From the Code node, connect to:
- **Discord/Slack notification** (alert your team)
- **Database** (log all signals)
- **Trading API** (auto-execute trades)
- **Spreadsheet** (track performance)

Example n8n flow:
```
Webhook (TradingView) 
  → Code (Parse JSON)
    → IF action=="BUY" → Send Buy Order API
    → IF action=="SELL" → Send Sell Order API
    → Log to Database
    → Notify Discord
```

---

## Step 4: Create TradingView Alert

### 4a. Open Alert Creation
1. On your TradingView chart with the strategy applied:
2. Click the **Alert** button (bell icon in toolbar)
3. Or use keyboard shortcut: **Alt+A**

### 4b. Configure Alert Settings
1. **Condition**: Select your strategy name from dropdown (e.g., "EMA/RSI Scalper - Webhook Alert")
2. **Condition Type**: Choose "Any alert() function call"
   - This will trigger for all buy/sell signals
3. **Alert Name**: 
   - Name it descriptively: "Forex Scalper - EURUSD 5m"
   - Include pair and timeframe for clarity

### 4c. Set Webhook URL
1. Under **Notification Settings**, select **Webhook URL**
2. Enter your n8n webhook URL:
   ```
   https://[your-n8n-instance]/webhook/[endpoint-name]
   ```
3. **Important**: Do NOT include `POST` in the URL, just the full webhook address

### 4d. Additional Notifications (Optional)
- **Email**: Check to email alerts in addition to webhook
- **Sound**: Alert sound on your device
- **Pop-up**: Show desktop notification
- **Notification Center**: TradingView notification panel

### 4e. Expiration
- **Expires In**: Set to "Never" for continuous monitoring
- Or set specific expiration if testing

### 4f. Create the Alert
1. Click **"Create"** button
2. Confirmation message will appear

---

## Step 5: Test the Webhook Connection

### 5a. Manual Test from n8n
1. In your n8n Webhook node, click **"Test"**
2. Copy the webhook URL from the node
3. Open Postman or use curl to send test data:

```bash
curl -X POST https://[your-n8n-instance]/webhook/[endpoint] \
  -H "Content-Type: application/json" \
  -d '{
    "ticker":"EURUSD",
    "action":"BUY",
    "price":1.0950,
    "strategy":"EMA_RSI_Scalper",
    "timeframe":"5m",
    "tp":0.0008,
    "sl":0.0006,
    "timestamp":"2026-04-17T14:30:00Z"
  }'
```

### 5b. Verify n8n Receives Data
1. Check n8n Execution history
2. Verify JSON is parsed correctly
3. Confirm all fields are extracted

### 5c. Test in TradingView
1. Wait for strategy signal to trigger on chart
2. Alert should automatically send webhook to n8n
3. Check n8n execution logs for incoming request
4. Verify Discord/Slack/DB gets notified

---

## Step 6: Apply to Multiple Pairs & Timeframes

### Recommended Configuration
For scalping strategy, apply to these pairs/timeframes:

**Major Pairs:**
- EURUSD, GBPUSD, USDJPY → 5m, 15m timeframes
- AUDUSD, NZDUSD, USDCAD → 5m, 15m timeframes

**Minor Pairs:**
- EURJPY, GBPJPY, AUDJPY → 5m, 15m timeframes

**Best Practice:**
1. Create separate alerts for each pair/timeframe combination
2. Name alerts clearly: "EMA_RSI_EURUSD_5m", "EMA_RSI_GBPUSD_15m"
3. All route to the same n8n webhook URL
4. n8n differentiates by ticker field in JSON

### How to Apply
1. Switch to each chart
2. Add strategy to chart
3. Create new alert (repeat Step 4)
4. Use same webhook URL
5. All alerts feed same n8n workflow

---

## Step 7: Monitor & Optimize

### Track Performance
1. **n8n Dashboard**: Monitor webhook execution frequency
2. **Database Log**: Track all signals sent
3. **Discord Channel**: Review real-time alerts
4. **TradingView**: Monitor win rate and trade history

### Optimize Parameters
- If too many false signals: Increase RSI zones tightness
- If missing signals: Loosen EMA periods
- If TP too tight: Increase pip value
- If SL too wide: Decrease pip value

### Common Issues
| Issue | Solution |
|-------|----------|
| No alerts triggering | Check strategy is applied to chart, verify alert exists |
| Webhook not receiving | Verify URL is correct, test with curl, check n8n logs |
| JSON parsing errors | Ensure webhook is receiving valid JSON, check Code node |
| Duplicate signals | Reduce number of chart timeframes or pair combinations |

---

## Alert JSON Schema

The webhook sends this JSON structure:

```json
{
  "ticker": "EURUSD",
  "action": "BUY",
  "price": 1.0950,
  "strategy": "EMA_RSI_Scalper",
  "timeframe": "5m",
  "tp": 0.0008,
  "sl": 0.0006,
  "timestamp": "2026-04-17T14:30:00.000Z"
}
```

**Field Definitions:**
- `ticker`: Currency pair symbol
- `action`: "BUY" or "SELL" signal
- `price`: Entry price when signal triggered
- `strategy`: Always "EMA_RSI_Scalper" for identification
- `timeframe`: Chart period (5m, 15m, 1h, etc.)
- `tp`: Take profit level in price units
- `sl`: Stop loss level in price units
- `timestamp`: ISO8601 timestamp of signal

---

## Troubleshooting

### Alert Won't Create
- Ensure strategy compiles without errors
- Check TradingView account has alert permissions
- Refresh page and try again

### Webhook URL Rejected
- Verify URL is publicly accessible
- Check n8n instance is running
- Ensure webhook endpoint is active

### Missing Signals
- Check RSI and EMA settings match your chart
- Verify scalping volatility threshold
- Consider pair/timeframe characteristics

### Duplicate or Extra Signals
- Check "alert.freq_once_per_bar_close" is set correctly
- Verify only one alert exists per pair/timeframe
- Review strategy logic for multiple entry conditions

---

## Advanced: Customizing the Strategy

### Modify Entry Conditions
Edit lines in `webhook_alert_template.pine`:
```pinescript
// BUY Signal: EMA fast > EMA slow AND RSI in buy zone
buy_signal = ta.crossover(ema_fast, ema_slow) and rsi >= rsi_buy_min and rsi <= rsi_buy_max
```

### Add Additional Filters
Example: Add volume confirmation:
```pinescript
volume_filter = volume > ta.sma(volume, 20)
buy_signal = ta.crossover(ema_fast, ema_slow) and rsi >= rsi_buy_min and volume_filter
```

### Change Alert Message Format
Modify `alert_message_buy` string to include additional fields or change JSON structure.

---

## Support & Resources

- **TradingView Documentation**: https://www.tradingview.com/pine-script-docs/
- **n8n Webhook Node**: https://docs.n8n.io/nodes/n8n-nodes-base.webhook/
- **Forex Scalping Best Practices**: Research pair volatility and optimal pip targets

---

## Quick Reference Checklist

- [ ] Pine Script copied and saved in TradingView
- [ ] Strategy added to chart and compiling
- [ ] Parameters adjusted for your trading style
- [ ] n8n webhook URL created and tested
- [ ] TradingView alert created with webhook URL
- [ ] Webhook JSON received in n8n
- [ ] Connected to downstream nodes (notification, API, DB)
- [ ] Tested signal trigger with live chart
- [ ] Applied to desired pairs and timeframes
- [ ] Monitoring dashboard set up

---

**Last Updated**: 2026-04-17  
**Strategy Version**: EMA/RSI Scalper v1.0  
**Pine Script Version**: v5
