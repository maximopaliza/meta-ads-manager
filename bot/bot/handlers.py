import logging
import os
from datetime import date
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler
from db import queries
from ai.analyst import answer_natural_language

logger = logging.getLogger(__name__)

STATUS_EMOJI = {"ACTIVE": "🟢", "PAUSED": "🟡", "ARCHIVED": "🔴"}


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "👋 <b>Meta Ads Manager</b>\n\n"
        "Comandos disponibles:\n"
        "/status — Resumen del día\n"
        "/campanas — Lista de campañas\n"
        "/alertas — Últimas 10 alertas\n"
        "/sync — Forzar sync con Meta\n"
        "/analizar — Analizar un creativo (enviá imagen)\n\n"
        "También podés escribirme en lenguaje natural:\n"
        "<i>\"¿Cuál es mi mejor campaña esta semana?\"</i>\n"
        "<i>\"¿Cuánto gasté hoy?\"</i>"
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


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text or ""
    if not text.strip():
        return

    if update.message.photo or update.message.video:
        return

    await update.message.reply_text("⏳ Procesando...")

    campaigns = queries.get_campaigns()
    today_metrics = queries.get_today_metrics()

    ctx_lines = [f"Fecha: {date.today().isoformat()}", "Métricas hoy:"]
    metrics_map = {m["object_id"]: m for m in today_metrics}
    for c in campaigns:
        m = metrics_map.get(c["id"])
        if m:
            ctx_lines.append(
                f"  {c['name']} ({c['status']}): gasto=${m.get('spend', 0):.2f}, "
                f"ROAS={m.get('roas') or 0:.2f}x, compras={m.get('purchases', 0)}"
            )

    context_str = "\n".join(ctx_lines)
    response = answer_natural_language(text, context_str)
    await update.message.reply_text(response)


def get_handlers():
    return [
        CommandHandler("start", cmd_start),
        CommandHandler("status", cmd_status),
        CommandHandler("campanas", cmd_campanas),
        CommandHandler("alertas", cmd_alertas),
        CommandHandler("sync", cmd_sync),
    ]
