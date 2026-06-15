# Deploying Trade-Assist (making the bot truly 24/7)

Locally the bot only watches while your laptop runs `./scripts/dev.sh`. To make
it a real always-on product — watching the market and acting around the clock,
even with your machine off — host the backend in the cloud. Everything is
already structured for this; it's a one-time setup.

## Quickest way to let friends test it (no hosting)
```bash
./scripts/share.sh
```
This boots the app and opens a free **Cloudflare quick-tunnel**, printing an
`https://….trycloudflare.com` link you can paste to testers. Each person signs
up for their own practice account. The link is live only while the script runs
and changes each time (needs `cloudflared` installed — see the script header).
Before sharing, set a real `AUTH_SECRET` in `backend/.env`. For a permanent,
always-on URL, deploy instead (below).

## What runs where
- **Backend** (FastAPI + the bot loop + the SQLite durability file) → an
  always-on host. The bot's background loop lives in the web process, so the
  host just needs to stay up (no separate worker for v1).
- **Frontend** (Next.js) → any static/Node host (Vercel, Fly, etc.). It proxies
  `/api/*` to the backend via the `BACKEND_URL` build arg.

## Durability
State (the bot's trades/notes/P&L and your account) lives in a single SQLite
file at `SQLITE_PATH` (default `./data/trade_assist.db`). In the cloud, point it
at a **mounted volume** so it persists across restarts/redeploys. No Postgres is
needed for the single-user setup (the dormant Postgres schema is for future
multi-tenant use).

## Backend on Fly.io (example)
```bash
cd backend
fly launch --no-deploy            # creates the app (a fly.toml is already here)
fly volumes create trade_assist_data --size 1   # the SQLite volume → /data
fly secrets set ANTHROPIC_API_KEY=sk-ant-…      # optional: enables the AI coach
fly secrets set CORS_ORIGINS='["https://YOUR-FRONTEND-URL"]'
fly deploy
```
`fly.toml` already sets `SQLITE_PATH=/data/trade_assist.db`, mounts the volume,
and keeps one machine running (`auto_stop_machines = false`) so the bot never
sleeps.

## Frontend
- **Vercel:** import the repo, root = `frontend/`, set env `BACKEND_URL=https://YOUR-BACKEND-URL`, deploy.
- **Docker:** `docker build -t trade-assist-web --build-arg BACKEND_URL=https://YOUR-BACKEND-URL frontend && docker run -p 3000:3000 trade-assist-web`

Note: `BACKEND_URL` is read when the frontend is **built** (it's baked into the
`/api` rewrite), so set it as a build arg/env, not just at runtime.

## After deploying — closed-tab push (optional upgrade)
With an always-on backend you can upgrade browser notifications to true
**Web Push** (delivered even when the tab/browser is fully closed): add a
service worker + the Web Push API (VAPID keys) and store push subscriptions on
the backend. Until then, in-app alerts cover an open/backgrounded tab and
**email** (Settings → Email alerts) covers fully-away.

## Reminder
Paper trading only. Educational use — not financial advice.
