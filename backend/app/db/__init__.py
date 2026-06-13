"""Database layer: async SQLAlchemy engine, session, and ORM models.

The schema is multi-tenant from day one — every user-owned row carries a
``user_id`` — even though v1 launches with a single user.
"""
