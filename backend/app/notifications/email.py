"""Send a plain-text email via Resend (one API key, beginner-friendly).

Off until the user configures a key in Settings. Best-effort: any failure
returns False and is swallowed by the caller — email never breaks the bot.
"""

from __future__ import annotations

# Resend's shared sender works out of the box for emails to the account owner;
# the user can later set their own verified-domain sender.
_DEFAULT_SENDER = "Trade-Assist <onboarding@resend.dev>"


async def send_email(cfg: dict, subject: str, body: str) -> bool:
    if cfg.get("provider", "resend") != "resend":
        return False
    api_key = cfg.get("api_key")
    recipient = cfg.get("recipient")
    if not api_key or not recipient:
        return False
    sender = cfg.get("sender") or _DEFAULT_SENDER
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": sender, "to": [recipient], "subject": subject, "text": body},
            )
        return res.status_code < 300
    except Exception:  # noqa: BLE001 - email is best-effort
        return False
