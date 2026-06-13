"""FastAPI application entrypoint.

Run locally with:  ``uvicorn app.main:app --reload``
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agent, health, market, paper
from app.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(market.router)
app.include_router(paper.router)
app.include_router(agent.router)


@app.get("/", tags=["health"])
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "disclaimer": "Educational use only. Not financial advice. Paper trading only.",
    }
