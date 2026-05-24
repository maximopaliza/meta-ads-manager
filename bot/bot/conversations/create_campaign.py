"""
Flujo de creación de campaña via Telegram:
  1. Recibe creativo (foto o video)
  2. Pide URL de destino
  3. Gemini analiza ambos → sugiere objetivo, copy y targeting
  4. Usuario confirma o cambia el objetivo
  5. Usuario ingresa presupuesto diario
  6. Resumen completo + botón Confirmar → crea en Meta (PAUSED)
"""
import logging
import os
import re
import tempfile
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)
from ai.creative_analyst import analyze_for_campaign

logger = logging.getLogger(__name__)

# Estados de la conversación
CREATIVE, URL, OBJECTIVE, BUDGET, CONFIRM = range(5)

OBJECTIVE_LABELS = {
    "ventas": "🛍️ Ventas",
    "trafico": "🌐 Tráfico",
    "alcance": "📢 Alcance",
}

URL_RE = re.compile(r"https?://\S+")


# ── Paso 0: Arrancar ──────────────────────────────────────────────────────────

async def start_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "🎨 <b>Nueva campaña</b>\n\n"
        "Enviame la imagen o video que vas a usar como creativo.",
        parse_mode="HTML",
    )
    return CREATIVE


# ── Paso 1: Recibir creativo ──────────────────────────────────────────────────

VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"}

async def receive_creative(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.message

    if message.photo:
        file = await message.photo[-1].get_file()
        suffix = ".jpg"
    elif message.video:
        file = await message.video.get_file()
        suffix = ".mp4"
    elif message.document and (
        message.document.mime_type in VIDEO_MIMES
        or (message.document.file_name or "").lower().endswith((".mp4", ".mov", ".avi", ".mkv"))
    ):
        file = await message.document.get_file()
        suffix = ".mp4"
    else:
        await message.reply_text("Enviame una imagen o video (JPG, PNG, MP4, MOV).")
        return CREATIVE

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    await file.download_to_drive(tmp.name)
    context.user_data["creative_path"] = tmp.name
    context.user_data["is_video"] = suffix == ".mp4"

    await message.reply_text(
        "✅ Creativo recibido.\n\n"
        "Ahora enviame la <b>URL de destino</b> (landing page donde van a llegar los usuarios).",
        parse_mode="HTML",
    )
    return URL


# ── Paso 2: Recibir URL → analizar con Gemini ─────────────────────────────────

async def receive_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text(
            "No encontré una URL válida. Enviame algo como:\n"
            "<code>https://tutienda.com/producto</code>",
            parse_mode="HTML",
        )
        return URL

    url = match.group()
    context.user_data["destination_url"] = url

    msg = await update.message.reply_text("⏳ Analizando creativo con IA…")

    plan = analyze_for_campaign(context.user_data["creative_path"], url)
    context.user_data["plan"] = plan

    obj_label = OBJECTIVE_LABELS.get(plan["objective"], "🛍️ Ventas")
    analysis_text = (
        f"📊 <b>Análisis del creativo</b>\n\n"
        f"{plan['analysis']}\n\n"
        f"✏️ <b>Copy sugerido</b>\n"
        f"<i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"👥 <b>Público:</b> {plan['audience_summary']}\n\n"
        f"🎯 <b>Objetivo sugerido:</b> {obj_label}\n\n"
        f"¿Cambiamos el objetivo o lo dejamos así?"
    )

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("🛍️ Ventas", callback_data="obj_ventas"),
        InlineKeyboardButton("🌐 Tráfico", callback_data="obj_trafico"),
        InlineKeyboardButton("📢 Alcance", callback_data="obj_alcance"),
    ], [
        InlineKeyboardButton(f"✅ Mantener ({obj_label})", callback_data=f"obj_{plan['objective']}"),
    ]])

    await msg.delete()
    await update.message.reply_text(analysis_text, parse_mode="HTML", reply_markup=keyboard)
    return OBJECTIVE


# ── Paso 3: Confirmar objetivo ────────────────────────────────────────────────

async def receive_objective(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    objective = query.data.replace("obj_", "")
    context.user_data["plan"]["objective"] = objective

    await query.edit_message_text(
        f"Objetivo: {OBJECTIVE_LABELS.get(objective, objective)} ✅",
    )

    accounts = __import__("db.queries", fromlist=["get_accounts"]).get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"
    context.user_data["currency"] = currency

    await query.message.reply_text(
        f"💰 ¿Cuánto querés gastar por día? (en {currency}, solo el número)\n"
        f"<i>Ej: 5000</i>",
        parse_mode="HTML",
    )
    return BUDGET


# ── Paso 4: Presupuesto ───────────────────────────────────────────────────────

async def receive_budget(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        budget = float(update.message.text.replace(",", ".").replace("$", "").strip())
        if budget <= 0:
            raise ValueError
        context.user_data["daily_budget"] = budget
        return await _show_confirm(update.message, context)
    except ValueError:
        await update.message.reply_text("Enviá solo el número. Ej: 5000")
        return BUDGET


# ── Resumen y confirmación ────────────────────────────────────────────────────

async def _show_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    plan = context.user_data["plan"]
    budget = context.user_data["daily_budget"]
    currency = context.user_data.get("currency", "ARS")
    url = context.user_data["destination_url"]
    is_video = context.user_data.get("is_video", False)
    creative_type = "🎬 Video" if is_video else "🖼️ Imagen"

    campaign_name = f"Campaña {plan['objective'].capitalize()} — Bot {datetime.now().strftime('%d/%m %H:%M')}"
    context.user_data["campaign_name"] = campaign_name

    summary = (
        f"📋 <b>Resumen de la campaña</b>\n\n"
        f"📣 Nombre: <code>{campaign_name}</code>\n"
        f"🎯 Objetivo: {OBJECTIVE_LABELS.get(plan['objective'], plan['objective'])}\n"
        f"💰 Presupuesto diario: <b>${budget:,.0f} {currency}</b>\n"
        f"{creative_type}: recibido\n"
        f"🔗 URL: {url}\n\n"
        f"✏️ <b>Copy:</b>\n"
        f"<i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"👥 Público: {plan['audience_summary']}\n\n"
        f"⚠️ La campaña se crea en modo <b>PAUSED</b>. La activás vos cuando estés listo."
    )

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar y crear", callback_data="confirm_yes"),
        InlineKeyboardButton("❌ Cancelar", callback_data="confirm_no"),
    ]])
    await message.reply_text(summary, parse_mode="HTML", reply_markup=keyboard)
    return CONFIRM


# ── Paso 5: Crear en Meta ─────────────────────────────────────────────────────

async def confirm_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "confirm_no":
        await query.edit_message_text("❌ Campaña cancelada.")
        context.user_data.clear()
        return ConversationHandler.END

    await query.edit_message_text("⏳ Creando campaña en Meta Ads…")

    try:
        from meta.campaign_builder import build_campaign
        from db.queries import get_accounts

        accounts = get_accounts()
        if not accounts:
            await query.message.reply_text("❌ No hay ad accounts. Ejecutá /sync primero.")
            return ConversationHandler.END

        plan = context.user_data["plan"]
        spec = {
            "name": context.user_data["campaign_name"],
            "objective": plan["objective"],
            "daily_budget": context.user_data["daily_budget"],
            "targeting": plan["targeting"],
            "primary_text": plan["primary_text"],
            "headline": plan["headline"],
            "cta": plan.get("cta", "SHOP_NOW"),
            "destination_url": context.user_data["destination_url"],
            "creative_path": context.user_data["creative_path"],
            "account_id": accounts[0]["id"],
        }

        result = build_campaign(spec)

        await query.message.reply_text(
            f"✅ <b>¡Campaña creada!</b>\n\n"
            f"📣 {result['campaign_name']}\n"
            f"🆔 Campaign: <code>{result['campaign_id']}</code>\n"
            f"🆔 Ad Set: <code>{result['ad_set_id']}</code>\n"
            f"🆔 Ad: <code>{result['ad_id']}</code>\n\n"
            f"📌 Está en <b>PAUSED</b>. Activala desde Meta Ads Manager cuando quieras.",
            parse_mode="HTML",
        )

    except Exception as e:
        logger.error(f"Campaign creation error: {e}")
        await query.message.reply_text(f"❌ Error al crear la campaña:\n<code>{str(e)[:400]}</code>", parse_mode="HTML")

    finally:
        # Limpiar archivo temporal
        try:
            creative_path = context.user_data.get("creative_path")
            if creative_path:
                os.unlink(creative_path)
        except Exception:
            pass
        context.user_data.clear()

    return ConversationHandler.END


# ── Cancelar ──────────────────────────────────────────────────────────────────

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("❌ Cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


# ── Handler ───────────────────────────────────────────────────────────────────

_CREATIVE_FILTER = filters.PHOTO | filters.VIDEO | filters.Document.VIDEO | filters.Document.IMAGE


def get_create_campaign_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[
            CommandHandler("crear", start_campaign),
            MessageHandler(_CREATIVE_FILTER, receive_creative),
        ],
        states={
            CREATIVE: [MessageHandler(_CREATIVE_FILTER, receive_creative)],
            URL: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_url)],
            OBJECTIVE: [CallbackQueryHandler(receive_objective, pattern="^obj_")],
            BUDGET: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_budget)],
            CONFIRM: [CallbackQueryHandler(confirm_campaign, pattern="^confirm_")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
        allow_reentry=True,
    )
