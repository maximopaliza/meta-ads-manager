"""
Flujo de creación de campaña via Telegram.

Opciones de creativo:
  A) Elegir de la biblioteca de Meta (videos ya subidos) ← flujo principal
  B) Subir imagen pequeña por Telegram
  C) Video pesado via Google Drive

Pasos comunes:
  → URL de destino
  → Gemini analiza y sugiere objetivo + copy + targeting
  → Usuario confirma objetivo
  → Presupuesto diario
  → Resumen + Confirmar → crea en Meta (PAUSED)
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
CHOOSE_SOURCE, PICK_VIDEO, VIDEO_LINK, UPLOAD_CREATIVE, URL, OBJECTIVE, BUDGET, CONFIRM = range(8)

OBJECTIVE_LABELS = {
    "ventas": "🛍️ Ventas",
    "trafico": "🌐 Tráfico",
    "alcance": "📢 Alcance",
}

URL_RE = re.compile(r"https?://\S+")
VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
MAX_TG_MB = 19


def _gdrive_to_direct(url: str) -> str:
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    return url


def _fmt_duration(seconds) -> str:
    try:
        s = int(float(seconds))
        return f"{s//60}:{s%60:02d}"
    except Exception:
        return "?"


# ── Arrancar ──────────────────────────────────────────────────────────────────

async def start_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("📚 Elegir de mi biblioteca Meta", callback_data="src_library"),
        InlineKeyboardButton("📎 Subir imagen/video", callback_data="src_upload"),
    ]])
    await update.message.reply_text(
        "🎨 <b>Nueva campaña</b>\n\n¿Cómo agregás el creativo?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return CHOOSE_SOURCE


# ── Opción A: Biblioteca Meta ─────────────────────────────────────────────────

async def choose_source(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "src_upload":
        await query.edit_message_text(
            "📎 Enviame la imagen o video.\n"
            "<i>Videos &gt;19MB: mandá el link de Google Drive.</i>",
            parse_mode="HTML",
        )
        return UPLOAD_CREATIVE

    # Biblioteca Meta
    await query.edit_message_text("⏳ Cargando tus videos de Meta…")
    try:
        from meta.campaign_builder import get_library_videos
        videos = get_library_videos(15)
    except Exception as e:
        await query.message.reply_text(f"❌ No pude cargar la biblioteca: {e}")
        return ConversationHandler.END

    if not videos:
        await query.message.reply_text(
            "No encontré videos en tu biblioteca de Meta.\n"
            "Usá 📎 Subir imagen/video."
        )
        return ConversationHandler.END

    context.user_data["library_videos"] = {v["id"]: v for v in videos}

    # Mostrar lista como botones inline (máx 15, Telegram permite hasta ~100 botones)
    rows = []
    for v in videos:
        dur = _fmt_duration(v.get("length", 0))
        title = (v.get("title") or "Sin título")[:35]
        label = f"🎬 {title} ({dur})"
        rows.append([InlineKeyboardButton(label, callback_data=f"vid_{v['id']}")])

    await query.message.reply_text(
        "📚 <b>Tus videos en Meta</b>\n\nElegí el creativo:",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return PICK_VIDEO


async def pick_video(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    video_id = query.data.replace("vid_", "")
    videos = context.user_data.get("library_videos", {})
    video = videos.get(video_id, {})
    title = video.get("title") or "Sin título"

    context.user_data["library_video_id"] = video_id
    context.user_data["library_video_title"] = title
    context.user_data["is_video"] = True
    context.user_data["creative_path"] = None
    context.user_data["video_url"] = None

    await query.edit_message_text(f"✅ Video seleccionado: <b>{title}</b>", parse_mode="HTML")
    await query.message.reply_text(
        "🔗 Enviame la <b>URL de destino</b> (la landing page del anuncio).",
        parse_mode="HTML",
    )
    return URL


# ── Opción B/C: Subir archivo ─────────────────────────────────────────────────

async def upload_creative(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.message

    # Texto con URL de Drive
    if message.text:
        match = URL_RE.search(message.text)
        if match:
            raw = match.group()
            context.user_data["video_url"] = _gdrive_to_direct(raw)
            context.user_data["creative_path"] = None
            context.user_data["is_video"] = True
            await message.reply_text(
                "✅ Link recibido.\n\n🔗 Enviame la <b>URL de destino</b>.",
                parse_mode="HTML",
            )
            return URL
        await message.reply_text("Enviame el archivo o el link de Google Drive.")
        return UPLOAD_CREATIVE

    # Archivo
    is_video = False
    file_size = 0
    tg_file = None
    suffix = ".jpg"

    if message.photo:
        tg_file = message.photo[-1]
        file_size = tg_file.file_size or 0
        suffix = ".jpg"
    elif message.video:
        tg_file = message.video
        file_size = tg_file.file_size or 0
        suffix = ".mp4"
        is_video = True
    elif message.document:
        tg_file = message.document
        file_size = tg_file.file_size or 0
        fn = (tg_file.file_name or "").lower()
        if tg_file.mime_type in VIDEO_MIMES or fn.endswith((".mp4", ".mov", ".avi", ".mkv")):
            suffix = ".mp4"
            is_video = True
        else:
            suffix = ".jpg"
    else:
        await message.reply_text("Enviame una imagen, video o link de Google Drive.")
        return UPLOAD_CREATIVE

    context.user_data["is_video"] = is_video

    if file_size > MAX_TG_MB * 1024 * 1024:
        size_mb = file_size / (1024 * 1024)
        await message.reply_text(
            f"📦 El video pesa <b>{size_mb:.0f} MB</b>.\n\n"
            f"Subilo a <b>Google Drive</b> (compartido como \"cualquiera con el link\") "
            f"y enviame el link acá.",
            parse_mode="HTML",
        )
        return UPLOAD_CREATIVE

    try:
        file = await tg_file.get_file()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        await file.download_to_drive(tmp.name)
        context.user_data["creative_path"] = tmp.name
        context.user_data["video_url"] = None
        context.user_data["library_video_id"] = None
    except BadRequest as e:
        if "too big" in str(e).lower() or "too large" in str(e).lower():
            await message.reply_text(
                "📦 Archivo muy pesado.\n"
                "Subilo a <b>Google Drive</b> y enviame el link.",
                parse_mode="HTML",
            )
            return UPLOAD_CREATIVE
        raise

    await message.reply_text(
        "✅ Creativo recibido.\n\n🔗 Enviame la <b>URL de destino</b>.",
        parse_mode="HTML",
    )
    return URL


# ── URL de destino → Gemini ───────────────────────────────────────────────────

async def receive_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text(
            "No encontré una URL válida.\nEj: <code>https://tutienda.com/producto</code>",
            parse_mode="HTML",
        )
        return URL

    url = match.group()
    context.user_data["destination_url"] = url

    msg = await update.message.reply_text("⏳ Analizando con IA…")

    creative_path = context.user_data.get("creative_path")
    plan = analyze_for_campaign(creative_path or "", url)
    context.user_data["plan"] = plan

    obj_label = OBJECTIVE_LABELS.get(plan["objective"], "🛍️ Ventas")

    # Nota sobre la fuente del creativo
    lib_title = context.user_data.get("library_video_title")
    if lib_title:
        source_note = f"\n🎬 Creativo: <b>{lib_title}</b> (de tu biblioteca Meta)"
    elif context.user_data.get("video_url"):
        source_note = "\n🎬 Video: desde Google Drive"
    else:
        source_note = ""

    analysis_text = (
        f"📊 <b>Análisis</b>{source_note}\n\n"
        f"{plan['analysis']}\n\n"
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


# ── Objetivo ──────────────────────────────────────────────────────────────────

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
        f"💰 ¿Cuánto querés gastar por día? (en {currency})\n<i>Ej: 5000</i>",
        parse_mode="HTML",
    )
    return BUDGET


# ── Presupuesto ───────────────────────────────────────────────────────────────

async def receive_budget(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        budget = float(update.message.text.replace(",", ".").replace("$", "").strip())
        if budget <= 0:
            raise ValueError
        context.user_data["daily_budget"] = budget
        return await _show_confirm(update.message, context)
    except ValueError:
        await update.message.reply_text("Solo el número. Ej: 5000")
        return BUDGET


# ── Resumen ───────────────────────────────────────────────────────────────────

async def _show_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    plan = context.user_data["plan"]
    budget = context.user_data["daily_budget"]
    currency = context.user_data.get("currency", "ARS")
    url = context.user_data["destination_url"]

    lib_title = context.user_data.get("library_video_title")
    if lib_title:
        creative_line = f"🎬 {lib_title} (biblioteca Meta)"
    elif context.user_data.get("video_url"):
        creative_line = "🎬 Video (Google Drive)"
    elif context.user_data.get("is_video"):
        creative_line = "🎬 Video (subido)"
    else:
        creative_line = "🖼️ Imagen"

    campaign_name = f"Campaña {plan['objective'].capitalize()} — Bot {datetime.now().strftime('%d/%m %H:%M')}"
    context.user_data["campaign_name"] = campaign_name

    summary = (
        f"📋 <b>Resumen</b>\n\n"
        f"📣 <code>{campaign_name}</code>\n"
        f"🎯 {OBJECTIVE_LABELS.get(plan['objective'], plan['objective'])}\n"
        f"💰 <b>${budget:,.0f} {currency}</b> / día\n"
        f"{creative_line}\n"
        f"🔗 {url}\n\n"
        f"✏️ <i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"👥 {plan['audience_summary']}\n\n"
        f"⚠️ Se crea en modo <b>PAUSED</b>."
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar y crear", callback_data="confirm_yes"),
        InlineKeyboardButton("❌ Cancelar", callback_data="confirm_no"),
    ]])
    await message.reply_text(summary, parse_mode="HTML", reply_markup=keyboard)
    return CONFIRM


# ── Crear en Meta ─────────────────────────────────────────────────────────────

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
            await query.message.reply_text("❌ No hay ad accounts. Ejecutá /sync.")
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
            "creative_path": context.user_data.get("creative_path") or "",
            "video_url": context.user_data.get("video_url") or "",
            "library_video_id": context.user_data.get("library_video_id") or "",
            "account_id": accounts[0]["id"],
        }

        result = build_campaign(spec)

        await query.message.reply_text(
            f"✅ <b>¡Campaña creada!</b>\n\n"
            f"📣 {result['campaign_name']}\n"
            f"🆔 Campaign: <code>{result['campaign_id']}</code>\n"
            f"🆔 Ad Set: <code>{result['ad_set_id']}</code>\n"
            f"🆔 Ad: <code>{result['ad_id']}</code>\n\n"
            f"📌 Está en <b>PAUSED</b>. Activala desde Meta cuando quieras.",
            parse_mode="HTML",
        )

    except Exception as e:
        logger.error(f"Campaign creation error: {e}")
        await query.message.reply_text(
            f"❌ Error:\n<code>{str(e)[:400]}</code>", parse_mode="HTML"
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

_FILE_FILTER = filters.PHOTO | filters.VIDEO | filters.Document.ALL


def get_create_campaign_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("crear", start_campaign)],
        states={
            CHOOSE_SOURCE:   [CallbackQueryHandler(choose_source, pattern="^src_")],
            PICK_VIDEO:      [CallbackQueryHandler(pick_video, pattern="^vid_")],
            UPLOAD_CREATIVE: [
                MessageHandler(_FILE_FILTER | (filters.TEXT & ~filters.COMMAND), upload_creative)
            ],
            URL:      [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_url)],
            OBJECTIVE:[CallbackQueryHandler(receive_objective, pattern="^obj_")],
            BUDGET:   [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_budget)],
            CONFIRM:  [CallbackQueryHandler(confirm_campaign, pattern="^confirm_")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
        allow_reentry=True,
    )
