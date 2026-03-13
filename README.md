# Ideations — Market-Driven Digit Gaming Platform

A proof-of-concept web application that reimagines gambling as a market-driven experience. Every game outcome is derived from the last digit of live financial tick data streamed in real-time from the Deriv API.

## Games

- **Digit Collect** — Crash/chicken-out game. Collect unique digits (0–9) from live ticks. Cash out before a duplicate knocks you out.
- **Digit Poker** — Video poker with digits. 5-digit hands dealt from live ticks. Hold/draw mechanics with a pay table.
- **Digit Slots** — 3-reel slot machine. Each reel stopped by a live tick. Includes gamble (double-or-nothing) feature.
- **Volatility Plinko** — Plinko board driven by GBM-generated volatility quotes. Choose Low/Medium/High risk.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4** + shadcn/ui (base-ui)
- **Zustand** for state management (balance, settings)
- **Framer Motion** for animations
- **Deriv WebSocket API** for real-time tick data
- **Canvas API** for Plinko board rendering

## Getting Started

```bash
# Install dependencies
cd web
npm install

# Set up environment (uses demo app_id by default)
cp .env.local.example .env.local
# Or the .env.local is already created with NEXT_PUBLIC_DERIV_APP_ID=1089

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (lobby)/            # Home page with game grid
│   ├── game/[slug]/        # Dynamic game routes
│   └── provably-fair/      # Math documentation page
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── games/              # Per-game components
│   └── layout/             # Sidebar, TopBar, AppShell
├── lib/
│   ├── deriv/              # WebSocket client + React context
│   ├── games/              # Pure-function game engines
│   └── math/               # Probability calculators
├── stores/                 # Zustand stores
├── hooks/                  # Custom hooks (useTickStream, etc.)
└── types/                  # TypeScript interfaces
```

## Key Design Decisions

- **Client-side game logic** — All game resolution happens in the browser. No backend game server.
- **Single WebSocket** — Shared connection to Deriv API via React context provider.
- **Demo balance** — 10,000 virtual credits stored in localStorage. Resettable.
- **Provably fair** — All math is documented and verifiable on the /provably-fair page.

## Demo Disclaimer

This is a proof-of-concept application. **No real money is wagered.** The platform uses virtual demo credits only. Not intended for production gambling use.
