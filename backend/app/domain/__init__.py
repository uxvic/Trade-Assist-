"""Core trading domain: pure-Python types with no framework dependencies.

These types are the shared vocabulary used by the broker engine, the agent
tools, and the API layer. They deliberately depend only on the standard
library (``dataclasses``, ``decimal``, ``enum``) so the trading core stays
trivially testable and reusable.
"""
