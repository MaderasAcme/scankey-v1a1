"""
ScanKey — UI de prueba con Streamlit.
Sube una imagen de llave, ejecuta OCR y muestra coincidencias con el catálogo JMA.
"""
import sys
from pathlib import Path

# Asegurar que el proyecto esté en el path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

ocr_image_bytes = None
catalog_match = None
_import_error = None

try:
    from backend.ocr_engine import ocr_image_bytes
except ImportError as e:
    _import_error = str(e)

try:
    from common import catalog_match
except ImportError:
    pass


st.set_page_config(
    page_title="ScanKey — OCR de llaves",
    page_icon="🔑",
    layout="centered",
)

st.title("🔑 ScanKey")
st.caption("Sube una imagen de una llave para extraer el texto y buscar en el catálogo JMA.")

if _import_error:
    st.error(
        "Faltan dependencias. Instala con: `pip install -r requirements.txt`\n\n"
        f"Detalle: {_import_error}"
    )
    st.stop()

uploaded = st.file_uploader(
    "Imagen de la llave",
    type=["jpg", "jpeg", "png", "webp"],
    help="Sube una foto clara de la llave (frontal o con el grabado visible)",
)

if uploaded:
    raw = uploaded.read()
    col1, col2 = st.columns([1, 1])

    with col1:
        st.image(raw, caption="Imagen subida", use_container_width=True)

    with col2:
        if st.button("Ejecutar OCR", type="primary"):
            with st.spinner("Analizando imagen…"):
                try:
                    out = ocr_image_bytes(raw, lang="eng", profile="key") if ocr_image_bytes else None
                except Exception as e:
                    st.error(f"Error en OCR: {e}")
                    out = None

            if out:
                text = out.get("text", "")
                tokens = out.get("tokens", [])
                conf = out.get("avg_conf", 0)

                st.subheader("Resultado OCR")
                st.code(text or "(sin texto detectado)", language=None)
                st.metric("Confianza media", f"{conf:.1%}")
                if tokens:
                    st.write("**Tokens:**", ", ".join(tokens))

                # Catálogo
                if catalog_match and text:
                    with st.spinner("Buscando en catálogo…"):
                        cat = catalog_match.match_text(text)
                    st.subheader("Catálogo JMA")
                    best = cat.get("best_ref")
                    if best:
                        st.success(f"**Referencia sugerida:** {best}")
                        hits = cat.get("catalog_hits_unique") or []
                        if hits:
                            opts = [h.get("display", "") for h in hits if h.get("display")]
                            if opts:
                                st.write("Otras coincidencias:", ", ".join(opts[:10]))
                    else:
                        st.info("Sin coincidencias en el catálogo para el texto detectado.")
