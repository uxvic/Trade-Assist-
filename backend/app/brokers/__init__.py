"""Broker abstraction layer.

``BrokerInterface`` is the seam that lets a real broker (e.g. Alpaca) drop in
later without touching the agent, UI, or data model. ``PaperBroker`` is the
only implementation in v1 — it simulates fills against real live prices with
zero connection to real money.
"""
