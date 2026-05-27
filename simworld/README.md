# SimWorld

A Sims-style isometric business simulation featuring NPC agents, two mock businesses, and real-time profit/P&L tracking.

## Quick Start

```bash
cd simworld
npm install
npm run dev
```

Open http://localhost:5174

## What It Is

SimWorld is a small living world where 6 NPC agents commute daily between home and work, perform business tasks, take breaks, return home, and sleep — all in an isometric 3D view.

### Businesses

| Business | Agents | Rooms |
|---|---|---|
| Creative Studio | Reya, Dani, Quinn, Uly | Research, Design, QC, Upload |
| Trading Office | Trae, Remi | Market, Strategy, Risk, Review |

All data is **mock only** — no real APIs, no live trading.

### Daily Agent Loop

```
07:00  Wake up at home
07:30  Commute to work
08:00  Arrive, enter rooms, work tasks
       (talks, takes breaks when stressed)
17:00  Leave work
17:45  Arrive home
22:00  Sleep
```

## Controls

| Control | Action |
|---|---|
| Drag canvas | Pan camera |
| Click agent | Inspect agent details |
| ▶ / ⏸ | Play / Pause |
| 1× 2× 4× 8× | Time speed |
| 💾 Save | Save to localStorage |
| 📂 Load | Restore save |
| ↺ Reset | New game |

## Side Panel Tabs

- **👥 Agents** — click any agent to see state, mood, energy, task, speech
- **📊 Profit** — Creative Studio + Trading Office financials
- **📈 Trading** — Trader desk with mock P/L, trades, market mood

## Architecture

```
src/
├── types/index.ts          Core interfaces (Agent, Building, SimState…)
├── engine/
│   ├── TimeSystem.ts       Sim clock, speed, day/night cycle
│   ├── AgentSystem.ts      State machine, schedule, mood
│   ├── MovementSystem.ts   Grid pathfinding, pixel interpolation
│   ├── BusinessSystem.ts   Mock event queues for both businesses
│   ├── EventBus.ts         Pub/sub for cross-system events
│   └── SaveLoadSystem.ts   localStorage save/load
├── data/
│   ├── worldData.ts        Map layout, buildings, rooms, agent defs
│   └── businessData.ts     Mock event scripts, speech lines
├── renderer/
│   └── IsoRenderer.ts      Canvas 2D isometric renderer
├── components/
│   ├── WorldCanvas.tsx     RAF game loop + pan/click
│   ├── AgentInspector.tsx  Agent list + detail panel
│   ├── ProfitPanel.tsx     Business dashboard
│   ├── TradingPanel.tsx    Trading desk panel
│   └── EventLog.tsx        Timestamped event feed
├── store.ts                Zustand state store
└── App.tsx                 Layout, toolbar, tab routing
```

## Tech Stack

- React 18 + TypeScript
- Zustand (state management)
- Vite (build)
- HTML5 Canvas (rendering)

## Phase 2 — Requires Approval Before Adding

- Real Etsy API integration
- Real broker API / live trading
- AI-generated product creation
- Hiring system / NPC relationships
- City expansion / more businesses
- Multiplayer
- Complex economy simulation
