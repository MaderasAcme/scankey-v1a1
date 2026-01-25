from fastapi import APIRouter, UploadFile, File
from .modules.similarity import SimilarityStore

router = APIRouter(prefix="/api/similarity", tags=["similarity"])
store = SimilarityStore()

@router.post("/ingest")
async def ingest(front: UploadFile = File(...), label: str | None = None):
    b = await front.read()
    item = store.ingest(b, label=label, meta={"filename": front.filename, "content_type": front.content_type})
    return {"ok": True, "item": {"id": item.id, "hash": item.h, "label": item.label, "ts": item.ts}}

@router.post("/query")
async def query(front: UploadFile = File(...), top_k: int = 5):
    b = await front.read()
    res = store.query(b, top_k=top_k)
    return {"ok": True, "top_k": top_k, "results": res}
