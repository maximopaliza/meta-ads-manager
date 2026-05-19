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
        "/crear — Crear una campaña nueva\n\n"
        "<b>Sistema:</b>\n"
        "/sync — Forzar sync con Meta ahora\n\n"
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
        f"💸 Gasto total: <b>${total_spend:,.0f} {currency}</b>\n"
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
        spend_str = f" · ${m.get('spend', 0):,.0f}" if m else ""
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

        elif action == "set_budget":
            cents = int(pending["budget"] * 100)
            client.update_campaign_budget(campaign_id, cents)
            db_client().table("campaigns").update({"daily_budget": cents}).eq("id", campaign_id).execute()
            await query.message.reply_text(
                f"✅ Presupuesto de <b>{campaign_name}</b> actualizado a <b>${pending['budget']:,.0f} {currency}</b>.",
                parse_mode="HTML",
            )
    except Exception as e:
        logger.error(f"NL action error: {e}")
        await query.message.reply_text(f"❌ Error: {str(e)[:200]}")

    context.user_data.pop("nl_pending", None)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text or ""
    if not text.strip():
        return
    if update.message.photo or update.message.video:
        return

    await update.message.reply_text("⏳ Procesando...")

    campaigns = queries.get_campaigns()
    ad_sets = queries.get_ad_sets()
    ads = queries.get_ads()
    today_camp = queries.get_today_metrics()
    today_as = queries.get_today_metrics_type("ad_set")
    today_ads = queries.get_today_metrics_type("ad")

    as_map = {a["id"]: a for a in ad_sets}
    ads_map = {a["id"]: a for a in ads}

    ctx_lines = [f"Fecha: {date.today().isoformat()}\n"]

    # Campañas hoy
    ctx_lines.append("=== CAMPAÑAS HOY ===")
    camp_m = {m["object_id"]: m for m in today_camp}
    for c in campaigns:
        m = camp_m.get(c["id"])
        if m and m.get("spend", 0) > 0:
            cpa = m["spend"] / m["purchases"] if m.get("purchases", 0) > 0 else None
            ctx_lines.append(
                f"  {c['name']} [{c['status']}]: gasto=${m.get('spend', 0):.2f} | "
                f"ventas={m.get('purchases', 0)} | CPA={'$'+f\"{cpa:.2f}\" if cpa else '—'} | "
                f"ROAS={m.get('roas') or 0:.2f}x | ATC={m.get('add_to_cart', 0)} | "
                f"checkout={m.get('checkout_initiated', 0)}"
            )
        else:
            ctx_lines.append(f"  {c['name']} [{c['status']}]: sin gasto hoy")

    # Ad sets hoy
    if today_as:
        ctx_lines.append("\n=== CONJUNTOS HOY ===")
        for m in sorted(today_as, key=lambda x: x.get("spend", 0), reverse=True):
            as_obj = as_map.get(m["object_id"])
            name = as_obj["name"] if as_obj else m["object_id"]
            cpa = m["spend"] / m["purchases"] if m.get("purchases", 0) > 0 else None
            ctx_lines.append(
                f"  {name}: gasto=${m.get('spend', 0):.2f} | "
                f"ventas={m.get('purchases', 0)} | CPA={'$'+f\"{cpa:.2f}\" if cpa else '—'} | "
                f"ATC={m.get('add_to_cart', 0)} | CTR={m.get('ctr') or 0:.2f}% | "
                f"hook={m.get('hook_rate') or 0:.1f}% | frec={m.get('frequency') or '—'}"
            )

    # Ads hoy (top 15 por gasto)
    if today_ads:
        ctx_lines.append("\n=== ANUNCIOS HOY (top 15) ===")
        for m in sorted(today_ads, key=lambda x: x.get("spend", 0), reverse=True)[:15]:
            ad_obj = ads_map.get(m["object_id"])
            name = ad_obj["name"] if ad_obj else m["object_id"]
            cpa = m["spend"] / m["purchases"] if m.get("purchases", 0) > 0 else None
            ctx_lines.append(
                f"  {name}: gasto=${m.get('spend', 0):.2f} | "
                f"ventas={m.get('purchases', 0)} | CPA={'$'+f\"{cpa:.2f}\" if cpa else '—'} | "
                f"ROAS={m.get('roas') or 0:.2f}x | hook={m.get('hook_rate') or 0:.1f}%"
            )

    # Detectar intención de acción antes de responder como pregunta
    intent = detect_action_intent(text, campaigns)
    action = intent.get("action", "none")

    if action in ("pause", "activate", "set_budget"):
        campaign_name_hint = intent.get("campaign_name") or ""
        matched = _fuzzy_match(campaign_name_hint, campaigns) if campaign_name_hint else None

        if not matched:
            # No encontró campaña — listar para que elija
            camp_list = "\n".join(
                f"  {STATUS_EMOJI.get(c['status'], '⚪')} {c['name']}"
                for c in campaigns if c["status"] != "ARCHIVED"
            )
            await update.message.reply_text(
                f"No encontré la campaña <i>\"{campaign_name_hint}\"</i>.\n\n"
                f"Campañas disponibles:\n{camp_list}\n\n"
                f"Repetí el mensaje con el nombre exacto.",
                parse_mode="HTML",
            )
            return

        # Construir mensaje de confirmación
        accounts = queries.get_accounts()
        currency = accounts[0]["currency"] if accounts else "ARS"

        if action == "pause":
            confirm_text = f"¿Confirmás <b>pausar</b> la campaña?\n\n⏸ {matched['name']}"
        elif action == "activate":
            confirm_text = f"¿Confirmás <b>activar</b> la campaña?\n\n▶ {matched['name']}"
        else:  # set_budget
            budget = intent.get("budget")
            if not budget:
                await update.message.reply_text("No entendí el monto. Decime, ej: 'ponele 5000 a la campaña X'.")
                return
            old = (matched.get("daily_budget") or 0) / 100
            confirm_text = (
                f"¿Confirmás cambiar el presupuesto?\n\n"
                f"💰 {matched['name']}\n"
                f"Actual: ${old:,.0f} {currency} → Nuevo: <b>${budget:,.0f} {currency}</b>"
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

    # Pregunta normal
    response = answer_natural_language(text, "\n".join(ctx_lines))
    await update.message.reply_text(response)


def get_handlers():
    return [
        CommandHandler("start", cmd_start),
        CommandHandler("status", cmd_status),
        CommandHandler("campanas", cmd_campanas),
        CommandHandler("alertas", cmd_alertas),
        CommandHandler("sync", cmd_sync),
    ]
