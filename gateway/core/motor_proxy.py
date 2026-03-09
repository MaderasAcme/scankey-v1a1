"""Motor proxy — _motor_post, _motor_get."""
from typing import Optional
import httpx
from fastapi import Request, HTTPException

from .config import MOTOR_URL, TIMEOUT
from .security import get_auth_headers


async def motor_post(
    path: str,
    files=None,
    data=None,
    request_id: Optional[str] = None,
    req: Optional[Request] = None,
) -> httpx.Response:
    if not MOTOR_URL:
        raise HTTPException(500, "MOTOR_URL no configurado")
    headers = dict(get_auth_headers())
    if request_id:
        headers["X-Request-ID"] = request_id
    if req is not None:
        workshop_token = (req.headers.get("X-Workshop-Token") or "").strip()
        if workshop_token:
            headers["X-Workshop-Token"] = workshop_token
    last_exc = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT)) as client:
                return await client.post(f"{MOTOR_URL}{path}", headers=headers, files=files, data=data)
        except httpx.TimeoutException as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor timeout: {type(last_exc).__name__}")
        except Exception as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor error: {type(last_exc).__name__}")


async def motor_get(path: str, request_id: Optional[str] = None) -> httpx.Response:
    if not MOTOR_URL:
        raise HTTPException(500, "MOTOR_URL no configurado")
    headers = dict(get_auth_headers())
    if request_id:
        headers["X-Request-ID"] = request_id
    last_exc = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT)) as client:
                return await client.get(f"{MOTOR_URL}{path}", headers=headers)
        except httpx.TimeoutException as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor timeout: {type(last_exc).__name__}")
        except Exception as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor error: {type(last_exc).__name__}")
