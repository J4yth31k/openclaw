import { Router, Request, Response } from 'express';
import fs   from 'fs';
import path from 'path';

import { TradingViewAlert } from './types';
import { getSessionForSymbol } from './session';
import { sendDiscordAlert } from './discord';
import { getAgentAnalysis } from './agentBridge';
import { webhookFeedProvider } from '../providers/WebhookFeedProvider';

const DISCORD_BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN   ?? '';
const DISCORD_CHANNEL_ID  = process.env.DISCORD_CHANNEL_ID  ?? '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? '';
const ALERT_LOG_PATH      = process.env.ALERT_LOG_PATH
  ?? path.resolve(__dirname, '..', '..', '..', '..', 'trade_journal.json');

// Optional: shared secret so only TradingView can POST to this endpoint
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';

export function buildWebhookRouter(): Router {
  const router = Router();

  /** POST /webhook/tradingview */
  router.post('/tradingview', async (req: Request, res: Response) => {
    // Shared-secret guard (set WEBHOOK_SECRET in .env and in TradingView alert URL)
    if (WEBHOOK_SECRET && req.query['secret'] !== WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const alert = req.body as Partial<TradingViewAlert>;

    if (!alert.symbol || !alert.action || alert.price === undefined) {
      res.status(400).json({ error: 'Required: symbol, action, price' });
      return;
    }

    // Respond immediately — TradingView requires < 3s
    res.status(200).json({ ok: true, symbol: alert.symbol, action: alert.action });

    // Process asynchronously
    processAlert(alert as TradingViewAlert).catch(e =>
      console.error('[webhook] Processing error:', e)
    );
  });

  /** GET /webhook/health — sanity check */
  router.get('/health', (_req, res) => {
    res.json({
      ok:              true,
      discord:         !!(DISCORD_WEBHOOK_URL || (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID)),
      discordMode:     DISCORD_BOT_TOKEN ? 'bot' : DISCORD_WEBHOOK_URL ? 'webhook' : 'none',
      alertLog:        ALERT_LOG_PATH,
      secretProtected: !!WEBHOOK_SECRET,
    });
  });

  return router;
}

// ─── Alert pipeline ───────────────────────────────────────────────────────────

async function processAlert(alert: TradingViewAlert): Promise<void> {
  const session = getSessionForSymbol(alert.symbol);

  // Feed price into the WebhookFeedProvider so the dashboard updates in real-time
  if (alert.price) {
    const sym = alert.symbol.replace('1!', '').replace('USDT', '').toUpperCase();
    webhookFeedProvider.ingestPrice(
      sym,
      alert.price,
      alert.bid    ?? alert.price,
      alert.ask    ?? alert.price,
      alert.volume ?? 0,
    );
  }

  console.log(
    `[webhook] ${alert.action} ${alert.symbol} @ ${alert.price}` +
    ` | ${session.name}${session.overlap ? ` (${session.overlap})` : ''}`
  );

  // Skip closed market — configurable via ALERT_ON_CLOSED=true
  if (session.name === 'CLOSED' && process.env.ALERT_ON_CLOSED !== 'true') {
    console.log(`[webhook] Skipping — market closed for ${alert.symbol}`);
    logAlert(alert, session.name, 'SKIPPED_CLOSED');
    return;
  }

  const analysis = await getAgentAnalysis(alert, session);

  const hasBot     = !!(DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID);
  const hasWebhook = !!DISCORD_WEBHOOK_URL;

  if (hasBot || hasWebhook) {
    try {
      await sendDiscordAlert({
        alert,
        session,
        analysis,
        botToken:   hasBot     ? DISCORD_BOT_TOKEN  : undefined,
        channelId:  hasBot     ? DISCORD_CHANNEL_ID : undefined,
        webhookUrl: !hasBot && hasWebhook ? DISCORD_WEBHOOK_URL : undefined,
      });
      console.log(`[webhook] Discord alert sent for ${alert.symbol}`);
    } catch (e) {
      console.error('[webhook] Discord send failed:', (e as Error).message);
    }
  } else {
    console.warn('[webhook] No Discord config — set DISCORD_BOT_TOKEN+DISCORD_CHANNEL_ID in .env');
  }

  logAlert(alert, session.name, 'SENT', analysis);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

function logAlert(
  alert:    TradingViewAlert,
  session:  string,
  status:   string,
  analysis?: string,
): void {
  try {
    let journal: unknown[] = [];
    if (fs.existsSync(ALERT_LOG_PATH)) {
      const raw = fs.readFileSync(ALERT_LOG_PATH, 'utf-8').trim();
      if (raw) journal = JSON.parse(raw) as unknown[];
    }
    journal.push({
      ...alert,
      session,
      status,
      analysis: analysis ?? null,
      logged_at: new Date().toISOString(),
    });
    fs.writeFileSync(ALERT_LOG_PATH, JSON.stringify(journal, null, 2));
  } catch (e) {
    console.error('[webhook] Log write error:', (e as Error).message);
  }
}
