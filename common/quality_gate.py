"""
P0.2 QualityGate PASIVO — métricas de calidad de imagen.
- compute_blur_score, compute_exposure, compute_glare, compute_edge_density
- aggregate_quality: quality_score 0..1, reasons[]
- compute_quality_for_side: signals + reasons por lado A/B
- combinar A/B con merged = min(quality_score_A, quality_score_B)
"""
from typing import Dict, Any, List, Optional, Tuple
import os

import numpy as np

# PIL siempre; opencv solo si existe (motor lo tiene)
try:
    import cv2
    _HAS_CV = True
except ImportError:
    _HAS_CV = False

from PIL import Image

SCN_FEATURE_QUALITY_GATE_PASSIVE = (
    os.getenv("SCN_FEATURE_QUALITY_GATE_PASSIVE", "true").lower() == "true"
)


def _to_grayscale_np(img: Image.Image) -> np.ndarray:
    """Convierte PIL a numpy grayscale uint8."""
    arr = np.asarray(img.convert("L"))
    return arr.astype(np.uint8)


def compute_blur_score(img: Image.Image) -> Dict[str, float]:
    """
    Varianza Laplaciana: mayor = más nítido.
    Normaliza a 0..1 (clamp).
    """
    gray = _to_grayscale_np(img)
    if _HAS_CV:
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = float(np.var(lap))
    else:
        # Fallback con PIL filter (aprox)
        from PIL import ImageFilter
        laplacian = img.convert("L").filter(ImageFilter.Kernel((3, 3), [-1,-1,-1,-1,8,-1,-1,-1,-1]))
        lap = np.asarray(laplacian, dtype=np.float64)
        lap_var = float(np.var(lap))
    # Típico: borrosa ~50, nítida ~500+
    score = min(1.0, max(0.0, lap_var / 500.0))
    return {"score": round(score, 4), "lap_var": round(lap_var, 2)}


def compute_exposure(img: Image.Image) -> Dict[str, float]:
    """dark_pct (pixels < 10), bright_pct (pixels > 245)."""
    gray = _to_grayscale_np(img)
    total = gray.size
    if total == 0:
        return {"dark_pct": 0.0, "bright_pct": 0.0}
    dark_pct = float(np.sum(gray < 10) / total)
    bright_pct = float(np.sum(gray > 245) / total)
    return {"dark_pct": round(dark_pct, 4), "bright_pct": round(bright_pct, 4)}


def compute_glare(img: Image.Image) -> Dict[str, float]:
    """glare_pct: reutiliza bright_pct como proxy de zonas quemadas."""
    exp = compute_exposure(img)
    glare_pct = exp.get("bright_pct", 0.0)
    return {"glare_pct": round(glare_pct, 4)}


def compute_edge_density(img: Image.Image) -> Dict[str, float]:
    """Densidad de bordes (gradiente promedio) normalizada 0..1."""
    gray = _to_grayscale_np(img)
    if _HAS_CV:
        gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        mag = np.sqrt(gx * gx + gy * gy)
        edge_mean = float(np.mean(mag))
    else:
        from PIL import ImageFilter
        emboss = img.convert("L").filter(ImageFilter.EMBOSS)
        arr = np.asarray(emboss, dtype=np.float64)
        edge_mean = float(np.mean(np.abs(arr - 128)))
    # Típico: 0-50; normalizar a 0..1
    edge_density = min(1.0, max(0.0, edge_mean / 50.0))
    return {"edge_density": round(edge_density, 4)}


def aggregate_quality(signals: Dict[str, Any]) -> Tuple[float, List[str]]:
    """
    Agrega señales en quality_score 0..1 y reasons[].
    - dark_pct alto -> poca_luz
    - bright_pct alto -> sobreexpuesta
    - blur score bajo -> borrosa
    - glare_pct alto -> deslumbramiento
    """
    reasons: List[str] = []
    dark = signals.get("dark_pct", 0.0) or 0.0
    bright = signals.get("bright_pct", 0.0) or 0.0
    glare = signals.get("glare_pct", 0.0) or bright
    blur_score = signals.get("blur", {}).get("score", 0.5) if isinstance(signals.get("blur"), dict) else 0.5
    edge = signals.get("edge_density", 0.5) or 0.5

    if dark > 0.15:
        reasons.append("poca_luz")
    if bright > 0.15:
        reasons.append("sobreexpuesta")
    if glare > 0.20:
        reasons.append("deslumbramiento")
    if blur_score < 0.30:
        reasons.append("borrosa")
    if edge < 0.15 and blur_score < 0.40:
        reasons.append("poco_detalle")

    # quality_score: promedio ponderado (blur y exposición pesan más)
    exp_penalty = 1.0 - min(1.0, dark * 2 + bright * 2)
    quality = (blur_score * 0.4 + exp_penalty * 0.3 + min(1.0, edge * 1.5) * 0.3)
    quality = max(0.0, min(1.0, quality))
    return round(quality, 4), reasons


def compute_quality_for_side(
    img: Image.Image,
    side_name: str,
) -> Tuple[Dict[str, Any], float, List[str]]:
    """
    Computa señales y reasons para un lado (A o B).
    Returns: (signals_dict, quality_score, reasons)
    """
    blur = compute_blur_score(img)
    exp = compute_exposure(img)
    glare = compute_glare(img)
    edge = compute_edge_density(img)

    signals = {
        "blur": blur,
        "exposure": exp,
        "glare": glare,
        "edge_density": edge.get("edge_density", 0.5),
    }
    # Para aggregate_quality
    agg_input = {
        "dark_pct": exp["dark_pct"],
        "bright_pct": exp["bright_pct"],
        "glare_pct": glare["glare_pct"],
        "blur": blur,
        "edge_density": edge.get("edge_density", 0.5),
    }
    quality_score, reasons = aggregate_quality(agg_input)
    return signals, quality_score, reasons


def compute_quality_ab(
    img_a: Optional[Image.Image],
    img_b: Optional[Image.Image],
) -> Dict[str, Any]:
    """
    Quality signals para A y B, más merged conservador.
    debug.quality_signals = { A: {...}, B: {...}, merged: {...} }
    merged.quality_score = min(A, B) si ambos; si solo A, usa A.
    """
    out: Dict[str, Any] = {"A": None, "B": None, "merged": None}
    score_a, score_b = 0.5, 0.5
    signals_a, signals_b = None, None
    reasons_a, reasons_b = [], []

    if img_a is not None:
        signals_a, score_a, reasons_a = compute_quality_for_side(img_a, "A")
        out["A"] = {
            "signals": signals_a,
            "quality_score": score_a,
            "reasons": reasons_a,
        }

    if img_b is not None:
        signals_b, score_b, reasons_b = compute_quality_for_side(img_b, "B")
        out["B"] = {
            "signals": signals_b,
            "quality_score": score_b,
            "reasons": reasons_b,
        }

    merged_score = min(score_a, score_b) if (img_a and img_b) else score_a
    merged_reasons = list(dict.fromkeys(reasons_a + reasons_b))[:5]

    out["merged"] = {
        "quality_score": round(merged_score, 4),
        "reasons": merged_reasons,
    }

    # JSON-serializable: convertir numpy a float
    def _sanitize(obj):
        if isinstance(obj, dict):
            return {k: _sanitize(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_sanitize(x) for x in obj]
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj)
        return obj

    return _sanitize(out)


def compute_roi_score_from_bbox(
    crop_bbox: Optional[Dict[str, float]],
    img_w: int = 1,
    img_h: int = 1,
) -> float:
    """
    roi_score 0..1: área del crop respecto al frame.
    Si bbox es {0,0,1,1} o inválido -> 0.5 (fallback).
    """
    if not crop_bbox or not isinstance(crop_bbox, dict):
        return 0.5
    try:
        x = float(crop_bbox.get("x", 0) or 0)
        y = float(crop_bbox.get("y", 0) or 0)
        w = float(crop_bbox.get("w", 1) or 1)
        h = float(crop_bbox.get("h", 1) or 1)
    except (TypeError, ValueError):
        return 0.5
    if w <= 0 or h <= 0:
        return 0.5
    # bbox ya en 0..1 típicamente
    area = w * h
    if area >= 0.99:
        return 0.5
    return round(min(1.0, max(0.0, area)), 4)
