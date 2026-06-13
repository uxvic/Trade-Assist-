# Trade-Assist Frontend

Next.js (App Router) + TypeScript web UI. Phase-0 scaffold — a landing/dashboard
that checks the backend and shows the paper account. Phase 1 adds the live
chart, order ticket, and streaming coach chat.

## Develop

```bash
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL if backend isn't on :8000
npm run dev                        # http://localhost:3000
```

The backend must be running (`uvicorn app.main:app --reload` in `../backend`).

## Planned stack

- **TradingView Lightweight Charts** for candlesticks
- **TanStack Query** for server state, **Zustand** for local UI state
- A single **WebSocket** multiplexing live quotes, agent tokens, fills, and alerts
