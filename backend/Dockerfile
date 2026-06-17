# Backend image — FastAPI + agent + paper engine.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY pyproject.toml ./
# NOTE: timesfm[torch] pulls PyTorch (large) and downloads ~800 MB of weights at
# runtime on first forecast — the heaviest part of the image. Forecasts are
# on-demand and degrade gracefully, so this stays optional to the core loop.
RUN pip install --upgrade pip && pip install \
    "fastapi>=0.110" "uvicorn[standard]>=0.29" "pydantic>=2.6" "pydantic-settings>=2.2" \
    "sqlalchemy>=2.0" "asyncpg>=0.29" "alembic>=1.13" "redis>=5.0" "httpx>=0.27" \
    "websockets>=12.0" "anthropic>=0.40" "litellm>=1.40" "arq>=0.26" "structlog>=24.1" \
    "yfinance>=0.2.40" "timesfm[torch]>=1.3"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
