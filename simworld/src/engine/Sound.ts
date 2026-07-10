// ── Ambient sound engine ──────────────────────────────────────────────────────
// Everything is synthesized with WebAudio — no audio assets, tiny footprint.
// Wind bed, day birdsong, night crickets, rain wash, and small UI blips.

const STORAGE_KEY = 'simworld_sound_on'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let windGain: GainNode | null = null
let rainGain: GainNode | null = null
let enabled = false

export function soundEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function makeNoiseSource(context: AudioContext): AudioBufferSourceNode {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = context.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

/** Must be called from a user gesture (browser autoplay policy) */
export function setSoundEnabled(on: boolean) {
  enabled = on
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0') } catch { /* ignore */ }

  if (on && !ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)

    // Wind: looped noise through a gentle low-pass
    const wind = makeNoiseSource(ctx)
    const windLp = ctx.createBiquadFilter()
    windLp.type = 'lowpass'
    windLp.frequency.value = 320
    windGain = ctx.createGain()
    windGain.gain.value = 0.03
    wind.connect(windLp).connect(windGain).connect(master)
    wind.start()

    // Rain: brighter noise band, silent until it rains
    const rain = makeNoiseSource(ctx)
    const rainHp = ctx.createBiquadFilter()
    rainHp.type = 'highpass'
    rainHp.frequency.value = 900
    rainGain = ctx.createGain()
    rainGain.gain.value = 0
    rain.connect(rainHp).connect(rainGain).connect(master)
    rain.start()
  }

  if (ctx && master) {
    void ctx.resume()
    master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.3)
  }
}

/** Short freq-swept blip: bird chirp by day */
function chirp() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(2600 + Math.random() * 1200, t)
  osc.frequency.exponentialRampToValueAtTime(1800 + Math.random() * 800, t + 0.09)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.045, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.14)
}

/** Pulsed high tone: cricket at night */
function cricket() {
  if (!ctx || !master) return
  const t0 = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.07
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 4200 + Math.random() * 300
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.02, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + 0.06)
  }
}

/** UI blip for selections / commands */
export function playClick() {
  if (!enabled || !ctx || !master) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(760, t)
  osc.frequency.exponentialRampToValueAtTime(520, t + 0.05)
  g.gain.setValueAtTime(0.05, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.08)
}

/** Cheery two-note flourish for wish fulfilment etc. */
export function playSparkle() {
  if (!enabled || !ctx || !master) return
  const t = ctx.currentTime
  ;[880, 1320].forEach((f, i) => {
    const osc = ctx!.createOscillator()
    const g = ctx!.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    const s = t + i * 0.09
    g.gain.setValueAtTime(0, s)
    g.gain.linearRampToValueAtTime(0.05, s + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16)
    osc.connect(g).connect(master!)
    osc.start(s)
    osc.stop(s + 0.2)
  })
}

/** Called ~twice a second from the render loop with current conditions */
export function ambientTick(nightAmt: number, rainAmt: number) {
  if (!enabled || !ctx || !rainGain || !windGain) return
  rainGain.gain.setTargetAtTime(rainAmt * 0.12, ctx.currentTime, 0.8)
  windGain.gain.setTargetAtTime(0.02 + rainAmt * 0.015, ctx.currentTime, 1.0)

  if (rainAmt < 0.4) {
    if (nightAmt < 0.4 && Math.random() < 0.10) chirp()
    if (nightAmt > 0.6 && Math.random() < 0.14) cricket()
  }
}
