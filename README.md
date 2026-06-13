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

To enable the AI coach, open **Settings** in the app and paste an Anthropic
(Claude) API key — no file editing required. Everything else (live charts,
practice trading, lessons) works without a key.

### Useful extras

```bash
# Backend engine tests (no third-party deps needed)
cd backend && python tests/test_paper_broker.py     # or: pytest

# Full stack via Docker (Postgres+Timescale+pgvector, Redis, backend)
cp .env.example .env && docker compose up
```

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
