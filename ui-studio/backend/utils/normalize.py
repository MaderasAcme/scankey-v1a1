
import random
from datetime import datetime
from typing import Dict, Any

# Lead Engineer - Normalization Logic

def normalize_engine_output(raw: Dict[str, Any], input_id: str, proc_time: int) -> Dict[str, Any]:
    """
    Asegura que la salida del motor cumpla con el contrato estricto de ScanKey.
    """
    results = raw.get("results", [])
    hint = raw.get("manufacturer_hint", {"found": False, "name": None, "confidence": 0.0})
    
    # 1. Aplicar Prioridad de Fabricante (OBJETIVO 1)
    # Si el fabricante detectado es muy seguro (>0.85), movemos resultados de esa marca al top
    if hint.get("found") and hint.get("confidence", 0) >= 0.85:
        target_brand = hint.get("name")
        # Re-sort primario por marca (si coincide con el hint) y secundario por confianza
        results.sort(key=lambda x: (x.get("brand") == target_brand, x.get("confidence", 0)), reverse=True)
    else:
        results.sort(key=lambda x: x.get("confidence", 0), reverse=True)

    # 2. Asegurar exactamente 3 resultados con placeholders
    while len(results) < 3:
        results.append({
            "id_model_ref": None,
            "type": "No identificado",
            "confidence": 0.0,
            "explain_text": "No se encontraron más candidatos con suficiente confianza.",
            "compatibility_tags": []
        })
    
    final_results = results[:3]
    for idx, res in enumerate(final_results):
        res["rank"] = idx + 1
        # Asegurar tipos correctos
        res["confidence"] = float(max(0.0, min(1.0, res.get("confidence", 0.0))))
        res["compatibility_tags"] = list(res.get("compatibility_tags", []))

    top_confidence = final_results[0]["confidence"]

    # 3. Reglas de Negocio: Sample Storage (OBJETIVO 1)
    storage_probability = 0.75
    should_store = top_confidence >= 0.75 and random.random() < storage_probability

    return {
        "input_id": input_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "manufacturer_hint": {
            "found": bool(hint.get("found")),
            "name": hint.get("name"),
            "confidence": float(hint.get("confidence", 0.0))
        },
        "results": final_results,
        "high_confidence": top_confidence >= 0.95,
        "low_confidence": top_confidence < 0.60,
        "should_store_sample": should_store,
        "current_samples_for_candidate": random.randint(5, 12), # Simulado
        "manual_correction_hint": {
            "fields": ["marca", "modelo", "tipo", "orientacion", "ocr_text"]
        },
        "debug": {
            "processing_time_ms": proc_time,
            "model_version": "scankey-v2-prod"
        }
    }
