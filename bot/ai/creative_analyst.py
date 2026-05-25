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
    Analiza el creativo + URL y devuelve un plan completo para lanzar la campaña.
    Si creative_path está vacío o no existe, analiza solo por la URL de destino.
    Retorna un dict con: analysis, objective, primary_text, headline, cta,
                         audience_summary, targeting
    """
    defaults = {
        "analysis": "Anuncio listo para lanzar.",
        "objective": "ventas",
        "primary_text": "¡Mirá lo que tenemos para vos! Calidad garantizada.",
        "headline": "Comprá ahora",
        "cta": "SHOP_NOW",
        "audience_summary": "Público general Argentina",
        "targeting": {"geo_locations": {"countries": ["AR"]}, "age_min": 18, "age_max": 65},
    }
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=CAMPAIGN_BUILDER_SYSTEM,
        )

        path = Path(creative_path) if creative_path else None
        has_file = path and path.exists()

        if has_file:
            with open(creative_path, "rb") as f:
                creative_data = f.read()
            parts = [
                {"inline_data": {"mime_type": _get_mime(path), "data": creative_data}},
                f"URL de destino: {destination_url}\n\nAnalizá el creativo y la landing. Devolvé el plan de campaña en JSON.",
            ]
        else:
            # Sin archivo local: analizar solo por URL
            parts = [
                f"URL de destino: {destination_url}\n\n"
                f"No tengo el archivo del creativo (es un video de la biblioteca de Meta). "
                f"Analizá la landing page y generá el copy y targeting más adecuado. "
                f"Devolvé el plan de campaña en JSON.",
            ]

        response = model.generate_content(
            parts,
            generation_config={"temperature": 0.4, "response_mime_type": "application/json"},
        )
        result = json.loads(response.text)
        # Merge con defaults para evitar KeyError si Gemini omite algún campo
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
