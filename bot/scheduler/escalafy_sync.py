import logging
from escalafy.scraper import fetch_today
from db.client import get_client

logger = logging.getLogger(__name__)


async def run_escalafy_sync() -> dict | None:
    """Scrapea Escalafy para hoy y guarda en Supabase. Retorna las métricas."""
    try:
        metrics = await fetch_today()

        record = {
            "date": metrics["date_from"],
            "period": "today",
            "revenue": metrics.get("revenue"),
            "ad_spend": metrics.get("ad_spend"),
            "net_revenue": metrics.get("net_revenue"),
            "profit": metrics.get("profit"),
            "profit_margin": metrics.get("profit_margin"),
            "roas": metrics.get("roas"),
            "true_roas": metrics.get("true_roas"),
            "orders": metrics.get("orders"),
            "cpa": metrics.get("cpa"),
        }

        get_client().table("escalafy_metrics").upsert(
            record, on_conflict="date,period"
        ).execute()

        logger.info(f"Escalafy sync guardado: {record}")
        return metrics

    except Exception as e:
        logger.error(f"Escalafy sync error: {e}")
        return None
