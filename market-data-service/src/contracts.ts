import { ContractSpec } from './types';

// ─── CME quarterly cycle ─────────────────────────────────────────────────────
const CME_QUARTERS = [
  { month: 2,  code: 'H' },  // March
  { month: 5,  code: 'M' },  // June
  { month: 8,  code: 'U' },  // September
  { month: 11, code: 'Z' },  // December
];

/** Third Friday of a given month (0-indexed). */
function thirdFriday(year: number, month: number): Date {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 14);
  return d;
}

/** Get the active quarterly contract code (e.g. 'M26') for a root at a given date. */
function cmeQuarterCode(now: Date, rollDays: number): { code: string; expiry: Date; rollDate: Date } {
  const year = now.getFullYear();

  for (const q of CME_QUARTERS) {
    const expiry = thirdFriday(year, q.month);
    const roll = new Date(expiry);
    roll.setDate(roll.getDate() - rollDays);
    if (now < roll) {
      return { code: `${q.code}${String(year).slice(2)}`, expiry, rollDate: roll };
    }
  }
  // Wrap to next year March
  const nextYear = year + 1;
  const expiry = thirdFriday(nextYear, 2);
  const roll = new Date(expiry);
  roll.setDate(roll.getDate() - rollDays);
  return { code: `H${String(nextYear).slice(2)}`, expiry, rollDate: roll };
}

// ─── Energy futures: monthly, last trading day ~3 business days before 25th ──
function energyActiveMonth(now: Date): { code: string; expiry: Date; rollDate: Date } {
  const MONTH_CODES = 'FGHJKMNQUVXZ';
  let month = now.getMonth();
  let year  = now.getFullYear();

  // Roll ~4 days before the 25th of the prior month
  const rollDay = new Date(year, month, 21);
  if (now >= rollDay) { month++; if (month > 11) { month = 0; year++; } }

  const expiry   = new Date(year, month, 25);
  const rollDate = new Date(year, month, 21);
  const code     = `${MONTH_CODES[month]}${String(year).slice(2)}`;
  return { code, expiry, rollDate };
}

// ─── Metals: bimonthly + even months ─────────────────────────────────────────
function goldActiveMonth(now: Date): { code: string; expiry: Date; rollDate: Date } {
  const ACTIVE = [1, 3, 5, 7, 9, 11]; // Feb Apr Jun Aug Oct Dec (0-indexed)
  const CODES  = 'FGHJKMNQUVXZ';
  let year     = now.getFullYear();
  let month    = now.getMonth();

  for (let i = 0; i < 12; i++) {
    if (ACTIVE.includes(month)) {
      const rollDate = new Date(year, month, 20);
      if (now < rollDate) {
        return {
          code:     `${CODES[month]}${String(year).slice(2)}`,
          expiry:   new Date(year, month, 26),
          rollDate,
        };
      }
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return { code: `Z${String(year).slice(2)}`, expiry: new Date(year, 11, 26), rollDate: new Date(year, 11, 20) };
}

// ─── Per-root contract specs ──────────────────────────────────────────────────
interface RootSpec {
  exchange:    string;
  description: string;
  tickSize:    number;
  tickValue:   number;
  pointValue:  number;
  currency:    string;
  rollFn:      'cme-quarterly' | 'energy-monthly' | 'gold-bimonthly';
}

const ROOT_SPECS: Record<string, RootSpec> = {
  ES:  { exchange:'CME',   description:'E-mini S&P 500',       tickSize:0.25, tickValue:12.50, pointValue:50,   currency:'USD', rollFn:'cme-quarterly' },
  NQ:  { exchange:'CME',   description:'E-mini Nasdaq-100',     tickSize:0.25, tickValue:5.00,  pointValue:20,   currency:'USD', rollFn:'cme-quarterly' },
  YM:  { exchange:'CBOT',  description:'E-mini Dow',            tickSize:1,    tickValue:5.00,  pointValue:5,    currency:'USD', rollFn:'cme-quarterly' },
  RTY: { exchange:'CME',   description:'E-mini Russell 2000',   tickSize:0.1,  tickValue:5.00,  pointValue:50,   currency:'USD', rollFn:'cme-quarterly' },
  MNQ: { exchange:'CME',   description:'Micro Nasdaq-100',      tickSize:0.25, tickValue:0.50,  pointValue:2,    currency:'USD', rollFn:'cme-quarterly' },
  MES: { exchange:'CME',   description:'Micro E-mini S&P 500',  tickSize:0.25, tickValue:1.25,  pointValue:5,    currency:'USD', rollFn:'cme-quarterly' },
  CL:  { exchange:'NYMEX', description:'Crude Oil (WTI)',       tickSize:0.01, tickValue:10.00, pointValue:1000, currency:'USD', rollFn:'energy-monthly' },
  NG:  { exchange:'NYMEX', description:'Natural Gas',           tickSize:0.001,tickValue:10.00, pointValue:10000,currency:'USD', rollFn:'energy-monthly' },
  GC:  { exchange:'COMEX', description:'Gold',                  tickSize:0.1,  tickValue:10.00, pointValue:100,  currency:'USD', rollFn:'gold-bimonthly' },
  SI:  { exchange:'COMEX', description:'Silver',                tickSize:0.005,tickValue:25.00, pointValue:5000, currency:'USD', rollFn:'gold-bimonthly' },
  ZB:  { exchange:'CBOT',  description:'30-Year T-Bond',        tickSize:0.03125,tickValue:31.25,pointValue:1000,currency:'USD', rollFn:'cme-quarterly' },
  ZN:  { exchange:'CBOT',  description:'10-Year T-Note',        tickSize:0.015625,tickValue:15.625,pointValue:1000,currency:'USD',rollFn:'cme-quarterly' },
};

export function resolveContract(root: string, rollDays = 7, now: Date = new Date()): ContractSpec {
  const spec = ROOT_SPECS[root.toUpperCase()];
  if (!spec) {
    return {
      root, active: root, exchange: 'N/A', expiry: '', rollDate: '',
      description: root, tickSize: 1, tickValue: 1, pointValue: 1, currency: 'USD',
    };
  }

  let code: string;
  let expiry: Date;
  let rollDate: Date;

  if (spec.rollFn === 'cme-quarterly') {
    ({ code, expiry, rollDate } = cmeQuarterCode(now, rollDays));
  } else if (spec.rollFn === 'energy-monthly') {
    ({ code, expiry, rollDate } = energyActiveMonth(now));
  } else {
    ({ code, expiry, rollDate } = goldActiveMonth(now));
  }

  return {
    root:        root.toUpperCase(),
    active:      `${root.toUpperCase()}${code}`,
    exchange:    spec.exchange,
    expiry:      expiry.toISOString().slice(0, 10),
    rollDate:    rollDate.toISOString().slice(0, 10),
    description: spec.description,
    tickSize:    spec.tickSize,
    tickValue:   spec.tickValue,
    pointValue:  spec.pointValue,
    currency:    spec.currency,
  };
}

export function allContracts(rollDays = 7): Record<string, ContractSpec> {
  const now = new Date();
  return Object.fromEntries(
    Object.keys(ROOT_SPECS).map(r => [r, resolveContract(r, rollDays, now)])
  );
}
