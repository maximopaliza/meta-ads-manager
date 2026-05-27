"""
video_analyzer.py
Descarga un video de Google Drive, lo analiza con Gemini (video + audio completo)
y guarda el resultado en Supabase (tabla video_analysis).

Si el video ya fue analizado, devuelve el resultado cacheado sin volver a llamar a Gemini.
"""
import os
import io
import json
import time
import tempfile
import logging
from pathlib import Path

import google.generativeai as genai

from .prompts import CAMPAIGN_BUILDER_SYSTEM
from .product_data import get_product_context

logger = logging.getLogger(__name__)


def _supabase():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_cached_analysis(drive_file_id: str) -> dict | None:
    """Devuelve el análisis guardado en Supabase, o None si no existe."""
    try:
        sb = _supabase()
        res = sb.table("video_analysis").select("*").eq("drive_file_id", drive_file_id).execute()
        if res.data:
            row = res.data[0]
            return row.get("full_response") or {
                "angle":            row.get("angle", ""),
                "analysis":         row.get("analysis", ""),
                "primary_text":     row.get("primary_text", ""),
                "headline":         row.get("headline", ""),
                "audience_summary": row.get("audience_summary", ""),
                "targeting":        row.get("targeting", {}),
                "objective":        "ventas",
                "cta":              "SHOP_NOW",
            }
    except Exception as e:
        logger.warning(f"Cache check error: {e}")
    return None


def save_analysis(drive_file_id: str, file_name: str, result: dict) -> None:
    """Guarda el análisis en Supabase."""
    try:
        sb = _supabase()
        sb.table("video_analysis").upsert({
            "drive_file_id":    drive_file_id,
            "file_name":        file_name,
            "angle":            result.get("angle", ""),
            "analysis":         result.get("analysis", ""),
            "primary_text":     result.get("primary_text", ""),
            "headline":         result.get("headline", ""),
            "audience_summary": result.get("audience_summary", ""),
            "targeting":        result.get("targeting", {}),
            "full_response":    result,
        }, on_conflict="drive_file_id").execute()
        logger.info(f"Analysis saved for {drive_file_id}")
    except Exception as e:
        logger.error(f"Error saving analysis: {e}")


def _download_from_drive(file_id: str) -> tuple[bytes, str]:
    """Descarga un archivo de Drive y devuelve (bytes, mime_type)."""
    from meta.drive_client import _get_service
    from googleapiclient.http import MediaIoBaseDownload

    service = _get_service()

    # Obtener metadata para el mime_type
    meta = service.files().get(fileId=file_id, fields="mimeType, name").execute()
    mime = meta.get("mimeType", "video/mp4")

    # Descargar
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request, chunksize=10 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    return buf.getvalue(), mime


def _upload_to_gemini(video_bytes: bytes, mime_type: str, display_name: str):
    """Sube el video a la Gemini File API y espera a que esté listo."""
    # Escribir a archivo temporal
    suffix = ".mp4" if "mp4" in mime_type else ".mov"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        video_file = genai.upload_file(
            path=tmp_path,
            mime_type=mime_type,
            display_name=display_name,
        )

        # Esperar a que Gemini procese el video
        max_wait = 120  # segundos
        waited = 0
        while video_file.state.name == "PROCESSING" and waited < max_wait:
            time.sleep(5)
            waited += 5
            video_file = genai.get_file(video_file.name)

        if video_file.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file not ready: {video_file.state.name}")

        return video_file
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def analyze_video(drive_file_id: str, file_name: str, destination_url: str = "", force: bool = False) -> dict:
    """
    Analiza un video de Drive con Gemini (video + audio completo).
    - Si ya está analizado en Supabase, devuelve el cache (a menos que force=True).
    - Descarga de Drive, sube a Gemini File API, analiza, guarda en Supabase.
    Devuelve el dict de análisis completo.
    """
    defaults = {
        "angle":            "fatiga_pantallas",
        "analysis":         "Video de Vision Complete.",
        "objective":        "ventas",
        "primary_text":     "Tus ojos trabajan todo el dia. Es hora de cuidarlos. 3 cuotas sin interes + envio gratis.",
        "headline":         "Vision Complete — Ovitta",
        "cta":              "SHOP_NOW",
        "audience_summary": "Personas con fatiga visual, 35-65 anos, Argentina",
        "targeting":        {"geo_locations": {"countries": ["AR"]}, "age_min": 35, "age_max": 65},
    }

    # Chequear cache
    if not force:
        cached = get_cached_analysis(drive_file_id)
        if cached:
            logger.info(f"Cache hit for {drive_file_id}")
            return {**defaults, **cached}

    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])

        # 1. Descargar de Drive (timeout 90s)
        logger.info(f"Downloading {file_name} from Drive...")
        import signal
        def _timeout_handler(signum, frame):
            raise TimeoutError("Download timed out")
        try:
            signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(90)
        except (AttributeError, OSError):
            pass  # Windows no tiene SIGALRM
        video_bytes, mime_type = _download_from_drive(drive_file_id)
        try:
            signal.alarm(0)
        except (AttributeError, OSError):
            pass
        logger.info(f"Downloaded {len(video_bytes) / 1024 / 1024:.1f} MB")

        # 2. Subir a Gemini File API
        logger.info(f"Uploading to Gemini File API...")
        gemini_file = _upload_to_gemini(video_bytes, mime_type, file_name)
        logger.info(f"Gemini file ready: {gemini_file.name}")

        # 3. Analizar
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=CAMPAIGN_BUILDER_SYSTEM,
        )

        product_ctx = get_product_context()
        url_note = f"URL de destino: {destination_url}\n\n" if destination_url else ""

        prompt = (
            f"{product_ctx}\n\n"
            f"{url_note}"
            f"Analizá este video de ad completo — imagen, texto en pantalla Y audio (voz en off, dialogos, musica). "
            f"Detecta el angulo de comunicacion que esta usando y genera el copy alineado a ese angulo "
            f"usando los datos del producto. Devolvé el JSON completo."
        )

        response = model.generate_content(
            [gemini_file, prompt],
            generation_config={"temperature": 0.4, "response_mime_type": "application/json"},
        )

        result = json.loads(response.text)
        result = {**defaults, **result}

        # Limpiar archivo de Gemini
        try:
            genai.delete_file(gemini_file.name)
        except Exception:
            pass

        # 4. Guardar en Supabase
        save_analysis(drive_file_id, file_name, result)
        logger.info(f"Analysis complete for {file_name}: angle={result.get('angle')}")

        return result

    except Exception as e:
        logger.error(f"Video analysis error for {file_name}: {e}")
        return defaults
