import os
import json
import logging
from datetime import date, timedelta
import google.generativeai as genai
from .prompts import ANALYST_SYSTEM, COPY_GENERATOR_SYSTEM, TARGETING_GENERATOR_SYSTEM, NATURAL_LANGUAGE_SYSTEM, DAY_ANALYSIS_SYSTEM, ACTION_INTENT_SYSTEM, AD_ANALYZER_SYSTEM

logger = logging.getLogger(__name__)

_model = None

def _get_model():
    global _model
    if _model is None:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        _model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=ANALYST_SYSTEM,
        )
    return _model


def analyze_campaigns(metrics_summary: str) -> list[dict]:
    try:
        model = _get_model()
        response = model.generate_content(
            f"Analizá estas métricas de los últimos días:\n\n{metrics_summary}",
            generation_config={"temperature": 0.3, "response_mime_type": "application/json"},
        )
        data = json.loads(response.text)
        return data.get("alerts", [])
    except Exception as e:
        logger.error(f"Gemini analyst error: {e}")
        return []


def generate_copy(objective: str, creative_description: str) -> dict:
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=COPY_GENERATOR_SYSTEM,
        )
        prompt = f"Objetivo: {objective}\nCreativo: {creative_description}\nGenerá el copy para este anuncio."
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.7, "response_mime_type": "application/json"},
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Copy generation error: {e}")
        return {"primary_text": "", "headline": "", "description": "", "cta": "SHOP_NOW"}


def generate_targeting(audience_description: str) -> dict:
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=TARGETING_GENERATOR_SYSTEM,
        )
        response = model.generate_content(
            f"Convertí esta descripción de público a targeting spec: {audience_description}",
            generation_config={"temperature": 0.2, "response_mime_type": "application/json"},
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Targeting generation error: {e}")
        return {"geo_locations": {"countries": ["AR"]}, "age_min": 18, "age_max": 65}


def analyze_days(context: str) -> list[dict]:
    """Análisis profundo día por día: qué pasó, qué campaña/adset lo causó."""
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=DAY_ANALYSIS_SYSTEM,
        )
        response = model.generate_content(
            context,
            generation_config={"temperature": 0.2, "response_mime_type": "application/json"},
        )
        data = json.loads(response.text)
        return data.get("alerts", [])
    except Exception as e:
        logger.error(f"Day analysis error: {e}")
        return []


def detect_action_intent(text: str, campaigns: list[dict]) -> dict:
    """Returns {action, campaign_name, budget, delta, delta_type, direction}."""
    _defaults = {"action": "none", "campaign_name": None, "budget": None,
                 "delta": None, "delta_type": None, "direction": None}
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=ACTION_INTENT_SYSTEM,
        )
        camp_list = ", ".join(f'"{c["name"]}"' for c in campaigns)
        prompt = f"Campañas disponibles: {camp_list}\n\nMensaje del usuario: {text}"
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.1, "response_mime_type": "application/json"},
        )
        result = json.loads(response.text)
        return {**_defaults, **result}
    except Exception as e:
        logger.error(f"Intent detection error: {e}", exc_info=True)
        return _defaults


def analyze_ad_full(creative_analysis: str, metrics_summary: str) -> dict:
    """Combina análisis de creativo + métricas y da diagnóstico + recomendación."""
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=AD_ANALYZER_SYSTEM,
        )
        prompt = f"ANÁLISIS DEL CREATIVO:\n{creative_analysis}\n\nMÉTRICAS REALES:\n{metrics_summary}"
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.3, "response_mime_type": "application/json"},
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Ad full analysis error: {e}")
        return {
            "angle": "sin_datos",
            "recommendation": "esperar_datos",
            "recommendation_detail": str(e)[:200],
        }


def answer_natural_language(question: str, context: str) -> str:
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=NATURAL_LANGUAGE_SYSTEM,
        )
        # Truncate context if too large (Gemini has input limits)
        if len(context) > 30000:
            context = context[:30000] + "\n[contexto truncado]"
        prompt = f"Datos actuales:\n{context}\n\nPregunta: {question}"
        response = model.generate_content(prompt, generation_config={"temperature": 0.4})
        return response.text
    except Exception as e:
        logger.error(f"Natural language error: {e}", exc_info=True)
        err = str(e)
        if "429" in err or "quota" in err.lower():
            return ("⚠️ <b>Cuota de Gemini agotada</b>\n\n"
                    "El plan gratuito tiene límite diario. Para preguntas simples usá:\n"
                    "/status · /campanas · /alertas\n\n"
                    "Para habilitar respuestas ilimitadas, actualizá el plan en: ai.dev/rate-limit")
        return f"❌ Error Gemini: {err[:200]}"
