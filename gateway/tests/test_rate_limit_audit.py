"""
BLOQUE 6: Tests rate limit y auditoría mínima.
"""
import json
import os
import sys
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# JPEG mínimo válido
VALID_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n"
    b"\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d"
    b"\x1a\x1c\x1c\x20$\x2e\' \x22,\x1c\x1c(7),\x2e\x33\x32\x36;D@8:?=>;"
    b"\x36\x38\x3a\x36\xff\xd9"
)


def _front_file():
    """Fichero front para multipart: usa PNG fixture si existe, si no JPEG."""
    fixture = Path(__file__).resolve().parent.parent.parent / "ui-studio" / "scripts" / "fixtures" / "test.png"
    if fixture.exists():
        data = fixture.read_bytes()
        return ("front.png", BytesIO(data), "image/png")
    return ("front.jpg", BytesIO(VALID_JPEG), "image/jpeg")


def _setup_rate_limit(limit: int = 2):
    os.environ["RATE_LIMIT_ENABLED"] = "true"
    os.environ["RATE_LIMIT_WINDOW_SECONDS"] = "60"
    os.environ["RATE_LIMIT_MAX_ANALYZE"] = str(limit)
    os.environ["RATE_LIMIT_MAX_FEEDBACK"] = str(limit)
    os.environ["RATE_LIMIT_MAX_LOGIN"] = str(limit)


def _setup_env():
    os.environ["API_KEYS"] = "test-key-12345"
    os.environ["MOTOR_URL"] = "http://motor:8080"
    # No configurar login para que devuelva 503 (rápido)
    os.environ.pop("WORKSHOP_LOGIN_EMAIL", None)
    os.environ.pop("WORKSHOP_LOGIN_PASSWORD", None)
    os.environ.pop("WORKSHOP_TOKEN", None)


def test_analyze_rate_limit_429():
    """Superar límite en /api/analyze-key -> 429."""
    _setup_env()
    _setup_rate_limit(limit=2)
    from rate_limit import reset_stores

    reset_stores()

    import main as main_mod

    main_mod._API_KEYS = {"test-key-12345"}
    from main import APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    headers = {"x-api-key": "test-key-12345"}
    class MockResp:
        status_code = 200
        headers = {"content-type": "application/json"}
        content = b'{"ok":true,"results":[]}'

        def json(self):
            return {"ok": True, "results": []}

    mock_resp = MockResp()

    with patch("main._motor_post", new_callable=AsyncMock, return_value=mock_resp):
        r1 = client.post("/api/analyze-key", headers=headers, files={"front": _front_file()})
        r2 = client.post("/api/analyze-key", headers=headers, files={"front": _front_file()})
        r3 = client.post("/api/analyze-key", headers=headers, files={"front": _front_file()})

    assert r1.status_code in (200, 422)
    assert r2.status_code in (200, 422)
    assert r3.status_code == 429
    data = r3.json()
    assert data.get("error") == "RATE_LIMITED"
    assert "Demasiadas solicitudes" in (data.get("message") or "")
    assert "X-RateLimit-Remaining" in r3.headers
    assert r3.headers.get("X-RateLimit-Remaining") == "0"


def test_feedback_rate_limit_429():
    """Superar límite en /api/feedback -> 429."""
    _setup_env()
    _setup_rate_limit(limit=2)
    from rate_limit import reset_stores

    reset_stores()

    import main as main_mod

    main_mod._API_KEYS = {"test-key-12345"}
    from main import APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    headers = {"x-api-key": "test-key-12345"}
    body = {"input_id": "x", "selected_id": "y"}

    r1 = client.post("/api/feedback", headers=headers, json=body)
    r2 = client.post("/api/feedback", headers=headers, json=body)
    r3 = client.post("/api/feedback", headers=headers, json=body)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
    data = r3.json()
    assert data.get("error") == "RATE_LIMITED"


def test_login_rate_limit_429():
    """Superar límite en /api/auth/login -> 429."""
    _setup_env()
    _setup_rate_limit(limit=2)
    from rate_limit import reset_stores

    reset_stores()

    from main import APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    body = {"email": "a@b.com", "password": "x"}

    r1 = client.post("/api/auth/login", json=body)
    r2 = client.post("/api/auth/login", json=body)
    r3 = client.post("/api/auth/login", json=body)

    assert r1.status_code == 503  # not configured
    assert r2.status_code == 503
    assert r3.status_code == 429


def test_audit_record_analyze():
    """Audit record creado en analyze."""
    _setup_env()
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ["AUDIT_ENABLED"] = "true"
    import tempfile

    from audit import _reset_for_tests

    _reset_for_tests()
    audit_dir = tempfile.mkdtemp(prefix="audit_test_")
    os.environ["AUDIT_LOCAL_DIR"] = audit_dir

    import main as main_mod

    main_mod._API_KEYS = {"test-key-12345"}
    from main import APP
    from fastapi.testclient import TestClient

    class MockResp:
        status_code = 200
        headers = {"content-type": "application/json"}
        content = b'{"ok":true,"results":[{"model":"X","confidence":0.9}]}'

        def json(self):
            return {"ok": True, "results": [{"model": "X", "confidence": 0.9}]}

    mock_resp = MockResp()

    with patch("main._motor_post", new_callable=AsyncMock, return_value=mock_resp):
        client = TestClient(APP)
        r = client.post(
            "/api/analyze-key",
            headers={"x-api-key": "test-key-12345"},
            files={"front": _front_file()},
        )
    assert r.status_code == 200

    files = list(Path(audit_dir).glob("*.jsonl"))
    assert len(files) >= 1
    with open(files[0], encoding="utf-8") as f:
        lines = [json.loads(ln) for ln in f if ln.strip()]
    recs = [x for x in lines if x.get("action") == "analyze"]
    assert len(recs) >= 1
    rec = recs[-1]
    assert rec.get("endpoint") == "/api/analyze-key"
    assert rec.get("status_code") == 200
    assert "password" not in json.dumps(rec).lower()
    assert "base64" not in json.dumps(rec).lower()


def test_audit_record_feedback():
    """Audit record creado en feedback."""
    _setup_env()
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ["AUDIT_ENABLED"] = "true"
    import tempfile

    from audit import _reset_for_tests

    _reset_for_tests()
    audit_dir = tempfile.mkdtemp(prefix="audit_test_")
    os.environ["AUDIT_LOCAL_DIR"] = audit_dir

    import main as main_mod

    main_mod._API_KEYS = {"test-key-12345"}
    from main import APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    client.post("/api/feedback", headers={"x-api-key": "test-key-12345"}, json={"input_id": "i1", "selected_id": "s1"})

    files = list(Path(audit_dir).glob("*.jsonl"))
    assert len(files) >= 1
    with open(files[0], encoding="utf-8") as f:
        lines = [json.loads(ln) for ln in f if ln.strip()]
    recs = [x for x in lines if x.get("action") == "feedback"]
    assert len(recs) >= 1
    rec = recs[-1]
    assert rec.get("endpoint") == "/api/feedback"
    assert rec.get("status_code") == 200


def test_login_audit_sin_password():
    """Login audit: nunca guardar password."""
    _setup_env()
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    os.environ["AUDIT_ENABLED"] = "true"
    import tempfile

    from audit import _reset_for_tests

    _reset_for_tests()
    audit_dir = tempfile.mkdtemp(prefix="audit_test_")
    os.environ["AUDIT_LOCAL_DIR"] = audit_dir

    import main as main_mod

    main_mod._API_KEYS = {"test-key-12345"}
    from main import APP
    from fastapi.testclient import TestClient

    client = TestClient(APP)
    client.post("/api/auth/login", json={"email": "u@x.com", "password": "secret123"})

    files = list(Path(audit_dir).glob("*.jsonl"))
    assert len(files) >= 1
    with open(files[0], encoding="utf-8") as f:
        content = f.read()
    assert "secret123" not in content
    assert "password" not in content or '"password"' not in content
    lines = [json.loads(ln) for ln in content.strip().split("\n") if ln]
    recs = [x for x in lines if x.get("action") == "login"]
    assert len(recs) >= 1
    rec = recs[-1]
    assert rec.get("result") in ("invalid_credentials", "not_configured", "success")
