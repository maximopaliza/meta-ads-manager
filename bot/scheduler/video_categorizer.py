"""
video_categorizer.py
Evalúa el rendimiento de cada ad vinculado a Drive y mueve los videos
a la carpeta correcta según criterios de performance.

Reglas de transición:
  Nuevos subidos → Winners:    4+ días activos con CPA ≤ $15 y ventas > 0
  Nuevos subidos → Malos:      5+ días activos con CPA > $15 o sin ventas con gasto > $6
  Nuevos subidos → Poco gasto: 5+ días activos con gasto total < $6
  Winners → Quemados:          3 días consecutivos con CPA > $15
  Quemados → Winners:          4 días consecutivos con CPA ≤ $15
  Campaña pausada → evaluar inmediatamente con data acumulada
"""
import logging
from datetime import datetime, timezone, timedelta
from db import queries

logger = logging.getLogger(__name__)

CPA_BREAKEVEN = 15.0   # USD — igual que el resto del sistema
POCO_GASTO_USD = 6.0   # gasto mínimo para evaluar


def _today() -> str:
    return datetime.now(timezone(timedelta(hours=-3))).date().isoformat()


def _evaluate(metrics: list[dict]) -> dict:
    """Agrega métricas de un ad y devuelve estadísticas de evaluación."""
    rows = sorted([m for m in metrics if (m.get("spend") or 0) > 0], key=lambda x: x["date"])
    days_active = len(rows)
    total_spend = sum(m.get("spend", 0) for m in rows)
    total_purchases = sum(m.get("purchases", 0) for m in rows)
    avg_cpa = total_spend / total_purchases if total_purchases > 0 else None
    avg_roas = sum(m.get("purchase_value", 0) for m in rows) / total_spend if total_spend > 0 else None

    # Últimas N filas con gasto (orden cronológico)
    last_3 = rows[-3:]
    last_4 = rows[-4:]

    return {
        "days_active": days_active,
        "total_spend": total_spend,
        "total_purchases": total_purchases,
        "avg_cpa": avg_cpa,
        "avg_roas": avg_roas,
        "last_3": last_3,
        "last_4": last_4,
    }


def _row_cpa(row: dict) -> float | None:
    spend = row.get("spend", 0)
    purchases = row.get("purchases", 0)
    if purchases > 0:
        return spend / purchases
    return None  # sin ventas


def _consecutive_bad(rows: list[dict]) -> bool:
    """True si todos los rows tienen CPA > breakeven (o sin ventas con gasto > 0)."""
    if not rows:
        return False
    for row in rows:
        cpa = _row_cpa(row)
        if cpa is not None and cpa <= CPA_BREAKEVEN:
            return False
        if cpa is None and row.get("spend", 0) == 0:
            return False  # día sin gasto no cuenta
    return True


def _consecutive_good(rows: list[dict]) -> bool:
    """True si todos los rows tienen CPA ≤ breakeven y al menos una venta."""
    if not rows:
        return False
    for row in rows:
        cpa = _row_cpa(row)
        if cpa is None or cpa > CPA_BREAKEVEN:
            return False
    return True


def _determine_new_folder(current: str, ev: dict, campaign_paused: bool) -> str | None:
    """Devuelve la nueva carpeta o None si no hay que mover."""
    days = ev["days_active"]
    spend = ev["total_spend"]
    purchases = ev["total_purchases"]
    avg_cpa = ev["avg_cpa"]

    if current == "Nuevos subidos":
        if campaign_paused:
            # Evaluar inmediatamente con data acumulada
            if spend < POCO_GASTO_USD:
                return "Poco gasto"
            if avg_cpa is not None and avg_cpa <= CPA_BREAKEVEN and purchases > 0:
                return "Winners"
            return "Malos"

        if days >= 5 and spend < POCO_GASTO_USD:
            return "Poco gasto"
        if days >= 4 and avg_cpa is not None and avg_cpa <= CPA_BREAKEVEN and purchases > 0:
            return "Winners"
        if days >= 5 and (avg_cpa is None or avg_cpa > CPA_BREAKEVEN):
            return "Malos"

    elif current == "Winners":
        if len(ev["last_3"]) >= 3 and _consecutive_bad(ev["last_3"]):
            return "Quemados"

    elif current == "Quemados":
        if len(ev["last_4"]) >= 4 and _consecutive_good(ev["last_4"]):
            return "Winners"

    return None


def _save_copy_history(ad: dict, ev: dict, new_folder: str) -> None:
    """Guarda el historial de performance cuando un ad se categoriza."""
    if not ad.get("drive_file_id"):
        return
    try:
        queries.save_copy_history({
            "drive_file_id": ad["drive_file_id"],
            "ad_id": ad["id"],
            "final_folder": new_folder,
            "total_spend": ev["total_spend"],
            "total_purchases": ev["total_purchases"],
            "avg_cpa": ev["avg_cpa"],
            "avg_roas": ev["avg_roas"],
            "active_days": ev["days_active"],
        })
    except Exception as e:
        logger.warning(f"Could not save copy history for {ad['id']}: {e}")


def run_categorizer() -> None:
    logger.info("Starting video categorizer...")

    ads = queries.get_ads_with_drive_file()
    if not ads:
        logger.info("No ads with Drive file found")
        return

    moved = 0
    for ad in ads:
        drive_file_id = ad["drive_file_id"]
        current_folder = ad.get("drive_folder") or "Nuevos subidos"

        # Solo evaluar ads en carpetas dinámicas (no las finales estáticas)
        if current_folder in ("No subidos", "Poco gasto"):
            continue

        try:
            metrics = queries.get_ad_metrics_all(ad["id"])
            ev = _evaluate(metrics)

            # Verificar si la campaña está pausada
            campaign_paused = False
            if ad.get("ad_set_id"):
                camp = queries.get_ad_set_campaign(ad["ad_set_id"])
                if camp and camp.get("status") == "PAUSED":
                    campaign_paused = True

            new_folder = _determine_new_folder(current_folder, ev, campaign_paused)
            if not new_folder:
                continue

            # Mover en Drive
            from meta.drive_client import move_to_subfolder
            ok = move_to_subfolder(drive_file_id, new_folder)
            if ok:
                queries.update_ad_drive_folder(ad["id"], new_folder)
                _save_copy_history(ad, ev, new_folder)
                moved += 1
                logger.info(
                    f"Ad {ad['id']} ({ad['name'][:40]}) moved: "
                    f"{current_folder} → {new_folder} "
                    f"(days={ev['days_active']}, spend=${ev['total_spend']:.2f}, "
                    f"cpa={ev['avg_cpa']:.2f if ev['avg_cpa'] else '—'})"
                )
        except Exception as e:
            logger.error(f"Categorizer error for ad {ad['id']}: {e}", exc_info=True)

    logger.info(f"Categorizer done — {moved} ads moved")
