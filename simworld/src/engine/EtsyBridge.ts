/**
 * EtsyBridge — connects SimWorld task completions to real Railway API calls.
 *
 * When an agent "completes" a launch plan task in the sim, this module
 * fires the corresponding real-world action against the Railway backend.
 *
 * Set VITE_RAILWAY_URL in simworld/.env.local:
 *   VITE_RAILWAY_URL=https://openclaw-production-xxxx.up.railway.app
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BASE: string = (import.meta as any).env?.VITE_RAILWAY_URL ?? ''

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EtsyStatus {
  authenticated: boolean
  api_key_set: boolean
}

export interface EtsyShop {
  shop_id: string
  name: string
  transaction_sold_count: number
  review_count: number
  url: string
}

export interface GeneratedProduct {
  product_key: string
  name: string
  file_path: string
  file_size_kb: number
  listing?: {
    listing_id: number
    title: string
    state: string
    url: string
  }
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Railway API ${path} → ${res.status}: ${txt}`)
  }
  return res.json() as Promise<T>
}

// ── Etsy auth ─────────────────────────────────────────────────────────────────

export async function checkEtsyStatus(): Promise<EtsyStatus> {
  return api<EtsyStatus>('/etsy/status')
}

/** Opens the Etsy OAuth consent page in a new tab. */
export function launchEtsyAuth() {
  window.open(`${BASE}/etsy/auth`, '_blank')
}

// ── Shop stats (real Etsy data) ───────────────────────────────────────────────

export async function fetchShopStats(): Promise<EtsyShop | null> {
  try {
    return await api<EtsyShop>('/etsy/shop')
  } catch {
    return null
  }
}

export async function fetchListings() {
  try {
    const data = await api<{ listings: unknown[] }>('/etsy/listings')
    return data.listings
  } catch {
    return []
  }
}

export async function fetchRecentSales() {
  try {
    const data = await api<{ transactions: unknown[] }>('/etsy/sales?limit=10')
    return data.transactions
  } catch {
    return []
  }
}

// ── Product generation ────────────────────────────────────────────────────────

/**
 * Generate a PDF product on the Railway server.
 * If auto_list=true, also creates an Etsy draft listing and uploads the file.
 */
export async function generateProduct(
  productKey: string,
  autoList = false,
): Promise<GeneratedProduct> {
  return api<GeneratedProduct>('/etsy/generate', {
    method: 'POST',
    body: JSON.stringify({ product_key: productKey, auto_list: autoList }),
  })
}

export async function generateAllProducts(): Promise<GeneratedProduct[]> {
  const data = await api<{ products: GeneratedProduct[] }>('/etsy/generate-all', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return data.products
}

// ── Sim state persistence ─────────────────────────────────────────────────────

export async function saveSimState(state: object): Promise<void> {
  try {
    await api('/sim/save', {
      method: 'POST',
      body: JSON.stringify(state),
    })
  } catch (e) {
    console.warn('[EtsyBridge] saveSimState failed:', e)
  }
}

export async function loadSimState(): Promise<object | null> {
  try {
    const data = await api<{ status: string; state?: object }>('/sim/load')
    return data.status === 'ok' ? data.state ?? null : null
  } catch {
    return null
  }
}

// ── Task → real action map ────────────────────────────────────────────────────

/**
 * Called by BusinessSystem when a launch plan task fires.
 * Maps task IDs to real Railway/Etsy actions.
 */
export async function onTaskComplete(
  taskId: string,
  etsyAuthenticated: boolean,
): Promise<string | null> {
  if (!BASE) return null   // no Railway URL configured — skip silently

  const PDF_TASKS: Record<string, string> = {
    daily_planner:     'daily_planner',
    weekly_tracker:    'weekly_tracker',
    budget_tracker:    'budget_tracker',
    gratitude_journal: 'gratitude_journal',
    goal_workbook:     'goal_workbook',
  }

  if (PDF_TASKS[taskId]) {
    try {
      const result = await generateProduct(PDF_TASKS[taskId], etsyAuthenticated)
      if (result.listing) {
        return `✅ "${result.name}" PDF generated + Etsy draft created → ${result.listing.url}`
      }
      return `✅ "${result.name}" PDF generated (${result.file_size_kb}KB) — connect Etsy to auto-list`
    } catch (e) {
      console.warn(`[EtsyBridge] generate failed for ${taskId}:`, e)
      return null
    }
  }

  return null
}
