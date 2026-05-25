import os
import json
import logging
from pathlib import Path
import google.generativeai as genai
from .prompts import CREATIVE_ANALYST_SYSTEM, CAMPAIGN_BUILDER_SYSTEM

logger = logging.getLogger(__name__)


def _get_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".webp":
        return "image/webp"
    if suffix in (".mp4", ".mov"):
        return "video/mp4"
    return "image/jpeg"


def analyze_creative(image_path: str, metrics_context: str = "") -> str:
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=CREATIVE_ANALYST_SYSTEM,
        )

        path = Path(image_path)
        if not path.exists():
            return "No se pudo acceder al archivo del creativo."

        with open(image_path, "rb") as f:
            image_data = f.read()

        parts = [
            {"inline_data": {"mime_type": _get_mime(path), "data": image_data}},
            f"Analizá este creativo para Meta Ads.{' Datos de rendimiento: ' + metrics_context if metrics_context else ''}",
        ]

        response = model.generate_content(parts, generation_config={"temperature": 0.3})
        return response.text

    except Exception as e:
        logger.error(f"Creative analysis error: {e}")
        return f"No pude analizar el creativo: {e}"


def analyze_for_campaign(creative_path: str, destination_url: str) -> dict:
    """
    Analiza el creativo + datos del producto y devuelve un plan completo de campaña.
    Detecta el ángulo del video y genera copy alineado a ese ángulo.
    Si creative_path está vacío o no existe, analiza solo por los datos del producto.
    """
    from .product_data import get_product_context

    defaults = {
        "angle": "fatiga_pantallas",
        "analysis": "Video de Vision Complete listo para lanzar.",
        "objective": "ventas",
        "primary_text": "Tus ojos trabajan todo el día. Es hora de cuidarlos. 3 cuotas sin interés + envío gratis.",
        "headline": "Vision Complete — Ovitta",
        "cta": "SHOP_NOW",
        "audience_summary": "Personas con fatiga visual, 35-65 años, Argentina",
        "targeting": {"geo_locations": {"countries": ["AR"]}, "age_min": 35, "age_max": 65},
    }

    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=CAMPAIGN_BUILDER_SYSTEM,
        )

        product_ctx = get_product_context()
        path = Path(creative_path) if creative_path else None
        has_file = path and path.exists()

        if has_file:
            with open(creative_path, "rb") as f:
                creative_data = f.read()
            parts = [
                {"inline_data": {"mime_type": _get_mime(path), "data": creative_data}},
                (
                    f"{product_ctx}\n\n"
                    f"URL de destino: {destination_url}\n\n"
                    f"Analizá el video/imagen, detectá el ángulo que está comunicando, "
                    f"y generá el copy alineado a ese ángulo usando los datos del producto. "
                    f"Devolvé el JSON completo."
                ),
            ]
        else:
            # Sin archivo: generar copy basado en datos del producto
            parts = [
                (
                    f"{product_ctx}\n\n"
                    f"URL de destino: {destination_url}\n\n"
                    f"No tengo el archivo del creativo (video de la biblioteca). "
                    f"Elegí el ángulo más fuerte para este producto y generá el copy. "
                    f"Devolvé el JSON completo."
                ),
            ]

        response = model.generate_content(
            parts,
            generation_config={"temperature": 0.4, "response_mime_type": "application/json"},
        )
        result = json.loads(response.text)
        return {**defaults, **result}

    except Exception as e:
        logger.error(f"Campaign analysis error: {e}")
        return defaults


def compare_creatives(image_path_1: str, image_path_2: str) -> str:
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=CREATIVE_ANALYST_SYSTEM,
        )

        parts = []
        for path_str in [image_path_1, image_path_2]:
            path = Path(path_str)
            with open(path, "rb") as f:
                data = f.read()
            parts.append({"inline_data": {"mime_type": _get_mime(path), "data": data}})

        parts.append("Comparame estos dos creativos. ¿Cuál tiene más potencial y por qué? Sé específico con los números si los tenés.")

        response = model.generate_content(parts, generation_config={"temperature": 0.4})
        return response.text

    except Exception as e:
        logger.error(f"Creative comparison error: {e}")
        return f"No pude comparar los creativos: {e}"
