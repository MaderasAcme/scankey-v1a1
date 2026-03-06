"""
P0.5: Tests de validación de inputs en gateway.
- Payload size 413
- Content-type 415
- Imagen inválida 400
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from main import _validate_image_payload, MAX_PAYLOAD_BYTES

# JPEG mínimo válido (~100 bytes)
VALID_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n"
    b"\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d"
    b"\x1a\x1c\x1c\x20$\x2e\' \x22,\x1c\x1c(7),\x2e\x33\x32\x36;D@8:?=>;"
    b"\x36\x38\x3a\x36\xff\xd9"
)


def test_validate_payload_too_large_413():
    """Payload > MAX -> 413."""
    import main as m
    old = m.MAX_PAYLOAD_BYTES
    m.MAX_PAYLOAD_BYTES = 10
    try:
        big = VALID_JPEG + b"\x00" * 100
        try:
            _validate_image_payload(big, "image/jpeg", "front")
            assert False, "expected 413"
        except HTTPException as e:
            assert e.status_code == 413
    finally:
        m.MAX_PAYLOAD_BYTES = old


def test_validate_unsupported_content_type_415():
    """Content-type no imagen -> 415."""
    try:
        _validate_image_payload(VALID_JPEG, "application/pdf", "front")
        assert False, "expected 415"
    except HTTPException as e:
        assert e.status_code == 415


def test_validate_invalid_image_400():
    """Bytes que no son imagen -> 400."""
    try:
        _validate_image_payload(b"not an image", "image/jpeg", "front")
        assert False, "expected 400"
    except HTTPException as e:
        assert e.status_code == 400


def test_validate_ok():
    """Imagen válida pasa."""
    fixture_png = Path(__file__).resolve().parent.parent.parent / "ui-studio" / "scripts" / "fixtures" / "test.png"
    if not fixture_png.exists():
        import pytest
        pytest.skip("ui-studio/scripts/fixtures/test.png no existe")
    data = fixture_png.read_bytes()
    _validate_image_payload(data, "image/png", "front")
