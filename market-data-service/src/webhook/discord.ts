import https from 'https';
import { TradingViewAlert } from './types';
import { SessionInfo } from './session';

const COLOR: Record<string, number> = {
  BUY:     0x00ff88,
  SELL:    0xff4444,
  NEUTRAL: 0xffa500,
};

const ACTION_EMOJI: Record<string, string> = {
  BUY: '🟢', SELL: '🔴', NEUTRAL: '🟡',
};

const SESSION_EMOJI: Record<string, string> = {
  'RTH':         '🔔',
  'PRE-MARKET':  '🌅',
  'POST-MARKET': '🌆',
  'OVERNIGHT':   '🌙',
  'LONDON':      '🇬🇧',
  'NEW_YORK':    '🗽',
  'TOKYO':       '🗼',
  'SYDNEY':      '🦘',
  'CLOSED':      '🔒',
};

export interface DiscordAlert {
  alert:    TradingViewAlert;
  session:  SessionInfo;
  analysis: string;
  // Either bot token+channel or webhook URL
  botToken?:  string;
  channelId?: string;
  webhookUrl?: string;
}

export async function sendDiscordAlert(opts: DiscordAlert): Promise<void> {
  const { alert, session, analysis } = opts;

  const actionEmoji  = ACTION_EMOJI[alert.action]  ?? '📊';
  const sessionEmoji = SESSION_EMOJI[session.name] ?? '📊';
  const sessionLabel = session.overlap ?? session.name;

  const fields = [
    { name: '💵 Price',              value: `\`${alert.price.toFixed(2)}\``,                inline: true },
    { name: `${sessionEmoji} Session`, value: `\`${sessionLabel}\``,                        inline: true },
    { name: '📐 Timeframe',          value: `\`${alert.timeframe}m\``,                      inline: true },
  ];

  if (alert.rsi       !== undefined)
    fields.push({ name: '📊 RSI',       value: `\`${alert.rsi.toFixed(1)}\``,              inline: true });
  if (alert.atr       !== undefined)
    fields.push({ name: '📏 ATR',       value: `\`${alert.atr.toFixed(2)}\``,              inline: true });
  if (alert.vol_ratio !== undefined)
    fields.push({ name: '📦 Vol',       value: `\`${alert.vol_ratio.toFixed(2)}x\``,       inline: true });
  if (alert.fast_ema  !== undefined && alert.slow_ema !== undefined)
    fields.push({ name: '〰️ EMA',      value: `\`${alert.fast_ema.toFixed(2)}\` / \`${alert.slow_ema.toFixed(2)}\``, inline: false });
  if (analysis)
    fields.push({ name: '🤖 AI Analysis', value: analysis.slice(0, 1024),                  inline: false });

  const embed = {
    title:     `${actionEmoji} ${alert.action} · ${alert.symbol} · ${alert.strategy ?? 'Signal'}`,
    color:     COLOR[alert.action] ?? COLOR['NEUTRAL'],
    fields,
    footer:    { text: `OpenClaw · ${alert.tier ?? 'free'} · TradingView` },
    timestamp: new Date().toISOString(),
  };

  const content = alert.tier === 'premium' ? '@here — premium signal' : undefined;
  const body    = { content, embeds: [embed] };

  if (opts.botToken && opts.channelId) {
    await botPost(opts.botToken, opts.channelId, body);
  } else if (opts.webhookUrl) {
    await webhookPost(opts.webhookUrl, body);
  } else {
    throw new Error('Discord: set DISCORD_BOT_TOKEN+DISCORD_CHANNEL_ID or DISCORD_WEBHOOK_URL');
  }
}

// ─── Bot token approach (preferred) ──────────────────────────────────────────

function botPost(token: string, channelId: string, body: unknown): Promise<void> {
  return discordPost(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    body,
    `Bot ${token}`,
  );
}

// ─── Incoming webhook approach (fallback) ────────────────────────────────────

function webhookPost(url: string, body: unknown): Promise<void> {
  return discordPost(url, body);
}

// ─── Shared HTTP POST ─────────────────────────────────────────────────────────

function discordPost(url: string, body: unknown, authHeader?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const json    = JSON.stringify(body);
    const u       = new URL(url);
    const headers: Record<string, string | number> = {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(json),
    };
    if (authHeader) headers['Authorization'] = authHeader;

    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers,
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Discord API ${res.statusCode}: ${data}`));
        } else {
          resolve();
        }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}
