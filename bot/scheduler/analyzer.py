import logging
from datetime import date, timedelta
from db import queries
from ai.analyst import analyze_campaigns

logger = logging.getLogger(__name__)


def _get_7d_avg(metrics_list: list[dict], field: str) -> float | None:
    values = [m[field] for m in metrics_list if m.get(field) is not None]
    return sum(values) / len(values) if values else None


def run_analysis() -> None:
    logger.info("Starting analysis...")
    try:
        campaigns = queries.get_campaigns()
        today = date.today().isoformat()
        today_metrics = queries.get_today_metrics()
        today_map = {m["object_id"]: m for m in today_metrics}

        deterministic_alerts = []

        for campaign in campaigns:
            cid = campaign["id"]
            tm = today_map.get(cid)
            week_metrics = queries.get_campaign_metrics_7d(cid)
            avg_roas = _get_7d_avg(week_metrics[:-1], "roas")
            avg_cpc = _get_7d_avg(week_metrics[:-1], "cpc")

            if campaign["status"] == "ACTIVE" and tm:
                if tm.get("spend", 0) == 0:
                    deterministic_alerts.append({
                        "type": "anomaly",
                        "severity": "critical",
                        "title": f"Gasto $0 — {campaign['name'][:40]}",
                        "message": f"La campaña '{campaign['name']}' está ACTIVE pero no tuvo gasto hoy. Revisá el presupuesto y el estado de los ad sets.",
                        "object_id": cid,
                        "sent_to_telegram": False,
                    })

                if tm.get("roas") is not None and avg_roas and avg_roas > 0:
                    roas_change = (tm["roas"] - avg_roas) / avg_roas
                    if roas_change < -0.30:
                        deterministic_alerts.append({
                            "type": "anomaly",
                            "severity": "critical" if roas_change < -0.50 else "warning",
                            "title": f"ROAS cayó {abs(roas_change)*100:.0f}% — {campaign['name'][:35]}",
                            "message": (
                                f"El ROAS de '{campaign['name']}' bajó de {avg_roas:.2f}x (promedio 7d) a {tm['roas']:.2f}x hoy "
                                f"({roas_change*100:.0f}%). Revisá creativos, audiencias y el landing."
                            ),
                            "object_id": cid,
                            "sent_to_telegram": False,
                        })
                    elif roas_change > 0.30:
                        deterministic_alerts.append({
                            "type": "recommendation",
                            "severity": "info",
                            "title": f"ROAS subió {roas_change*100:.0f}% — {campaign['name'][:35]}",
                            "message": (
                                f"El ROAS de '{campaign['name']}' subió de {avg_roas:.2f}x a {tm['roas']:.2f}x hoy. "
                                f"Considerá aumentar el presupuesto diario un 20-30% para capitalizar el buen rendimiento."
                            ),
                            "object_id": cid,
                            "sent_to_telegram": False,
                        })

                if tm.get("cpc") and avg_cpc and avg_cpc > 0:
                    cpc_change = (tm["cpc"] - avg_cpc) / avg_cpc
                    if cpc_change > 0.50:
                        deterministic_alerts.append({
                            "type": "anomaly",
                            "severity": "warning",
                            "title": f"CPC subió {cpc_change*100:.0f}% — {campaign['name'][:35]}",
                            "message": (
                                f"El CPC de '{campaign['name']}' subió de ${avg_cpc:.0f} a ${tm['cpc']:.0f} hoy. "
                                f"Revisá la competencia en la subasta y el score de relevancia de los creativos."
                            ),
                            "object_id": cid,
                            "sent_to_telegram": False,
                        })

                days_running = len(week_metrics)
                if days_running >= 3 and tm.get("frequency", 0) > 3.5:
                    deterministic_alerts.append({
                        "type": "recommendation",
                        "severity": "warning",
                        "title": f"Frecuencia alta — {campaign['name'][:40]}",
                        "message": (
                            f"La frecuencia de '{campaign['name']}' llegó a {tm['frequency']:.1f} con {days_running} días activa. "
                            f"Los creativos pueden estar quemados. Rotá con nuevas variaciones."
                        ),
                        "object_id": cid,
                        "sent_to_telegram": False,
                    })

        for alert in deterministic_alerts:
            queries.insert_alert(alert)

        if today_metrics:
            total_spend = sum(m.get("spend", 0) for m in today_metrics)
            total_purchases = sum(m.get("purchases", 0) for m in today_metrics)
            total_pv = sum(m.get("purchase_value", 0) for m in today_metrics)
            avg_roas_global = total_pv / total_spend if total_spend > 0 else 0
            active_campaigns = len([c for c in campaigns if c["status"] == "ACTIVE"])

            summary = (
                f"Fecha: {today}\n"
                f"Campañas activas: {active_campaigns}\n"
                f"Gasto total hoy: ${total_spend:.2f}\n"
                f"ROAS promedio hoy: {avg_roas_global:.2f}x\n"
                f"Compras hoy: {total_purchases}\n\n"
                f"Detalle por campaña:\n"
            )
            for m in today_metrics:
                campaign = next((c for c in campaigns if c["id"] == m["object_id"]), None)
                if campaign:
                    summary += (
                        f"- {campaign['name']}: gasto=${m.get('spend', 0):.2f}, "
                        f"ROAS={m.get('roas', 0) or 0:.2f}x, compras={m.get('purchases', 0)}\n"
                    )

            ai_alerts = analyze_campaigns(summary)
            for alert in ai_alerts:
                if alert.get("title") and alert.get("message"):
                    alert["sent_to_telegram"] = False
                    queries.insert_alert(alert)

        logger.info(f"Analysis done. {len(deterministic_alerts)} deterministic alerts inserted.")

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
