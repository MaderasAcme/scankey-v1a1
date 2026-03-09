"""Request meta — request_id, client_ip, schema helpers."""
import uuid
from fastapi import Request


def get_request_id(req: Request) -> str:
    rid = (req.headers.get("x-request-id") or "").strip()
    return rid or uuid.uuid4().hex


def client_ip(req: Request) -> str:
    forwarded = (req.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (req.client.host if req.client else None) or "127.0.0.1"
