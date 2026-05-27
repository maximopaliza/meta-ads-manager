import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from db import queries
from ai.analyst import analyze_campaigns, analyze_days

logger = logging.getLogger(__name__)

CPA_BREAKEVEN = 15
CPA_TARGET = 7


def _today() -> str:
    return datetime.now(timezone(timedelta(hours=-3))).date().isoformat()


def _agg_day(metrics: list[dict]) -> dict:
    """Agrega métricas de múltiples filas en un solo dict del día."""
    a = dict(spend=0, purchases=0, purchase_value=0, impressions=0,
             link_clicks=0, unique_link_clicks=0, reach=0,
             add_to_cart=0, landing_page_views=0)
    for m in metrics:
        for k in a:
            a[k] += m.get(k) or 0
    a["cpa"] = a["spend"] / a["purchases"] if a["purchases"] > 0 else None
    a["roas"] = a["purchase_value"] / a["spend"] if a["spend"] > 0 else None
    a["ctr"] = a["unique_link_clicks"] / a["reach"] * 100 if a["reach"] > 0 and a["unique_link_clicks"] > 0 else None
    a["cpm"] = a["spend"] / a["impressions"] * 1000 if a["impressions"] > 0 else None
    return a


def _fmt(val, prefix="$", suffix="", decimals=2):
    if val is None:
        return "—"
    return f"{prefix}{val:.{decimals}f}{suffix}"


def _build_context(
    campaigns: list[dict],
    ad_sets: list[dict],
    campaign_metrics: list[dict],
    adset_metrics: list[dict],
) -> str:
    """Construye el contexto completo para Gemini con datos día por día."""

    camp_map = {c["id"]: c["name"] for c in campaigns}
    as_map = {a["id"]: a for a in ad_sets}

    # --- Totales por día (todas las campañas) ---
    by_day: dict[str, list] = defaultdict(list)
    for m in campaign_metrics:
        by_day[m["date"]].append(m)

    days_sorted = sorted(by_day.keys())

    lines = ["=== ANÁLISIS DÍA POR DÍA (últimos 14 días) ===\n"]

    # Totales del período
    all_rows = campaign_metrics
    total_spend = sum(m.get("spend") or 0 for m in all_rows)
    total_purch = sum(m.get("purchases") or 0 for m in all_rows)
    total_pv = sum(m.get("purchase_value") or 0 for m in all_rows)
    period_cpa = total_spend / total_purch if total_purch > 0 else None
    period_roas = total_pv / total_spend if total_spend > 0 else None

    lines.append(f"PERÍODO: {days_sorted[0] if days_sorted else '?'} → {days_sorted[-1] if days_sorted else '?'}")
    lines.append(f"Gasto total: ${total_spend:.2f} | Ventas: {total_purch} | CPA prom: {_fmt(period_cpa)} | ROAS prom: {_fmt(period_roas, prefix='', suffix='x')}")
    lines.append(f"CPA target: ${CPA_TARGET} | CPA breakeven: ${CPA_BREAKEVEN}\n")

    # --- Día por día con desglose ---
    lines.append("--- DÍA A DÍA ---")
    best_day = None
    worst_day = None

    for day in days_sorted:
        day_rows = by_day[day]
        day_agg = _agg_day(day_rows)

        cpa_str = _fmt(day_agg["cpa"])
        roas_str = _fmt(day_agg["roas"], prefix="", suffix="x")
        flag = ""
        if day_agg["cpa"] and day_agg["cpa"] <= CPA_TARGET:
            flag = " ✅ DÍA BUENO"
            if not best_day or (day_agg["cpa"] or 999) < (best_day["cpa"] or 999):
                best_day = {**day_agg, "date": day}
        elif day_agg["cpa"] and day_agg["cpa"] > CPA_BREAKEVEN:
            flag = " 🔴 DÍA MALO"
            if not worst_day or (day_agg["cpa"] or 0) > (worst_day["cpa"] or 0):
                worst_day = {**day_agg, "date": day}
        elif day_agg["purchases"] == 0 and day_agg["spend"] > 5:
            flag = " ❌ SIN VENTAS"
            if not worst_day:
                worst_day = {**day_agg, "date": day}

        lines.append(
            f"\n📅 {day}{flag}"
            f"\n   Gasto: ${day_agg['spend']:.2f} | Ventas: {day_agg['purchases']} | "
            f"CPA: {cpa_str} | ROAS: {roas_str}"
            f"\n   Impresiones: {day_agg['impressions']:,} | CTR: {_fmt(day_agg['ctr'], prefix='', suffix='%')} | "
            f"CPM: {_fmt(day_agg['cpm'])} | ATC: {day_agg['add_to_cart']}"
        )

        # Desglose por campaña en ese día
        camp_breakdown = []
        for m in day_rows:
            cname = camp_map.get(m["object_id"], m["object_id"])
            cpa_c = m["spend"] / m["purchases"] if m.get("purchases", 0) > 0 else None
            roas_c = m.get("purchase_value", 0) / m["spend"] if m.get("spend", 0) > 0 else None
            camp_breakdown.append(
                f"     • {cname[:45]}: gasto=${m.get('spend', 0):.2f}, "
                f"ventas={m.get('purchases', 0)}, CPA={_fmt(cpa_c)}, ROAS={_fmt(roas_c, prefix='', suffix='x')}"
            )
        if camp_breakdown:
            lines.append("   Por campaña:")
            lines.extend(camp_breakdown)

    # --- Desglose adsets hoy ---
    today = _today()
    today_adsets = [m for m in adset_metrics if m["date"] == today]

    if today_adsets:
        lines.append("\n\n=== CONJUNTOS DE ANUNCIOS — HOY ===")
        # Agrupar por campaña
        as_by_camp: dict[str, list] = defaultdict(list)
        for m in today_adsets:
            as_obj = as_map.get(m["object_id"])
            camp_id = as_obj.get("campaign_id") if as_obj else None
            as_by_camp[camp_id or "desconocido"].append(m)

        for camp_id, as_rows in as_by_camp.items():
            cname = camp_map.get(camp_id, camp_id[:20] if camp_id else "Desconocida")
            lines.append(f"\n  Campaña: {cname}")
            for m in sorted(as_rows, key=lambda x: x.get("spend", 0), reverse=True):
                as_obj = as_map.get(m["object_id"])
                as_name = as_obj["name"][:50] if as_obj else m["object_id"]
                cpa_a = m["spend"] / m["purchases"] if m.get("purchases", 0) > 0 else None
                roas_a = m.get("purchase_value", 0) / m["spend"] if m.get("spend", 0) > 0 else None
                freq = m.get("frequency")
                hook = m.get("hook_rate")
                lines.append(
                    f"    • {as_name}: gasto=${m.get('spend', 0):.2f} | "
                    f"ventas={m.get('purchases', 0)} | CPA={_fmt(cpa_a)} | ROAS={_fmt(roas_a, prefix='', suffix='x')} | "
                    f"CTR={_fmt(m.get('ctr'), prefix='', suffix='%')} | "
                    f"ATC={m.get('add_to_cart', 0)} | "
                    f"Frec={f'{freq:.1f}' if freq else '—'} | Hook={_fmt(hook, prefix='', suffix='%', decimals=1)}"
                )

    # --- Adsets últimos 14d (resumen) ---
    as_agg_all: dict[str, dict] = defaultdict(lambda: dict(spend=0, purchases=0, purchase_value=0,
                                                            add_to_cart=0, days=0))
    for m in adset_metrics:
        aid = m["object_id"]
        as_agg_all[aid]["spend"] += m.get("spend") or 0
        as_agg_all[aid]["purchases"] += m.get("purchases") or 0
        as_agg_all[aid]["purchase_value"] += m.get("purchase_value") or 0
        as_agg_all[aid]["add_to_cart"] += m.get("add_to_cart") or 0
        if m.get("spend", 0) > 0:
            as_agg_all[aid]["days"] += 1

    if as_agg_all:
        lines.append("\n\n=== RANKING CONJUNTOS — ÚLTIMOS 14 DÍAS ===")
        ranked = sorted(as_agg_all.items(), key=lambda x: x[1]["spend"], reverse=True)
        for aid, agg in ranked[:15]:
            as_obj = as_map.get(aid)
            as_name = as_obj["name"][:50] if as_obj else aid
            cpa_r = agg["spend"] / agg["purchases"] if agg["purchases"] > 0 else None
            roas_r = agg["purchase_value"] / agg["spend"] if agg["spend"] > 0 else None
            lines.append(
                f"  • {as_name}: gasto=${agg['spend']:.2f} | "
                f"ventas={agg['purchases']} | CPA={_fmt(cpa_r)} | ROAS={_fmt(roas_r, prefix='', suffix='x')} | "
                f"ATC={agg['add_to_cart']} | días activo={agg['days']}"
            )

    return "\n".join(lines)


def _deterministic_alerts(campaigns, today_camp_metrics, campaign_metrics_14d, adset_metrics_14d):
    """Alertas determinísticas basadas en reglas fijas."""
    alerts = []
    today = _today()
    today_map = {m["object_id"]: m for m in today_camp_metrics}

    # Histórico 7d promedio por campaña (excluye hoy)
    hist: dict[str, list] = defaultdict(list)
    for m in campaign_metrics_14d:
        if m["date"] < today:
            hist[m["object_id"]].append(m)

    for c in campaigns:
        cid = c["id"]
        tm = today_map.get(cid)
        h = hist.get(cid, [])

        if c["status"] != "ACTIVE" or not tm:
            continue

        # Gasto $0 activa
        if tm.get("spend", 0) == 0:
            alerts.append({
                "type": "anomaly", "severity": "critical",
                "title": f"Gasto $0 — {c['name'][:40]}",
                "message": f"'{c['name']}' está ACTIVE pero sin gasto hoy. Revisá presupuesto y estado de ad sets.",
                "object_id": cid, "sent_to_telegram": False,
            })

        # ROAS vs promedio histórico
        if h and tm.get("roas") is not None:
            avg_roas = sum(m["roas"] for m in h if m.get("roas")) / max(1, len([m for m in h if m.get("roas")]))
            if avg_roas > 0:
                change = (tm["roas"] - avg_roas) / avg_roas
                if change < -0.35:
                    alerts.append({
                        "type": "anomaly",
                        "severity": "critical" if change < -0.55 else "warning",
                        "title": f"ROAS cayó {abs(change)*100:.0f}% — {c['name'][:35]}",
                        "message": (
                            f"ROAS de '{c['name']}' bajó de {avg_roas:.2f}x (prom 7d) a {tm['roas']:.2f}x hoy "
                            f"({change*100:.0f}%). Revisá creativos, audiencias y landing."
                        ),
                        "object_id": cid, "sent_to_telegram": False,
                    })
                elif change > 0.35:
                    alerts.append({
                        "type": "recommendation", "severity": "info",
                        "title": f"ROAS subió {change*100:.0f}% — {c['name'][:35]}",
                        "message": (
                            f"ROAS de '{c['name']}' subió de {avg_roas:.2f}x a {tm['roas']:.2f}x hoy. "
                            f"Considerá aumentar presupuesto 20-30% para capitalizar."
                        ),
                        "object_id": cid, "sent_to_telegram": False,
                    })

        # CPA sobre breakeven hoy
        cpa_today = tm["spend"] / tm["purchases"] if tm.get("purchases", 0) > 0 else None
        if cpa_today and cpa_today > CPA_BREAKEVEN:
            alerts.append({
                "type": "anomaly", "severity": "critical",
                "title": f"CPA sobre breakeven — {c['name'][:35]}",
                "message": (
                    f"'{c['name']}' tiene CPA ${cpa_today:.2f} hoy (breakeven: ${CPA_BREAKEVEN}). "
                    f"Se está perdiendo plata. Pausar o ajustar urgente."
                ),
                "object_id": cid, "sent_to_telegram": False,
            })

        # Frecuencia alta
        if tm.get("frequency", 0) and tm["frequency"] > 3.5:
            alerts.append({
                "type": "recommendation", "severity": "warning",
                "title": f"Frecuencia {tm['frequency']:.1f} — creativos quemados",
                "message": (
                    f"'{c['name']}' tiene frecuencia {tm['frequency']:.1f}. "
                    f"La audiencia ya vio el ad demasiadas veces. Rotá creativos."
                ),
                "object_id": cid, "sent_to_telegram": False,
            })

        # ATC sin conversión
        if tm.get("add_to_cart", 0) > 2 and tm.get("purchases", 0) == 0:
            alerts.append({
                "type": "anomaly", "severity": "warning",
                "title": f"ATC sin ventas — {c['name'][:35]}",
                "message": (
                    f"'{c['name']}' tuvo {tm['add_to_cart']} ATCs sin ninguna venta. "
                    f"Hay interés pero algo falla: revisá el checkout, el precio, o la landing."
                ),
                "object_id": cid, "sent_to_telegram": False,
            })

    return alerts


def _trend_alerts(campaigns: list[dict], campaign_metrics: list[dict]) -> list[dict]:
    """
    Detecta rachas consecutivas de días buenos o malos por campaña.
    Solo genera alerta al alcanzar exactamente 3, 5 o 7 días de racha.
    """
    alerts = []
    camp_map = {c["id"]: c for c in campaigns}

    # Agrupar métricas por campaña y ordenar por fecha DESC
    by_camp: dict[str, list] = {}
    for m in campaign_metrics:
        by_camp.setdefault(m["object_id"], []).append(m)

    for cid, rows in by_camp.items():
        camp = camp_map.get(cid)
        if not camp or camp.get("status") != "ACTIVE":
            continue

        # Ordenar por fecha DESC, solo días con gasto
        days = sorted(
            [r for r in rows if (r.get("spend") or 0) > 0],
            key=lambda x: x["date"],
            reverse=True,
        )
        if len(days) < 3:
            continue

        bad_streak = 0
        good_streak = 0
        for day in days:
            cpa = day["spend"] / day["purchases"] if day.get("purchases", 0) > 0 else None
            is_bad = cpa is None or cpa > CPA_BREAKEVEN
            is_good = cpa is not None and cpa <= CPA_TARGET

            if is_bad:
                if good_streak > 0:
                    break
                bad_streak += 1
            elif is_good:
                if bad_streak > 0:
                    break
                good_streak += 1
            else:
                break

        streak = bad_streak or good_streak
        if streak not in (3, 5, 7):
            continue

        # Resumen de los últimos N días con gasto
        streak_rows = days[:streak]
        total_spend = sum(r.get("spend", 0) for r in streak_rows)
        total_purch = sum(r.get("purchases", 0) for r in streak_rows)
        avg_cpa = total_spend / total_purch if total_purch > 0 else None
        avg_roas = (
            sum(r.get("purchase_value", 0) for r in streak_rows) / total_spend
            if total_spend > 0 else None
        )
        since_date = streak_rows[-1]["date"]

        if bad_streak:
            alerts.append({
                "type": "trend",
                "severity": "critical" if streak >= 5 else "warning",
                "title": f"{streak} días malos seguidos — {camp['name'][:40]}",
                "message": (
                    f"'{camp['name']}' lleva {streak} días consecutivos con mal rendimiento "
                    f"(desde {since_date}).\n"
                    f"Gasto acumulado: ${total_spend:.2f} | Ventas: {total_purch} | "
                    f"CPA promedio: {_fmt(avg_cpa)} (breakeven: ${CPA_BREAKEVEN})\n\n"
                    f"💡 Revisá creativos, audiencias y landing. "
                    f"Si no mejora hoy, considerá pausarla."
                ),
                "object_id": cid,
                "sent_to_telegram": False,
            })
        elif good_streak:
            alerts.append({
                "type": "trend",
                "severity": "info",
                "title": f"{streak} días buenos seguidos — {camp['name'][:40]}",
                "message": (
                    f"'{camp['name']}' lleva {streak} días consecutivos con buen rendimiento "
                    f"(desde {since_date}).\n"
                    f"Gasto acumulado: ${total_spend:.2f} | Ventas: {total_purch} | "
                    f"CPA promedio: {_fmt(avg_cpa)} | ROAS: {_fmt(avg_roas, prefix='', suffix='x')}\n\n"
                    f"📈 Considerá escalar el presupuesto 20-30% para capitalizar."
                ),
                "object_id": cid,
                "sent_to_telegram": False,
            })

    return alerts


def run_analysis() -> None:
    logger.info("Starting deep analysis...")
    try:
        campaigns = queries.get_campaigns()
        ad_sets = queries.get_ad_sets()
        campaign_metrics = queries.get_all_metrics_range("campaign", days=14)
        adset_metrics = queries.get_all_metrics_range("ad_set", days=14)
        today = _today()
        today_camp = [m for m in campaign_metrics if m["date"] == today]

        # 1. Alertas determinísticas (reglas fijas)
        det_alerts = _deterministic_alerts(campaigns, today_camp, campaign_metrics, adset_metrics)
        for a in det_alerts:
            queries.insert_alert(a)
        logger.info(f"Inserted {len(det_alerts)} deterministic alerts")

        # 2. Alertas de tendencia (rachas de 3/5/7 días)
        trend_alerts = _trend_alerts(campaigns, campaign_metrics)
        for a in trend_alerts:
            queries.insert_alert(a)
        logger.info(f"Inserted {len(trend_alerts)} trend alerts")

        # 3. Análisis IA profundo día por día
        if campaign_metrics:
            context = _build_context(campaigns, ad_sets, campaign_metrics, adset_metrics)
            ai_alerts = analyze_days(context)
            for a in ai_alerts:
                if a.get("title") and a.get("message"):
                    a.setdefault("sent_to_telegram", False)
                    a.setdefault("object_id", None)
                    queries.insert_alert(a)
            logger.info(f"Inserted {len(ai_alerts)} AI day-analysis alerts")

        logger.info("Deep analysis completed")

    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
