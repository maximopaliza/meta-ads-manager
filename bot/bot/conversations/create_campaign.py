"""
Flujo de creación de campaña via Telegram:
  1. Recibe creativo (foto/video pequeño) O detecta archivo grande y pide link de Drive
  2. Pide URL de destino
  3. Gemini analiza → sugiere objetivo, copy y targeting
  4. Usuario confirma o cambia el objetivo
  5. Usuario ingresa presupuesto diario
  6. Resumen completo + botón Confirmar → crea en Meta (PAUSED)

Videos > 20MB: el bot los detecta y pide un link de Google Drive / Dropbox.
Meta descarga el video directo desde esa URL (no pasa por el bot).
"""
import logging
import os
import re
import tempfile
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import BadRequest
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

# Estados
CREATIVE, VIDEO_LINK, URL, OBJECTIVE, BUDGET, CONFIRM = range(6)

OBJECTIVE_LABELS = {
    "ventas": "🛍️ Ventas",
    "trafico": "🌐 Tráfico",
    "alcance": "📢 Alcance",
}

URL_RE = re.compile(r"https?://\S+")
VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
MAX_TELEGRAM_MB = 19  # margen de seguridad


def _gdrive_to_direct(url: str) -> str:
    """Convierte link de Google Drive a URL de descarga directa."""
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    return url


# ── Paso 0: Arrancar ──────────────────────────────────────────────────────────

async def start_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "🎨 <b>Nueva campaña</b>\n\n"
        "Enviame la imagen o video del creativo.\n"
        "<i>Videos pesados: mandá el archivo igual, te pido el link si es necesario.</i>",
        parse_mode="HTML",
    )
    return CREATIVE


# ── Paso 1: Recibir creativo ──────────────────────────────────────────────────

async def receive_creative(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.message

    # Detectar tipo y tamaño
    is_video = False
    file_size = 0
    tg_file = None
    suffix = ".jpg"

    if message.photo:
        tg_file = message.photo[-1]
        file_size = tg_file.file_size or 0
        suffix = ".jpg"
        is_video = False

    elif message.video:
        tg_file = message.video
        file_size = tg_file.file_size or 0
        suffix = ".mp4"
        is_video = True

    elif message.document and (
        message.document.mime_type in VIDEO_MIMES
        or (message.document.file_name or "").lower().endswith((".mp4", ".mov", ".avi", ".mkv"))
    ):
        tg_file = message.document
        file_size = tg_file.file_size or 0
        suffix = ".mp4"
        is_video = True

    elif message.document:
        # Imagen como documento
        tg_file = message.document
        file_size = tg_file.file_size or 0
        suffix = ".jpg"
        is_video = False

    else:
        await message.reply_text("Enviame una imagen o video (JPG, PNG, MP4, MOV).")
        return CREATIVE

    context.user_data["is_video"] = is_video

    # Archivo demasiado grande para Telegram Bot API
    if file_size > MAX_TELEGRAM_MB * 1024 * 1024:
        size_mb = file_size / (1024 * 1024)
        context.user_data["creative_path"] = None  # no hay archivo local
        await message.reply_text(
            f"📦 El video pesa <b>{size_mb:.0f} MB</b> — demasiado pesado para descargarlo por acá.\n\n"
            f"Subilo a <b>Google Drive</b> (compartido como \"cualquiera con el link\") "
            f"y enviame el link acá.",
            parse_mode="HTML",
        )
        return VIDEO_LINK

    # Archivo normal → descargar
    try:
        file = await tg_file.get_file()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        await file.download_to_drive(tmp.name)
        context.user_data["creative_path"] = tmp.name
        context.user_data["video_url"] = None
    except BadRequest as e:
        if "file is too big" in str(e).lower() or "too large" in str(e).lower():
            context.user_data["creative_path"] = None
            await message.reply_text(
                "📦 El archivo es demasiado pesado para descargarlo por acá.\n\n"
                "Subilo a <b>Google Drive</b> (\"cualquiera con el link\") y enviame el link.",
                parse_mode="HTML",
            )
            return VIDEO_LINK
        raise

    await message.reply_text(
        "✅ Creativo recibido.\n\n"
        "Enviame la <b>URL de destino</b> (la página a donde van los usuarios).",
        parse_mode="HTML",
    )
    return URL


# ── Paso 1b: Video grande → pedir link ────────────────────────────────────────

async def receive_video_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text(
            "No encontré una URL válida. Enviame el link de Google Drive o Dropbox."
        )
        return VIDEO_LINK

    raw_url = match.group()
    # Convertir Google Drive a descarga directa
    direct_url = _gdrive_to_direct(raw_url)
    context.user_data["video_url"] = direct_url

    await update.message.reply_text(
        "✅ Link recibido.\n\n"
        "Ahora enviame la <b>URL de destino</b> (la landing page del anuncio).",
        parse_mode="HTML",
    )
    return URL


# ── Paso 2: URL de destino → analizar con Gemini ─────────────────────────────

async def receive_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text(
            "No encontré una URL válida. Ej: <code>https://tutienda.com/producto</code>",
            parse_mode="HTML",
        )
        return URL

    url = match.group()
    context.user_data["destination_url"] = url

    msg = await update.message.reply_text("⏳ Analizando creativo con IA…")

    creative_path = context.user_data.get("creative_path")
    video_url = context.user_data.get("video_url")

    # Si tenemos el archivo local, Gemini lo analiza visualmente
    # Si es un link externo, Gemini analiza solo la URL de destino
    plan = analyze_for_campaign(creative_path or "", url)
    context.user_data["plan"] = plan

    obj_label = OBJECTIVE_LABELS.get(plan["objective"], "🛍️ Ventas")
    source_note = "" if creative_path else "\n<i>⚠️ El creativo es un video pesado — lo sube Meta directamente desde tu Drive.</i>"

    analysis_text = (
        f"📊 <b>Análisis</b>\n\n"
        f"{plan['analysis']}"
        f"{source_note}\n\n"
        f"✏️ <b>Copy sugerido</b>\n"
        f"<i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"👥 <b>Público:</b> {plan['audience_summary']}\n\n"
        f"🎯 <b>Objetivo sugerido:</b> {obj_label}\n\n"
        f"¿Cambiamos el objetivo?"
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


# ── Paso 3: Objetivo ──────────────────────────────────────────────────────────

async def receive_objective(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    objective = query.data.replace("obj_", "")
    context.user_data["plan"]["objective"] = objective

    await query.edit_message_text(f"Objetivo: {OBJECTIVE_LABELS.get(objective, objective)} ✅")

    accounts = __import__("db.queries", fromlist=["get_accounts"]).get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"
    context.user_data["currency"] = currency

    await query.message.reply_text(
        f"💰 ¿Cuánto querés gastar por día? (en {currency}, solo el número)\n<i>Ej: 5000</i>",
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


# ── Resumen ───────────────────────────────────────────────────────────────────

async def _show_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    plan = context.user_data["plan"]
    budget = context.user_data["daily_budget"]
    currency = context.user_data.get("currency", "ARS")
    url = context.user_data["destination_url"]
    is_video = context.user_data.get("is_video", False)
    has_local = bool(context.user_data.get("creative_path"))
    has_drive = bool(context.user_data.get("video_url"))

    creative_type = (
        "🎬 Video (archivo local)" if is_video and has_local
        else "🎬 Video (Google Drive)" if is_video and has_drive
        else "🖼️ Imagen"
    )

    campaign_name = f"Campaña {plan['objective'].capitalize()} — Bot {datetime.now().strftime('%d/%m %H:%M')}"
    context.user_data["campaign_name"] = campaign_name

    summary = (
        f"📋 <b>Resumen de la campaña</b>\n\n"
        f"📣 <code>{campaign_name}</code>\n"
        f"🎯 {OBJECTIVE_LABELS.get(plan['objective'], plan['objective'])}\n"
        f"💰 <b>${budget:,.0f} {currency}</b> / día\n"
        f"{creative_type}\n"
        f"🔗 {url}\n\n"
        f"✏️ <i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"👥 {plan['audience_summary']}\n\n"
        f"⚠️ Se crea en modo <b>PAUSED</b>. La activás vos."
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
            "creative_path": context.user_data.get("creative_path", ""),
            "video_url": context.user_data.get("video_url", ""),
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
        await query.message.reply_text(
            f"❌ Error al crear la campaña:\n<code>{str(e)[:400]}</code>",
            parse_mode="HTML",
        )

    finally:
        try:
            p = context.user_data.get("creative_path")
            if p:
                os.unlink(p)
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

_CREATIVE_FILTER = filters.PHOTO | filters.VIDEO | filters.Document.VIDEO | filters.Document.IMAGE | filters.Document.MimeType("application/octet-stream")


def get_create_campaign_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[
            CommandHandler("crear", start_campaign),
            MessageHandler(_CREATIVE_FILTER, receive_creative),
        ],
        states={
            CREATIVE:    [MessageHandler(_CREATIVE_FILTER, receive_creative)],
            VIDEO_LINK:  [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_video_link)],
            URL:         [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_url)],
            OBJECTIVE:   [CallbackQueryHandler(receive_objective, pattern="^obj_")],
            BUDGET:      [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_budget)],
            CONFIRM:     [CallbackQueryHandler(confirm_campaign, pattern="^confirm_")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
        allow_reentry=True,
    )
