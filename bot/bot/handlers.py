import logging
import os
from datetime import date
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler
from db import queries
from ai.analyst import answer_natural_language, detect_action_intent
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

logger = logging.getLogger(__name__)

STATUS_EMOJI = {"ACTIVE": "🟢", "PAUSED": "🟡", "ARCHIVED": "🔴"}


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "👋 <b>Meta Ads Manager</b>\n\n"
        "<b>Consultas:</b>\n"
        "/status — Resumen del día\n"
        "/campanas — Lista de campañas con métricas\n"
        "/alertas — Últimas 10 alertas\n\n"
        "<b>Acciones:</b>\n"
        "/gestionar — Pausar o activar una campaña\n"
        "/presupuesto — Cambiar presupuesto diario\n"
        "/crear — Crear una campaña nueva\n"
        "/copys — Gestionar copies y ángulos\n\n"
        "<b>Sistema:</b>\n"
        "/sync — Forzar sync con Meta ahora\n"
        "/backfill [dias] — Importar historial (ej: /backfill 90)\n\n"
        "También podés escribirme en lenguaje natural:\n"
        "<i>\"¿Cuánto gasté hoy?\"</i>\n"
        "<i>\"¿Qué conjunto de anuncios funcionó mejor?\"</i>\n"
        "<i>\"¿Qué ad tuvo mejor hook rate?\"</i>"
    )
    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("⏳ Obteniendo datos...")

    campaigns = queries.get_campaigns()
    today_metrics = queries.get_today_metrics()

    total_spend = sum(m.get("spend", 0) for m in today_metrics)
    total_purchases = sum(m.get("purchases", 0) for m in today_metrics)
    total_pv = sum(m.get("purchase_value", 0) for m in today_metrics)
    avg_roas = total_pv / total_spend if total_spend > 0 else 0
    active = len([c for c in campaigns if c["status"] == "ACTIVE"])

    accounts = queries.get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    text = (
        f"📊 <b>Resumen del día — {date.today().strftime('%d/%m/%Y')}</b>\n\n"
        f"💸 Gasto total: <b>${total_spend:,.2f} {currency}</b>\n"
        f"📈 ROAS promedio: <b>{avg_roas:.2f}x</b>\n"
        f"🛍️ Compras: <b>{total_purchases}</b>\n"
        f"📣 Campañas activas: <b>{active}</b>\n\n"
    )

    if not today_metrics:
        text += "<i>Sin datos de hoy todavía. Ejecutá /sync para sincronizar.</i>"

    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_campanas(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    campaigns = queries.get_campaigns()
    today_metrics = queries.get_today_metrics()
    metrics_map = {m["object_id"]: m for m in today_metrics}

    if not campaigns:
        await update.message.reply_text("Sin campañas sincronizadas. Ejecutá /sync primero.")
        return

    lines = ["📣 <b>Campañas</b>\n"]
    for c in campaigns:
        emoji = STATUS_EMOJI.get(c["status"], "⚪")
        m = metrics_map.get(c["id"])
        roas_str = f" · ROAS {m['roas']:.2f}x" if m and m.get("roas") else ""
        spend_str = f" · ${m.get('spend', 0):,.2f}" if m else ""
        lines.append(f"{emoji} {c['name']}{spend_str}{roas_str}")

    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


async def cmd_alertas(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    alerts = queries.get_recent_alerts(10)
    if not alerts:
        await update.message.reply_text("Sin alertas recientes.")
        return

    EMOJI = {"info": "💡", "warning": "⚠️", "critical": "🔴"}
    lines = ["🔔 <b>Últimas alertas</b>\n"]
    for a in alerts:
        emoji = EMOJI.get(a["severity"], "📢")
        lines.append(f"{emoji} <b>{a['title']}</b>\n<i>{a['message'][:100]}...</i>\n")

    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


async def cmd_sync(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("⏳ Iniciando sync con Meta Ads...")
    try:
        from scheduler.sync import run_sync
        run_sync()
        await update.message.reply_text("✅ Sync completado. Los datos están actualizados.")
    except Exception as e:
        logger.error(f"Manual sync error: {e}")
        await update.message.reply_text(f"❌ Error en sync: {str(e)[:200]}")


async def cmd_backfill(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Trae el histórico completo de Meta Ads. Uso: /backfill [dias] (default: 90)"""
    args = context.args
    try:
        days = int(args[0]) if args else 90
        days = min(days, 365)  # máximo 1 año
    except (ValueError, IndexError):
        await update.message.reply_text("Uso: /backfill [dias] — Ej: /backfill 90")
        return

    from datetime import datetime, timedelta, timezone, timedelta as td
    today = datetime.now(timezone(td(hours=-3))).date()
    since = (today - timedelta(days=days - 1)).isoformat()
    until = today.isoformat()

    await update.message.reply_text(
        f"📥 <b>Iniciando backfill histórico</b>\n\n"
        f"Período: <b>{since} → {until}</b> ({days} días)\n"
        f"Niveles: campaña · conjunto · anuncio\n\n"
        f"⏳ Esto puede tardar varios minutos...",
        parse_mode="HTML",
    )

    try:
        from scheduler.backfill import run_backfill
        result = run_backfill(since, until)
        await update.message.reply_text(
            f"✅ <b>Backfill completado</b>\n\n"
            f"📣 Campañas: <b>{result.get('campaign', 0)}</b> registros\n"
            f"🎯 Conjuntos: <b>{result.get('ad_set', 0)}</b> registros\n"
            f"🎨 Anuncios: <b>{result.get('ad', 0)}</b> registros\n\n"
            f"El dashboard ya puede analizar los {days} días.",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.error(f"Backfill error: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error en backfill: {str(e)[:300]}")


def _fuzzy_match(name_hint: str, campaigns: list) -> dict | None:
    """Busca la campaña cuyo nombre contiene la pista (case-insensitive)."""
    hint = name_hint.lower().strip()
    exact = [c for c in campaigns if hint in c["name"].lower()]
    if exact:
        return exact[0]
    # Si hay una sola campaña activa, la devuelve como fallback
    active = [c for c in campaigns if c["status"] == "ACTIVE"]
    if len(active) == 1 and len(hint) < 4:
        return active[0]
    return None


async def handle_nl_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Ejecuta una acción pendiente confirmada por el usuario vía botón."""
    query = update.callback_query
    await query.answer()

    pending = context.user_data.get("nl_pending")
    if not pending:
        await query.edit_message_text("Acción expirada. Repetí el mensaje.")
        return

    if query.data == "nlact_no":
        await query.edit_message_text("Cancelado.")
        context.user_data.pop("nl_pending", None)
        return

    action = pending["action"]
    campaign_id = pending["campaign_id"]
    campaign_name = pending["campaign_name"]
    accounts = queries.get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    await query.edit_message_text("⏳ Ejecutando en Meta Ads...")

    try:
        from meta.client import MetaClient
        from db.client import get_client as db_client
        client = MetaClient()

        if action in ("pause", "activate"):
            new_status = "PAUSED" if action == "pause" else "ACTIVE"
            client.update_campaign_status(campaign_id, new_status)
            db_client().table("campaigns").update({"status": new_status}).eq("id", campaign_id).execute()
            icon = "⏸" if action == "pause" else "🟢"
            verb = "pausada" if action == "pause" else "activada"
            await query.message.reply_text(f"{icon} <b>{campaign_name}</b> {verb}.", parse_mode="HTML")

        elif action in ("set_budget", "adjust_budget"):
            cents = int(pending["budget"] * 100)
            client.update_campaign_budget(campaign_id, cents)
            db_client().table("campaigns").update({"daily_budget": cents}).eq("id", campaign_id).execute()
            await query.message.reply_text(
                f"✅ Presupuesto de <b>{campaign_name}</b> actualizado a <b>${pending['budget']:,.2f} {currency}</b>.",
                parse_mode="HTML",
            )
    except Exception as e:
        logger.error(f"NL action error: {e}")
        await query.message.reply_text(f"❌ Error: {str(e)[:200]}")

    context.user_data.pop("nl_pending", None)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        await _handle_text_inner(update, context)
    except Exception as e:
        logger.error(f"handle_text unhandled error: {e}", exc_info=True)
        try:
            await update.message.reply_text(f"❌ Error interno: {str(e)[:200]}\nIntentá de nuevo o usá /status")
        except Exception:
            pass


def _quick_answer(text_lower: str, today_camp: list, today_as: list, today_ads: list,
                  campaigns: list, as_map: dict, ads_map: dict, currency: str) -> str | None:
    """Responde preguntas simples directo de los datos, sin Gemini."""
    total_spend = sum(m.get("spend", 0) for m in today_camp)
    total_purchases = sum(m.get("purchases", 0) for m in today_camp)
    total_pv = sum(m.get("purchase_value", 0) for m in today_camp)
    total_atc = sum(m.get("add_to_cart", 0) for m in today_camp)
    total_checkout = sum(m.get("checkout_initiated", 0) for m in today_camp)
    avg_roas = total_pv / total_spend if total_spend > 0 else 0
    avg_cpa = total_spend / total_purchases if total_purchases > 0 else None
    active = len([c for c in campaigns if c["status"] == "ACTIVE"])

    kw = text_lower

    # Gasto
    if any(w in kw for w in ["gast", "spent", "spend", "plata", "dinero", "cuanto"]):
        if "hoy" in kw or "dia" in kw or "día" in kw or "cuanto" in kw:
            lines = [f"💸 <b>Gasto de hoy</b>\n"]
            lines.append(f"Total: <b>${total_spend:,.2f} {currency}</b>")
            lines.append(f"ROAS: <b>{avg_roas:.2f}x</b>")
            lines.append(f"Ventas: <b>{total_purchases}</b>")
            if avg_cpa:
                lines.append(f"CPA: <b>${avg_cpa:,.2f} {currency}</b>")
            if campaigns:
                lines.append("\n<b>Por campaña:</b>")
                camp_m = {m["object_id"]: m for m in today_camp}
                for c in campaigns:
                    m = camp_m.get(c["id"])
                    if m and m.get("spend", 0) > 0:
                        lines.append(f"  • {c['name'][:40]}: ${m.get('spend', 0):,.2f}")
            return "\n".join(lines)

    # Ventas / resultados
    if any(w in kw for w in ["venta", "compra", "result", "pedido", "purchase"]):
        lines = [f"🛍️ <b>Ventas de hoy</b>\n"]
        lines.append(f"Ventas totales: <b>{total_purchases}</b>")
        lines.append(f"Valor total: <b>${total_pv:,.2f} {currency}</b>")
        lines.append(f"ATC: {total_atc} | Checkout: {total_checkout}")
        if avg_cpa:
            lines.append(f"CPA promedio: <b>${avg_cpa:,.2f} {currency}</b>")
        lines.append(f"ROAS: <b>{avg_roas:.2f}x</b>")
        if today_ads:
            top = sorted(today_ads, key=lambda x: x.get("purchases", 0), reverse=True)[:5]
            with_sales = [m for m in top if m.get("purchases", 0) > 0]
            if with_sales:
                lines.append("\n<b>Ads con más ventas:</b>")
                for m in with_sales:
                    ad = ads_map.get(m["object_id"])
                    name = ad["name"][:40] if ad else m["object_id"]
                    lines.append(f"  • {name}: {m.get('purchases', 0)} ventas · CPA ${m.get('spend',0)/m.get('purchases',1):,.2f}")
        return "\n".join(lines)

    # ROAS
    if "roas" in kw:
        lines = [f"📈 <b>ROAS de hoy: {avg_roas:.2f}x</b>\n"]
        camp_m = {m["object_id"]: m for m in today_camp}
        for c in campaigns:
            m = camp_m.get(c["id"])
            if m and m.get("roas"):
                lines.append(f"  • {c['name'][:40]}: {m.get('roas', 0):.2f}x")
        return "\n".join(lines)

    # CPA
    if "cpa" in kw or "costo por" in kw:
        if avg_cpa:
            return f"🎯 <b>CPA de hoy: ${avg_cpa:,.2f} {currency}</b>\nVentas: {total_purchases} · Gasto: ${total_spend:,.2f}"
        return f"🎯 Sin ventas hoy todavía. Gasto: ${total_spend:,.2f} {currency}"

    # Mejor campaña / mejor ad
    if "mejor" in kw:
        if "ad" in kw or "anuncio" in kw or "creativo" in kw:
            if today_ads:
                best = max(today_ads, key=lambda x: x.get("roas") or 0)
                ad = ads_map.get(best["object_id"])
                name = ad["name"] if ad else best["object_id"]
                return f"🏆 <b>Mejor ad hoy:</b> {name}\nROAS: {best.get('roas', 0):.2f}x · Ventas: {best.get('purchases', 0)} · Gasto: ${best.get('spend', 0):,.2f}"
        else:
            camp_m = {m["object_id"]: m for m in today_camp}
            with_roas = [(c, camp_m.get(c["id"])) for c in campaigns if camp_m.get(c["id"]) and camp_m.get(c["id"], {}).get("roas")]
            if with_roas:
                best_c, best_m = max(with_roas, key=lambda x: x[1].get("roas", 0))
                return f"🏆 <b>Mejor campaña hoy:</b> {best_c['name']}\nROAS: {best_m.get('roas', 0):.2f}x · Ventas: {best_m.get('purchases', 0)}"

    # Peor campaña
    if "peor" in kw or "mal" in kw:
        camp_m = {m["object_id"]: m for m in today_camp}
        with_spend = [(c, camp_m.get(c["id"])) for c in campaigns if camp_m.get(c["id"]) and camp_m.get(c["id"], {}).get("spend", 0) > 0]
        if with_spend:
            worst_c, worst_m = min(with_spend, key=lambda x: x[1].get("roas") or 99)
            return f"⚠️ <b>Peor campaña hoy:</b> {worst_c['name']}\nROAS: {worst_m.get('roas', 0) or 0:.2f}x · Gasto: ${worst_m.get('spend', 0):,.2f} sin ventas"

    # Hook rate
    if "hook" in kw:
        if today_ads:
            with_hook = [(m, ads_map.get(m["object_id"])) for m in today_ads if m.get("hook_rate")]
            if with_hook:
                best = max(with_hook, key=lambda x: x[0].get("hook_rate", 0))
                lines = [f"🎣 <b>Hook rate de ads hoy:</b>"]
                for m, ad in sorted(with_hook, key=lambda x: x[0].get("hook_rate", 0), reverse=True)[:5]:
                    name = ad["name"][:35] if ad else m["object_id"]
                    lines.append(f"  • {name}: {m.get('hook_rate', 0):.1f}%")
                return "\n".join(lines)

    # Campañas activas / estado
    if any(w in kw for w in ["activ", "pausad", "estado", "campaña", "campana"]):
        lines = [f"📣 <b>Campañas ({active} activas)</b>"]
        camp_m = {m["object_id"]: m for m in today_camp}
        for c in campaigns:
            emoji = STATUS_EMOJI.get(c["status"], "⚪")
            m = camp_m.get(c["id"])
            spend_str = f" · ${m.get('spend', 0):,.2f}" if m and m.get("spend", 0) > 0 else ""
            lines.append(f"{emoji} {c['name']}{spend_str}")
        return "\n".join(lines)

    # Mejor día / peor día (histórico)
    if "mejor" in kw and ("dia" in kw or "día" in kw):
        metrics_30d = queries.get_all_metrics_range("campaign", 30)
        if metrics_30d:
            day_totals: dict = {}
            for m in metrics_30d:
                d = m["date"]
                if d not in day_totals:
                    day_totals[d] = {"spend": 0, "purchases": 0, "purchase_value": 0}
                day_totals[d]["spend"] += m.get("spend", 0)
                day_totals[d]["purchases"] += m.get("purchases", 0)
                day_totals[d]["purchase_value"] += m.get("purchase_value", 0)
            days_with_sales = {d: v for d, v in day_totals.items() if v["purchases"] > 0}
            if days_with_sales:
                best_d = max(days_with_sales, key=lambda d: days_with_sales[d]["purchase_value"] / max(days_with_sales[d]["spend"], 1))
                b = days_with_sales[best_d]
                roas = b["purchase_value"] / b["spend"] if b["spend"] > 0 else 0
                cpa = b["spend"] / b["purchases"]
                return (f"🏆 <b>Mejor día (últimos 30d):</b> {best_d}\n\n"
                        f"Ventas: <b>{b['purchases']}</b>\n"
                        f"ROAS: <b>{roas:.2f}x</b>\n"
                        f"CPA: <b>${cpa:,.2f} {currency}</b>\n"
                        f"Gasto: ${b['spend']:,.2f} · Valor: ${b['purchase_value']:,.2f}")

    if "peor" in kw and ("dia" in kw or "día" in kw):
        metrics_30d = queries.get_all_metrics_range("campaign", 30)
        if metrics_30d:
            day_totals: dict = {}
            for m in metrics_30d:
                d = m["date"]
                if d not in day_totals:
                    day_totals[d] = {"spend": 0, "purchases": 0, "purchase_value": 0}
                day_totals[d]["spend"] += m.get("spend", 0)
                day_totals[d]["purchases"] += m.get("purchases", 0)
                day_totals[d]["purchase_value"] += m.get("purchase_value", 0)
            days_with_spend = {d: v for d, v in day_totals.items() if v["spend"] > 10}
            if days_with_spend:
                worst_d = min(days_with_spend, key=lambda d: days_with_spend[d]["purchase_value"] / max(days_with_spend[d]["spend"], 1))
                w = days_with_spend[worst_d]
                roas = w["purchase_value"] / w["spend"] if w["spend"] > 0 else 0
                return (f"📉 <b>Peor día (últimos 30d):</b> {worst_d}\n\n"
                        f"Ventas: {w['purchases']}\n"
                        f"ROAS: {roas:.2f}x\n"
                        f"Gasto: ${w['spend']:,.2f} sin retorno")

    # Ayer
    if "ayer" in kw:
        from datetime import timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        metrics_30d = queries.get_all_metrics_range("campaign", 2)
        ayer_rows = [m for m in metrics_30d if m["date"] == yesterday]
        if ayer_rows:
            spend = sum(m.get("spend", 0) for m in ayer_rows)
            purchases = sum(m.get("purchases", 0) for m in ayer_rows)
            pv = sum(m.get("purchase_value", 0) for m in ayer_rows)
            roas = pv / spend if spend > 0 else 0
            cpa = spend / purchases if purchases > 0 else None
            lines = [f"📅 <b>Ayer ({yesterday})</b>\n",
                     f"Gasto: <b>${spend:,.2f} {currency}</b>",
                     f"Ventas: <b>{purchases}</b>",
                     f"ROAS: <b>{roas:.2f}x</b>"]
            if cpa:
                lines.append(f"CPA: <b>${cpa:,.2f} {currency}</b>")
            return "\n".join(lines)
        return f"Sin datos de ayer ({yesterday})."

    # Semana / últimos 7 días
    if any(w in kw for w in ["semana", "7 dia", "7 día", "ultimos 7", "últimos 7"]):
        metrics_7d = queries.get_all_metrics_range("campaign", 7)
        if metrics_7d:
            spend = sum(m.get("spend", 0) for m in metrics_7d)
            purchases = sum(m.get("purchases", 0) for m in metrics_7d)
            pv = sum(m.get("purchase_value", 0) for m in metrics_7d)
            roas = pv / spend if spend > 0 else 0
            cpa = spend / purchases if purchases > 0 else None
            lines = [f"📊 <b>Últimos 7 días</b>\n",
                     f"Gasto total: <b>${spend:,.2f} {currency}</b>",
                     f"Ventas: <b>{purchases}</b>",
                     f"ROAS promedio: <b>{roas:.2f}x</b>"]
            if cpa:
                lines.append(f"CPA promedio: <b>${cpa:,.2f} {currency}</b>")
            return "\n".join(lines)

    return None  # No pudo responder directamente → usar Gemini


async def _handle_text_inner(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text or ""
    if not text.strip():
        return
    if update.message.photo or update.message.video:
        return

    campaigns = queries.get_campaigns()
    ad_sets = queries.get_ad_sets()
    ads = queries.get_ads()
    today_camp = queries.get_today_metrics()
    today_as = queries.get_today_metrics_type("ad_set")
    today_ads = queries.get_today_metrics_type("ad")
    accounts = queries.get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    as_map = {a["id"]: a for a in ad_sets}
    ads_map = {a["id"]: a for a in ads}

    text_lower = text.lower()

    # 1. Detectar acción (keywords simples primero, sin Gemini)
    action_keywords_pause = ["paus", "apag", "desactiv", "detené", "detene", "stop"]
    action_keywords_activate = ["activ", "encend", "prendé", "prende", "resum"]
    action_keywords_budget = [
        "presupuest", "budget", "ponele", "subí", "subi", "bajá", "baja",
        "cambiá", "cambia", "subile", "bajale", "aumenta", "aumentale",
        "reducí", "reducile", "bájale", "subilo", "bajalo",
    ]

    likely_action = False
    if any(w in text_lower for w in action_keywords_pause + action_keywords_activate + action_keywords_budget):
        likely_action = True

    if likely_action:
        # Solo llamar Gemini para detectar acción si parece una acción
        await update.message.reply_text("⏳ Procesando...")
        intent = detect_action_intent(text, campaigns)
        action = intent.get("action", "none")
    else:
        action = "none"

    if action in ("pause", "activate", "set_budget", "adjust_budget"):
        campaign_name_hint = intent.get("campaign_name") or ""
        matched = _fuzzy_match(campaign_name_hint, campaigns) if campaign_name_hint else None

        if not matched:
            camp_list = "\n".join(
                f"  {STATUS_EMOJI.get(c['status'], '⚪')} {c['name']}"
                for c in campaigns if c["status"] != "ARCHIVED"
            )
            await update.message.reply_text(
                f"No encontré la campaña <i>\"{campaign_name_hint}\"</i>.\n\n"
                f"Campañas disponibles:\n{camp_list}\n\nRepetí el mensaje con el nombre exacto.",
                parse_mode="HTML",
            )
            return

        if action == "pause":
            confirm_text = f"¿Confirmás <b>pausar</b> la campaña?\n\n⏸ {matched['name']}"
        elif action == "activate":
            confirm_text = f"¿Confirmás <b>activar</b> la campaña?\n\n▶ {matched['name']}"
        elif action == "adjust_budget":
            delta = intent.get("delta")
            delta_type = intent.get("delta_type")
            direction = intent.get("direction")
            if not delta or not direction:
                await update.message.reply_text("No entendí el ajuste. Ej: 'subile 10 USD' o 'bajale 20%'.")
                return
            old = (matched.get("daily_budget") or 0) / 100
            if old == 0:
                await update.message.reply_text(f"⚠️ <b>{matched['name']}</b> no tiene presupuesto diario configurado.", parse_mode="HTML")
                return
            if delta_type == "percentage":
                change = old * delta / 100
            else:
                change = float(delta)
            new_budget = old + change if direction == "up" else old - change
            new_budget = max(1, round(new_budget, 2))
            pct = ((new_budget - old) / old * 100)
            pct_str = f"+{pct:.0f}%" if pct >= 0 else f"{pct:.0f}%"
            confirm_text = (
                f"¿Confirmás ajustar el presupuesto?\n\n"
                f"💰 {matched['name']}\n"
                f"Actual: ${old:,.2f} {currency} → Nuevo: <b>${new_budget:,.2f} {currency}</b> ({pct_str})"
            )
            intent["budget"] = new_budget
        else:
            budget = intent.get("budget")
            if not budget:
                await update.message.reply_text("No entendí el monto. Ej: 'ponele 5000 a la campaña X'.")
                return
            old = (matched.get("daily_budget") or 0) / 100
            confirm_text = (
                f"¿Confirmás cambiar el presupuesto?\n\n"
                f"💰 {matched['name']}\n"
                f"Actual: ${old:,.2f} {currency} → Nuevo: <b>${budget:,.2f} {currency}</b>"
            )
            intent["budget"] = budget

        context.user_data["nl_pending"] = {
            "action": action,
            "campaign_id": matched["id"],
            "campaign_name": matched["name"],
            "budget": intent.get("budget"),
        }
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Confirmar", callback_data="nlact_yes"),
            InlineKeyboardButton("❌ Cancelar", callback_data="nlact_no"),
        ]])
        await update.message.reply_text(confirm_text, parse_mode="HTML", reply_markup=keyboard)
        return

    # 2. Respuesta directa sin Gemini para preguntas comunes
    quick = _quick_answer(text_lower, today_camp, today_as, today_ads, campaigns, as_map, ads_map, currency)
    if quick:
        await update.message.reply_text(quick, parse_mode="HTML")
        return

    # 3. Gemini para preguntas complejas
    await update.message.reply_text("⏳ Procesando...")

    def _cpa_str(spend, purchases):
        if purchases and purchases > 0:
            return f"${spend / purchases:.2f}"
        return "—"

    ctx_lines = [f"Fecha: {date.today().isoformat()}\n"]
    ctx_lines.append("=== CAMPAÑAS HOY ===")
    camp_m = {m["object_id"]: m for m in today_camp}
    for c in campaigns:
        m = camp_m.get(c["id"])
        if m and m.get("spend", 0) > 0:
            ctx_lines.append(
                f"  {c['name']} [{c['status']}]: gasto=${m.get('spend', 0):.2f} | "
                f"ventas={m.get('purchases', 0)} | CPA={_cpa_str(m.get('spend', 0), m.get('purchases', 0))} | "
                f"ROAS={m.get('roas') or 0:.2f}x | ATC={m.get('add_to_cart', 0)} | "
                f"checkout={m.get('checkout_initiated', 0)}"
            )
        else:
            ctx_lines.append(f"  {c['name']} [{c['status']}]: sin gasto hoy")

    if today_as:
        ctx_lines.append("\n=== CONJUNTOS HOY ===")
        for m in sorted(today_as, key=lambda x: x.get("spend", 0), reverse=True):
            as_obj = as_map.get(m["object_id"])
            name = as_obj["name"] if as_obj else m["object_id"]
            ctx_lines.append(
                f"  {name}: gasto=${m.get('spend', 0):.2f} | "
                f"ventas={m.get('purchases', 0)} | CPA={_cpa_str(m.get('spend', 0), m.get('purchases', 0))} | "
                f"ATC={m.get('add_to_cart', 0)} | CTR={m.get('ctr') or 0:.2f}% | "
                f"hook={m.get('hook_rate') or 0:.1f}%"
            )

    if today_ads:
        ctx_lines.append("\n=== ANUNCIOS HOY (top 10) ===")
        for m in sorted(today_ads, key=lambda x: x.get("spend", 0), reverse=True)[:10]:
            ad_obj = ads_map.get(m["object_id"])
            name = ad_obj["name"] if ad_obj else m["object_id"]
            ctx_lines.append(
                f"  {name}: gasto=${m.get('spend', 0):.2f} | "
                f"ventas={m.get('purchases', 0)} | ROAS={m.get('roas') or 0:.2f}x | hook={m.get('hook_rate') or 0:.1f}%"
            )

    # Pregunta compleja → Gemini
    response = answer_natural_language(text, "\n".join(ctx_lines))
    await update.message.reply_text(response)


def get_handlers():
    return [
        CommandHandler("start", cmd_start),
        CommandHandler("status", cmd_status),
        CommandHandler("campanas", cmd_campanas),
        CommandHandler("alertas", cmd_alertas),
        CommandHandler("sync", cmd_sync),
        CommandHandler("backfill", cmd_backfill),
    ]
