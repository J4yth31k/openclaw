# Market Analyst Agents

Two specialized agents for forex/crypto market analysis using free APIs and yfinance data.

## Files

### 1. fundamental_analyst.py
Monitors economic fundamentals affecting currency pairs.

**Key Features:**
- **Economic Calendar**: 80+ events in 2026 with impact ratings (1-5)
  - NFP, CPI, FOMC, ECB, BOJ, BOC, Retail Sales, Unemployment
  - Knows exact dates/times for all major events
- **Interest Rates**: Current rates for FED, ECB, BOJ, BOC, BOE
  - Central bank bias (hawkish/neutral/dovish)
  - Interest rate differentials between pairs
- **Macro Impact Scoring**: Custom impact matrix for 8 major pairs
- **Daily Fundamental Summary**: Events happening today/this week

**Main Methods:**
```python
analyst = FundamentalAnalyst()

# Get today's events
today_events = analyst.get_todays_events()

# Get week's events
week_events = analyst.get_week_events()

# Get interest rate differential for a pair
diff = analyst.get_interest_rate_differentials("EURUSD")

# Full analysis
analysis = analyst.analyze()

# Format for Telegram
report = analyst.format_report(analysis)
print(report)
```

**Output Example:**
```
📊 *FUNDAMENTAL ANALYSIS REPORT*
📅 Date: 2026-04-29

🔔 *TODAY'S ECONOMIC EVENTS*
  🔴🔴🔴🔴 NFP (USD) @ 13:30 UTC

💰 *CURRENT INTEREST RATES*
  📈 FED: 4.25% (neutral)
  ➡️ ECB: 3.75% (neutral)
  📉 BOJ: -0.10% (dovish)

⚡ *HIGH-IMPACT PAIRS THIS WEEK*
  🔴🔴🔴🔴 EURUSD (2 events)
     - FOMC (2026-06-17)
     - ECB (2026-06-04)

💱 *INTEREST RATE DIFFERENTIALS*
  🔼 GBPUSD: +1.00%
  🔼 AUDUSD: +0.50%
```

### 2. sentiment_analyst.py
Analyzes market sentiment, volume, and momentum.

**Key Features:**
- **Fear & Greed Index**: Fetches crypto sentiment from alternative.me API
- **Volume Analysis**: Compares current vol to 20-day MA, flags anomalies (>1.5x)
- **Momentum Scoring**: Rates pairs 1-10 based on:
  - RSI position
  - Price vs 20/50 EMA
  - Recent price change %
  - Volume trend
- **Market Regime Detection**: Risk-On / Risk-Off / Mixed based on:
  - DXY (Dollar Index)
  - VIX (Volatility Index)
  - BTC (Bitcoin trend)
  - Gold (Risk-off indicator)
- **Crypto Technical Levels**: For BTC/ETH/SOL
  - Key psychological levels
  - Price vs 200 EMA

**Main Methods:**
```python
analyst = SentimentAnalyst()

# Get Fear & Greed Index
fng = analyst.get_fear_and_greed_index()

# Analyze volume for a pair
volume = analyst.get_volume_analysis("EURUSD=X")

# Calculate momentum score
momentum = analyst.calculate_momentum_score("EURUSD=X")

# Detect overall market regime
regime = analyst.detect_market_regime()

# Analyze crypto psychological levels
levels = analyst.analyze_crypto_levels("BTC-USD")

# Full analysis (default pairs or custom list)
analysis = analyst.analyze()
analysis = analyst.analyze(pairs=["EURUSD=X", "BTC-USD"])

# Format for Telegram
report = analyst.format_report(analysis)
print(report)
```

**Output Example:**
```
📊 *SENTIMENT ANALYSIS REPORT*
⏰ Time: 2026-04-29 13:26

😨 *Fear & Greed Index*: 😟 42 (Fear)

📈 *Market Regime*: Risk-On (Score: 7.3/10)
  • DXY: 103.45 down
  • VIX: 18.25
  • BTC: 65000 up
  • GOLD: 2350 up

⚡ *TOP MOMENTUM PAIRS*
  🔥 BTC-USD: 8.2/10 (uptrend)
  ⬆️ EURUSD=X: 6.7/10 (uptrend)
  ➡️ GBPUSD=X: 5.1/10 (ranging)

📊 *UNUSUAL VOLUME*
  🔴 BTC-USD: 1.8x average
  🟢 EURUSD=X: 0.92x average

₿ *CRYPTO TECHNICAL LEVELS*
  🔺 BTC-USD: $65000 | Res: $70000 | Sup: $60000
  🔺 ETH-USD: $3500 | Res: $4000 | Sup: $3000
  🔺 SOL-USD: $145 | Res: $150 | Sup: $100
```

## Requirements

```bash
pip install yfinance pandas numpy requests
```

## Usage in Bot

```python
from agents.fundamental_analyst import FundamentalAnalyst
from agents.sentiment_analyst import SentimentAnalyst

# Get fundamental data
fa = FundamentalAnalyst()
fund_analysis = fa.analyze()
fund_report = fa.format_report(fund_analysis)

# Get sentiment data
sa = SentimentAnalyst()
sent_analysis = sa.analyze()
sent_report = sa.format_report(sent_analysis)

# Send to Telegram or store
telegram_message = f"{fund_report}\n\n{sent_report}"
```

## Free API Sources

1. **yfinance**: Free historical price/volume data from Yahoo Finance
2. **alternative.me**: Free Crypto Fear & Greed Index API
3. **Static Economic Calendar**: Hardcoded 2026 event dates (can be updated)

## Notes

- Economic calendar uses static 2026 dates (update ECONOMIC_CALENDAR_2026 manually or integrate investing.com scraper)
- Interest rates hardcoded with April 2026 values (update INTEREST_RATES dict as rates change)
- All analysis is non-blocking - errors are logged and returned in output
- Both classes include `if __name__ == "__main__"` blocks for standalone testing
