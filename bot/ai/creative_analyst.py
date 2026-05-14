import os
import logging
from pathlib import Path
import google.generativeai as genai
from .prompts import CREATIVE_ANALYST_SYSTEM

logger = logging.getLogger(__name__)


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

        mime_type = "image/jpeg"
        suffix = path.suffix.lower()
        if suffix in (".png",):
            mime_type = "image/png"
        elif suffix in (".gif",):
            mime_type = "image/gif"
        elif suffix in (".webp",):
            mime_type = "image/webp"
        elif suffix in (".mp4", ".mov"):
            mime_type = "video/mp4"

        parts = [
            {"inline_data": {"mime_type": mime_type, "data": image_data}},
            f"Analizá este creativo para Meta Ads.{' Datos de rendimiento: ' + metrics_context if metrics_context else ''}",
        ]

        response = model.generate_content(parts, generation_config={"temperature": 0.3})
        return response.text

    except Exception as e:
        logger.error(f"Creative analysis error: {e}")
        return f"No pude analizar el creativo: {e}"


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
            mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
            parts.append({"inline_data": {"mime_type": mime, "data": data}})

        parts.append("Comparame estos dos creativos. ¿Cuál tiene más potencial y por qué? Sé específico con los números si los tenés.")

        response = model.generate_content(parts, generation_config={"temperature": 0.4})
        return response.text

    except Exception as e:
        logger.error(f"Creative comparison error: {e}")
        return f"No pude comparar los creativos: {e}"
