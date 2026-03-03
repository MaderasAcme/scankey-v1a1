
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any

# Lead Engineer - Schema Contracts

class CropBBox(BaseModel):
    x: float
    y: float
    w: float
    h: float

class KeyResult(BaseModel):
    rank: int
    id_model_ref: Optional[str] = None
    type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    orientation: Optional[str] = None
    head_color: Optional[str] = None
    visual_state: Optional[str] = None
    patentada: bool = False
    compatibility_tags: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    explain_text: str
    crop_bbox: Optional[CropBBox] = None

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
