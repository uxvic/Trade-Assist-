# Trade-Assist Backend

FastAPI backend: the agent brain, the paper-trading engine, market-data
providers, and the data model.

## Layout

```
app/
  domain/      Pure-Python trading types (orders, fills, positions) — no framework deps
  risk/        Deterministic risk gate (the hard guardrails)
  brokers/     BrokerInterface + PaperBroker (the paper-now/real-later seam)
  data/        Market-data provider abstraction + crypto (Binance) provider
  agent/       Coach prompts, the shared ToolRegistry, and the model-agnostic AgentService
  db/          Async SQLAlchemy engine + multi-tenant ORM models
  api/         FastAPI routes (health, market, paper, agent) + schemas
  config.py    Settings (env-driven)
  runtime.py   Process singletons for the v1 single-user demo
tests/         Engine tests (run standalone or via pytest)
```

## Develop

```bash
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
uvicorn app.main:app --reload
```

## Test / lint

```bash
pytest                 # full suite
python tests/test_paper_broker.py   # engine only, zero deps
ruff check .
```

## Notes

- The trading core (`domain`, `risk`, `brokers`) depends only on the standard
  library, so it stays trivially testable. Heavier deps (FastAPI, SQLAlchemy,
  provider SDKs) are imported only in the layers that need them.
- `app.main:app` boots without a database (the demo paper account is in-memory).
  The DB/ORM is wired for when persistence and multi-user land.
