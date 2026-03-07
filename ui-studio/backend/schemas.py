"""
Lead Engineer - Schema Contracts
Multi-label Fase 2: taxonomía oficial en 3 capas (obligatorio/recomendado/experimental).
Compatibilidad: compatibility_tags legacy, tags oficial. Si no hay tags, usar compatibility_tags.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# Valores válidos para brand_visible_zone (recomendado)
BRAND_VISIBLE_ZONE_VALUES = ("head", "blade", "both", "none")
# Valores válidos para wear_level (recomendado)
WEAR_LEVEL_VALUES = ("low", "medium", "high")


class CropBBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class KeyResult(BaseModel):
    """Identidad principal (top1/top2/top3) + atributos multi-label opcionales."""

    # --- Identidad principal (obligatorios) ---
    rank: int
    id_model_ref: Optional[str] = None
    type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    explain_text: str
    crop_bbox: Optional[CropBBox] = None

    # --- Obligatorios multi-label (fase inicial) ---
    orientation: Optional[str] = None
    head_color: Optional[str] = None
    visual_state: Optional[str] = None
    patentada: Optional[bool] = False
    # tags: oficial. compatibility_tags: legacy (normalización fusiona)
    tags: Optional[List[str]] = None
    compatibility_tags: List[str] = Field(default_factory=list)

    # --- Recomendados multi-label ---
    brand_head_text: Optional[str] = None
    brand_blade_text: Optional[str] = None
    brand_visible_zone: Optional[str] = None  # head | blade | both | none
    ocr_brand_guess: Optional[str] = None
    head_shape: Optional[str] = None
    blade_profile: Optional[str] = None
    tip_shape: Optional[str] = None
    side_count: Optional[int] = None
    symmetry: Optional[bool] = None
    wear_level: Optional[str] = None  # low | medium | high
    high_security: Optional[bool] = None
    requires_card: Optional[bool] = None

    # --- Experimentales ---
    oxidation_present: Optional[bool] = None
    surface_damage: Optional[bool] = None
    material_hint: Optional[str] = None
    restricted_copy: Optional[bool] = None
    text_visible_head: Optional[str] = None
    text_visible_blade: Optional[str] = None
    structural_notes: Optional[str] = None

class ManufacturerHint(BaseModel):
    found: bool
    name: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)

class DebugInfo(BaseModel):
    processing_time_ms: int
    model_version: str = "scankey-v2-prod"

class AnalyzeResponse(BaseModel):
    input_id: str
    timestamp: str
    manufacturer_hint: ManufacturerHint
    results: List[KeyResult] = Field(..., min_items=3, max_items=3)
    low_confidence: bool
    high_confidence: bool
    should_store_sample: bool
    current_samples_for_candidate: int = 0
    manual_correction_hint: Dict[str, List[str]] = Field(default_factory=lambda: {"fields": ["marca", "modelo", "tipo"]})
    debug: DebugInfo

class FeedbackRequest(BaseModel):
    input_id: str
    selected_id: Optional[str] = None
    chosen_rank: Optional[int] = None
    correction: bool = False
    manual_data: Optional[Dict[str, str]] = None
    metadata: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
