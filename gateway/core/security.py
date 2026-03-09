"""Security — API key, auth helpers."""
import hmac
import time
from fastapi import Request, HTTPException

import google.auth.transport.requests
from google.oauth2 import id_token

from .config import (
    MOTOR_URL,
    SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED,
    MOTOR_AUTH_HEADER,
    WORKSHOP_LOGIN_EMAIL,
    WORKSHOP_LOGIN_PASSWORD,
    WORKSHOP_TOKEN,
    parse_api_keys,
    API_KEYS_RAW,
)

_API_KEYS = parse_api_keys(API_KEYS_RAW)
_cached_id_token = None
_cached_id_token_expiry = 0
_TOKEN_REFRESH_MARGIN_SECONDS = 60


def require_apikey(req: Request):
    if not _API_KEYS:
        raise HTTPException(status_code=500, detail="API_KEYS no configurado en gateway")
    k = (req.headers.get("x-api-key") or "").strip()
    if not k or k not in _API_KEYS:
        raise HTTPException(status_code=401, detail="API key inválida")
    return True


def fetch_id_token_cached(audience: str) -> str:
    global _cached_id_token, _cached_id_token_expiry
    now = time.time()
    if _cached_id_token and _cached_id_token_expiry > now + _TOKEN_REFRESH_MARGIN_SECONDS:
        return _cached_id_token
    request_object = google.auth.transport.requests.Request()
    new_token = id_token.fetch_id_token(request_object, audience)
    try:
        claims = id_token.verify_oauth2_token(new_token, request_object, audience=audience)
        _cached_id_token_expiry = claims.get("exp", 0)
    except Exception as e:
        print(f"Warning: Could not extract expiry from ID token: {e}. Assuming 1 hour validity.")
        _cached_id_token_expiry = now + 3600
    _cached_id_token = new_token
    return _cached_id_token


def get_auth_headers() -> dict:
    headers = {}
    if SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED:
        if not MOTOR_URL:
            raise HTTPException(500, "MOTOR_URL no configurado para ID Token Proxy")
        token = fetch_id_token_cached(MOTOR_URL)
        headers[MOTOR_AUTH_HEADER] = f"Bearer {token}"
    return headers


def validate_login(email: str, password: str) -> bool:
    if not WORKSHOP_LOGIN_EMAIL or not WORKSHOP_LOGIN_PASSWORD or not WORKSHOP_TOKEN:
        return False
    expected_email = WORKSHOP_LOGIN_EMAIL.strip().lower()
    try:
        email_ok = hmac.compare_digest(email, expected_email)
        password_ok = hmac.compare_digest(password, WORKSHOP_LOGIN_PASSWORD)
        return bool(email_ok and password_ok)
    except (TypeError, ValueError):
        return False


def get_workshop_token() -> str:
    return WORKSHOP_TOKEN
