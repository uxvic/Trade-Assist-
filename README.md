# Trade-Assist — Agentic AI Trading Tutor

> **Educational use only. Not financial advice. Paper trading only.**

An AI tutor that teaches you to trade **by doing**: it watches live markets,
explains what's happening and *why*, and coaches you through real decisions
while you practice on a simulated (paper) account using real prices.

There are two layers:

1. **The agentic brain** — a calm, beginner-first **Coach** agent (with Market
   Analyst, News Analyst, and a deterministic **Risk Manager**), live market
   data, news/sentiment, and a model-agnostic gateway (Claude by default, other
   providers and local models via LiteLLM).
2. **The web UI** — a browser app (Next.js) you can open from any device: live
   charts, an order ticket, your portfolio, and a streaming chat with the coach.

## Status

Early build, but already a real, usable app: a polished **web UI** (onboarding,
home, a live trade desk with charts + plain-language order ticket, an AI coach
chat, and starter lessons) on top of a fully-tested **paper-trading engine**,
the agent layer, and live crypto data. See the phased roadmap below.

## Architecture at a glance

```
Browser (Next.js)  ─HTTPS/WebSocket─►  FastAPI backend
                                         ├─ Agent layer (Coach + tools, Claude/LiteLLM)
                                         ├─ Paper-trading engine (BrokerInterface)
                                         ├─ Market-data providers (crypto live, stocks/fx later)
                                         └─ Curriculum / news / risk
                                       Postgres (+Timescale +pgvector) · Redis · workers
```

Key seams (designed so the future never forces a rewrite):

| Seam | File | Why |
|---|---|---|
| Paper now / real broker later | `backend/app/brokers/base.py` | One interface; `PaperBroker` today, `AlpacaBroker` later |
| Model-agnostic agent | `backend/app/agent/service.py` | Claude default + LiteLLM portable path, same tools |
| One tool registry | `backend/app/agent/tools/registry.py` | Single source of truth for agent capabilities |
| Swappable data feeds | `backend/app/data/providers/base.py` | Free→paid is a config change |
| Multi-tenant data model | `backend/app/db/models.py` | Every row scoped by `user_id` from day one |

## Quickstart

Two commands. You need [`uv`](https://docs.astral.sh/uv/) and Node 18+ installed.

```bash
./scripts/setup.sh     # one time: installs backend + frontend deps
./scripts/dev.sh       # starts everything
```

Then open **http://localhost:3000**. That's the whole app — the frontend proxies
the API, so it's the only URL you need. Press Ctrl-C in that terminal to stop.

### Seeing the latest changes

After new work is pushed to a branch, get it and restart in one command:

```bash
# Ctrl-C to stop the app first, then:
./scripts/refresh.sh <branch-name>   # pulls that branch + restarts the app
```

It fetches the branch, fast-forwards to the newest commit, and boots the app —
then refresh your browser at **http://localhost:3000**. You only need to re-run
`./scripts/setup.sh` again when dependencies change.

To enable the AI coach, open **Settings** in the app and paste an Anthropic
(Claude) API key — no file editing required. Everything else (live charts,
practice trading, lessons) works without a key.

### Starting over (reset everything)

To wipe all local data and come back as a brand-new user:

```bash
# Ctrl-C to stop the app first, then:
./scripts/reset.sh
```

This deletes the local database (`backend/data/trade_assist.db`) — your login,
every practice account, and all bot history — then restarts the app with empty
tables. It **cannot be undone**, and no `./scripts/setup.sh` re-run is needed.
After it restarts, open the app in a **private/incognito window** (or use
**Settings → Sign out**) so the browser forgets your saved login too, and you'll
land on the Sign-up screen like a new user.

### Useful extras

```bash
# Backend engine tests (no third-party deps needed)
cd backend && python tests/test_paper_broker.py     # or: pytest

# Full stack via Docker (Postgres+Timescale+pgvector, Redis, backend)
cp .env.example .env && docker compose up
```

## Forecast lens (experimental)

On the trade desk there's an opt-in **Forecast** card that runs a time-series
foundation model (Google's [TimesFM](https://github.com/google-research/timesfm))
to project the next candles with an uncertainty band. It is **not** a trading
signal and is never wired into the bot or the order ticket. Every projection is
paired with a live **accuracy scorecard** — how often the model called direction
right, and how often it beat a naive "price stays put" guess. The point is
honest and educational: on liquid markets this lands near a coin flip, which is
*why we don't trade on predictions*.

Notes:

- It's heavy. `timesfm[torch]` pulls in PyTorch, and the **first forecast
  downloads ~800 MB of weights** (needs network) and is slow on a laptop CPU.
- Forecasts run **strictly on demand** (a button), never in the always-on loop,
  and the model loads lazily — so it can't bog down the rest of the app. If the
  dependency or weights aren't available, the card degrades to a clean message
  and everything else keeps working.

## Safety model

- **Paper-only is structural**, not a flag — there is no real-money code path in v1.
- **Risk guardrails live in code** (`backend/app/risk/limits.py`), not just prompts:
  no shorting/margin for beginners, per-position size caps, insufficient-funds
  rejection. The coach explains the limits; the engine enforces them.
- The agent is an **educator** — it never issues directive buy/sell advice.

## Roadmap

- **Phase 0** — foundations (scaffolding, infra, deploy).
- **Phase 1 (now)** — crypto learn-by-doing loop: live data, paper engine, coach, starter curriculum.
- **Phase 2** — stocks (Alpaca IEX) + forex (Twelve Data), LiteLLM multi-provider, news/sentiment.
- **Phase 3** — multi-tenant productization (accounts, billing, observability).
- **Phase 4** — opt-in real broker (Alpaca) + paid real-time data (behind legal review).

Full PRD lives with the planning notes for this project.
