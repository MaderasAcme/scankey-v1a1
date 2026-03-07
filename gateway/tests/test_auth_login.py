"""
Tests mínimos para POST /api/auth/login.
Cubre: 200 OK, 401 INVALID_CREDENTIALS, 503 LOGIN_NOT_CONFIGURED.
"""
import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _setup_env_login_configured():
    os.environ["API_KEYS"] = "test-key"
    os.environ["MOTOR_URL"] = "http://motor:8080"
    os.environ["SCN_LOCAL_DEV"] = "1"
    os.environ["WORKSHOP_LOGIN_EMAIL"] = "scankey@scankey.com"
    os.environ["WORKSHOP_LOGIN_PASSWORD"] = "1357"
    os.environ["WORKSHOP_TOKEN"] = "test-workshop-token-xyz"


def _setup_env_login_not_configured():
    os.environ["API_KEYS"] = "test-key"
    os.environ["MOTOR_URL"] = "http://motor:8080"
    os.environ["SCN_LOCAL_DEV"] = "1"
    os.environ.pop("WORKSHOP_LOGIN_EMAIL", None)
    os.environ.pop("WORKSHOP_LOGIN_PASSWORD", None)
    os.environ.pop("WORKSHOP_TOKEN", None)


def test_auth_login_503_not_configured():
    """Login sin configurar -> 503 LOGIN_NOT_CONFIGURED."""
    _setup_env_login_not_configured()
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ.pop("AUDIT_ENABLED", None)

    from main import APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    r = client.post(
        "/api/auth/login",
        json={"email": "scankey@scankey.com", "password": "1357"},
    )
    assert r.status_code == 503
    data = r.json()
    assert data.get("ok") is False
    assert data.get("error") == "LOGIN_NOT_CONFIGURED"


def test_auth_login_401_invalid_credentials():
    """Login con credenciales incorrectas -> 401 INVALID_CREDENTIALS."""
    _setup_env_login_configured()
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ.pop("AUDIT_ENABLED", None)

    import main as main_mod
    importlib.reload(main_mod)
    APP = main_mod.APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)

    r = client.post(
        "/api/auth/login",
        json={"email": "wrong@scankey.com", "password": "1357"},
    )
    assert r.status_code == 401
    data = r.json()
    assert data.get("ok") is False
    assert data.get("error") == "INVALID_CREDENTIALS"

    r2 = client.post(
        "/api/auth/login",
        json={"email": "scankey@scankey.com", "password": "wrong"},
    )
    assert r2.status_code == 401
    assert r2.json().get("error") == "INVALID_CREDENTIALS"


def test_auth_login_200_ok():
    """Login correcto -> 200 con role, workshop_token, operator_label, expires_in_days."""
    _setup_env_login_configured()
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ.pop("AUDIT_ENABLED", None)

    import main as main_mod
    importlib.reload(main_mod)
    APP = main_mod.APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    r = client.post(
        "/api/auth/login",
        json={"email": "scankey@scankey.com", "password": "1357"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert data.get("role") == "taller"
    assert data.get("workshop_token") == "test-workshop-token-xyz"
    assert data.get("operator_label") == "OPERADOR SENIOR"
    assert data.get("expires_in_days") == 7
    assert "password" not in str(data).lower()
