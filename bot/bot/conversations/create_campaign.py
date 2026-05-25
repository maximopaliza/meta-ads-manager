"""
Flujo de creación de campaña via Telegram.

Con Drive configurado, flujo principal:
  /crear → subcarpetas (No subidos / En uso / Winners / Poco gasto / Malos)
         → lista de videos → URL → Gemini → objetivo → presupuesto → Confirmar
         → crea campaña en Meta (PAUSED) + mueve video a "En uso" en Drive

Sin Drive → menú: Biblioteca Meta | Subir nuevo
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
(CHOOSE_SOURCE, CHOOSE_CATEGORY, PICK_VIDEO, PICK_DRIVE_VIDEO,
 UPLOAD_CREATIVE, URL, OBJECTIVE, BUDGET, CONFIRM) = range(9)

OBJECTIVE_LABELS = {
    "ventas":  "Ventas",
    "trafico": "Trafico",
    "alcance": "Alcance",
}

URL_RE = re.compile(r"https?://\S+")
VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
MAX_TG_MB = 19

CATEGORY_LABELS = {
    "winners":    "Winners",
    "poco_gasto": "Poco gasto",
    "malos":      "Malos",
    "sin_datos":  "Sin historial",
}


def _fmt_dur(seconds) -> str:
    try:
        s = int(float(seconds))
        return f"{s//60}:{s%60:02d}"
    except Exception:
        return "?"


def _gdrive_to_direct(url: str) -> str:
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    return url


# ── Paso 0: Inicio ────────────────────────────────────────────────────────────

async def start_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()

    from meta.drive_client import is_configured as drive_ok
    drive_connected = drive_ok()

    if drive_connected:
        context.user_data["video_source"] = "src_drive"
        msg = await update.message.reply_text("Cargando carpetas de Drive...")
        try:
            from meta.drive_client import get_structure
            structure = get_structure()
            context.user_data["drive_structure"] = structure
        except Exception as e:
            logger.error(f"Error cargando Drive: {e}")
            try:
                await msg.edit_text(
                    f"Error al cargar Drive:\n<code>{str(e)[:300]}</code>",
                    parse_mode="HTML",
                )
            except Exception:
                await update.message.reply_text(f"Error al cargar Drive: {e}")
            return ConversationHandler.END

        try:
            await msg.delete()
        except Exception:
            pass
        return await _show_drive_folders(update.message, context)

    # Sin Drive → menú básico
    rows = [
        [InlineKeyboardButton("Biblioteca Meta", callback_data="src_library")],
        [InlineKeyboardButton("Subir nuevo", callback_data="src_upload")],
    ]
    await update.message.reply_text(
        "<b>Nueva campana</b>\n\nDe donde tomamos el creativo?",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return CHOOSE_SOURCE


# ── Drive: mostrar subcarpetas ────────────────────────────────────────────────

async def _show_drive_folders(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    from meta.drive_client import SUBFOLDER_NAMES, SUBFOLDER_EMOJIS
    structure = context.user_data.get("drive_structure", {})

    rows = []
    for name in SUBFOLDER_NAMES:
        info = structure.get(name, {})
        count = len(info.get("videos", []))
        emoji = SUBFOLDER_EMOJIS.get(name, "")
        rows.append([InlineKeyboardButton(
            f"{emoji} {name} ({count})",
            callback_data=f"drvf_{name}",
        )])

    await message.reply_text(
        "<b>Google Drive</b> — elegí la carpeta:",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return PICK_DRIVE_VIDEO


async def pick_drive_folder(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "back_drive_folders":
        return await _show_drive_folders(query.message, context)

    if query.data.startswith("drvf_"):
        folder_name = query.data.replace("drvf_", "")
        context.user_data["drive_folder_name"] = folder_name
        return await _show_drive_videos_in_folder(query.message, context, folder_name)

    if query.data.startswith("drv_"):
        # Video seleccionado
        file_id = query.data.replace("drv_", "")
        structure = context.user_data.get("drive_structure", {})
        folder_name = context.user_data.get("drive_folder_name", "")
        info = structure.get(folder_name, {})
        videos = info.get("videos", [])
        video = next((v for v in videos if v["id"] == file_id), {"id": file_id, "name": "Video"})

        name = video.get("name") or "Video"
        context.user_data["drive_file_id"] = file_id
        context.user_data["library_video_id"] = None
        context.user_data["library_video_title"] = name
        context.user_data["is_video"] = True
        context.user_data["creative_path"] = None

        from meta.drive_client import get_direct_url
        context.user_data["video_url"] = get_direct_url(file_id)

        await query.edit_message_text(f"<b>{name}</b> seleccionado.", parse_mode="HTML")
        await query.message.reply_text(
            "Enviame la <b>URL de destino</b> (landing page del anuncio).",
            parse_mode="HTML",
        )
        return URL

    return PICK_DRIVE_VIDEO


async def _show_drive_videos_in_folder(message, context: ContextTypes.DEFAULT_TYPE, folder_name: str) -> int:
    from meta.drive_client import SUBFOLDER_EMOJIS
    structure = context.user_data.get("drive_structure", {})
    info = structure.get(folder_name, {})
    videos = info.get("videos", [])
    emoji = SUBFOLDER_EMOJIS.get(folder_name, "")

    if not videos:
        await message.reply_text(
            f"{emoji} <b>{folder_name}</b> esta vacia.\n"
            f"Subi videos ahi en Google Drive y volvé a intentar.",
            parse_mode="HTML",
        )
        return await _show_drive_folders(message, context)

    rows = []
    for v in videos[:20]:
        name = (v.get("name") or "Sin nombre")[:36]
        size_mb = v.get("size", 0) / (1024 * 1024)
        label = f"{name} - {size_mb:.0f}MB" if size_mb > 0 else name
        rows.append([InlineKeyboardButton(label, callback_data=f"drv_{v['id']}")])

    rows.append([InlineKeyboardButton("Volver", callback_data="back_drive_folders")])

    await message.reply_text(
        f"{emoji} <b>{folder_name}</b> — elegí el video:",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return PICK_DRIVE_VIDEO


# ── Selección de fuente (sin Drive) ──────────────────────────────────────────

async def choose_source(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    src = query.data

    if src == "src_upload":
        await query.edit_message_text(
            "Enviame la imagen o video.\n"
            "<i>Videos pesados: manda el link de Google Drive.</i>",
            parse_mode="HTML",
        )
        return UPLOAD_CREATIVE

    await query.edit_message_text("Cargando videos de Meta...")
    context.user_data["video_source"] = src

    try:
        from meta.video_library import get_videos_with_performance
        categorized = get_videos_with_performance()
        context.user_data["categorized"] = categorized
    except Exception as e:
        await query.message.reply_text(f"Error: {e}")
        return ConversationHandler.END

    return await _show_categories(query.message, context)


async def _show_categories(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    categorized = context.user_data["categorized"]

    rows = []
    for key, label in CATEGORY_LABELS.items():
        vids = categorized.get(key, [])
        if vids:
            rows.append([InlineKeyboardButton(
                f"{label} ({len(vids)})", callback_data=f"cat_{key}"
            )])

    if not rows:
        await message.reply_text("No encontre videos en Meta.")
        return ConversationHandler.END

    total = sum(len(v) for v in categorized.values())
    await message.reply_text(
        f"<b>{total} videos en Meta</b>\n\nDe que categoria?",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return CHOOSE_CATEGORY


async def choose_category(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    cat = query.data.replace("cat_", "")
    context.user_data["selected_category"] = cat
    videos = context.user_data["categorized"].get(cat, [])

    if not videos:
        await query.edit_message_text("No hay videos en esa categoria.")
        return CHOOSE_CATEGORY

    label = CATEGORY_LABELS.get(cat, cat)
    rows = []
    for v in videos[:20]:
        name = (v.get("title") or v.get("name") or "Sin titulo")[:32]
        extra = ""
        roas = v.get("roas")
        spend = v.get("spend")
        dur = v.get("length")

        if roas:
            extra = f" - {roas:.1f}x"
        elif spend:
            extra = f" - ${spend:.0f}"
        if dur:
            extra += f" - {_fmt_dur(dur)}"

        rows.append([InlineKeyboardButton(
            f"{name}{extra}", callback_data=f"vid_{v['id']}"
        )])

    rows.append([InlineKeyboardButton("Volver", callback_data="back_categories")])

    await query.edit_message_text(
        f"{label} — elegí el creativo:",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return PICK_VIDEO


async def back_categories(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    return await _show_categories(query.message, context)


async def pick_video(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    video_id = query.data.replace("vid_", "")
    cat = context.user_data.get("selected_category", "sin_datos")
    videos = context.user_data["categorized"].get(cat, [])
    video = next((v for v in videos if v["id"] == video_id), {"id": video_id})

    title = video.get("title") or video.get("name") or "Sin titulo"

    context.user_data["library_video_id"] = video_id
    context.user_data["drive_file_id"] = None
    context.user_data["library_video_title"] = title
    context.user_data["is_video"] = True
    context.user_data["creative_path"] = None
    context.user_data["video_url"] = None

    await query.edit_message_text(f"<b>{title}</b> seleccionado.", parse_mode="HTML")
    await query.message.reply_text(
        "Enviame la <b>URL de destino</b> (landing page del anuncio).",
        parse_mode="HTML",
    )
    return URL


# ── Subir nuevo ───────────────────────────────────────────────────────────────

async def upload_creative(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.message

    if message.text:
        match = URL_RE.search(message.text)
        if match:
            raw = match.group()
            context.user_data["video_url"] = _gdrive_to_direct(raw)
            context.user_data["creative_path"] = None
            context.user_data["library_video_id"] = None
            context.user_data["is_video"] = True
            await message.reply_text(
                "Link recibido.\n\nEnviame la <b>URL de destino</b>.",
                parse_mode="HTML",
            )
            return URL
        await message.reply_text("Enviame el archivo o link de Google Drive.")
        return UPLOAD_CREATIVE

    is_video = False
    file_size = 0
    tg_file = None
    suffix = ".jpg"

    if message.photo:
        tg_file = message.photo[-1]
        file_size = tg_file.file_size or 0
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
        await message.reply_text("Enviame una imagen, video o link de Google Drive.")
        return UPLOAD_CREATIVE

    context.user_data["is_video"] = is_video

    if file_size > MAX_TG_MB * 1024 * 1024:
        size_mb = file_size / (1024 * 1024)
        await message.reply_text(
            f"El archivo pesa <b>{size_mb:.0f} MB</b>.\n\n"
            f"Subilo a <b>Google Drive</b> (compartido como 'cualquiera con el link') "
            f"y pega el link aca.",
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
                "Archivo muy pesado. Subilo a Google Drive y pega el link.",
            )
            return UPLOAD_CREATIVE
        raise

    await message.reply_text(
        "Creativo recibido.\n\nEnviame la <b>URL de destino</b>.",
        parse_mode="HTML",
    )
    return URL


# ── URL de destino ────────────────────────────────────────────────────────────

async def receive_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text(
            "URL invalida. Ej: <code>https://tutienda.com/producto</code>",
            parse_mode="HTML",
        )
        return URL

    url = match.group()
    context.user_data["destination_url"] = url
    msg = await update.message.reply_text("Analizando con IA...")

    creative_path = context.user_data.get("creative_path")
    plan = analyze_for_campaign(creative_path or "", url)
    context.user_data["plan"] = plan

    obj_label = OBJECTIVE_LABELS.get(plan["objective"], "Ventas")
    lib_title = context.user_data.get("library_video_title", "")
    source_note = f"\n<b>{lib_title}</b>" if lib_title else ""
    angle = plan.get("angle", "")
    angle_note = f"\nAngulo detectado: <code>{angle}</code>" if angle else ""

    text_out = (
        f"<b>Analisis</b>{source_note}{angle_note}\n\n"
        f"{plan['analysis']}\n\n"
        f"<b>Copy sugerido</b>\n"
        f"<i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"{plan['audience_summary']}\n\n"
        f"Objetivo: <b>{obj_label}</b>\n\nCambias el objetivo?"
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("Ventas", callback_data="obj_ventas"),
        InlineKeyboardButton("Trafico", callback_data="obj_trafico"),
        InlineKeyboardButton("Alcance", callback_data="obj_alcance"),
    ], [
        InlineKeyboardButton(f"Mantener ({obj_label})", callback_data=f"obj_{plan['objective']}"),
    ]])

    try:
        await msg.delete()
    except Exception:
        pass
    await update.message.reply_text(text_out, parse_mode="HTML", reply_markup=keyboard)
    return OBJECTIVE


# ── Objetivo ──────────────────────────────────────────────────────────────────

async def receive_objective(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    objective = query.data.replace("obj_", "")
    context.user_data["plan"]["objective"] = objective
    await query.edit_message_text(f"Objetivo: {OBJECTIVE_LABELS.get(objective, objective)}")

    accounts = __import__("db.queries", fromlist=["get_accounts"]).get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"
    context.user_data["currency"] = currency

    await query.message.reply_text(
        f"Cuanto por dia? (en {currency})\n<i>Ej: 5000</i>",
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
        await update.message.reply_text("Solo el numero. Ej: 5000")
        return BUDGET


# ── Resumen ───────────────────────────────────────────────────────────────────

async def _show_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    plan = context.user_data["plan"]
    budget = context.user_data["daily_budget"]
    currency = context.user_data.get("currency", "ARS")
    url = context.user_data["destination_url"]
    lib_title = context.user_data.get("library_video_title", "")

    if lib_title:
        creative_line = f"Video: {lib_title}"
    elif context.user_data.get("video_url"):
        creative_line = "Video (Drive)"
    elif context.user_data.get("is_video"):
        creative_line = "Video (subido)"
    else:
        creative_line = "Imagen"

    campaign_name = f"Campana {plan['objective'].capitalize()} Bot {datetime.now().strftime('%d/%m %H:%M')}"
    context.user_data["campaign_name"] = campaign_name

    summary = (
        f"<b>Resumen</b>\n\n"
        f"<code>{campaign_name}</code>\n"
        f"Objetivo: {OBJECTIVE_LABELS.get(plan['objective'], plan['objective'])}\n"
        f"Presupuesto: <b>${budget:,.0f} {currency}</b> / dia\n"
        f"{creative_line}\n"
        f"URL: {url}\n\n"
        f"<i>{plan['primary_text']}</i>\n"
        f"<b>{plan['headline']}</b>\n\n"
        f"{plan['audience_summary']}\n\n"
        f"Se crea en modo <b>PAUSED</b>."
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("Confirmar y crear", callback_data="confirm_yes"),
        InlineKeyboardButton("Cancelar", callback_data="confirm_no"),
    ]])
    await message.reply_text(summary, parse_mode="HTML", reply_markup=keyboard)
    return CONFIRM


# ── Crear en Meta ─────────────────────────────────────────────────────────────

async def confirm_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "confirm_no":
        await query.edit_message_text("Cancelado.")
        context.user_data.clear()
        return ConversationHandler.END

    await query.edit_message_text("Creando campana en Meta Ads...")

    try:
        from meta.campaign_builder import build_campaign
        from db.queries import get_accounts

        accounts = get_accounts()
        if not accounts:
            await query.message.reply_text("No hay ad accounts. Ejecuta /sync.")
            return ConversationHandler.END

        plan = context.user_data["plan"]
        spec = {
            "name":             context.user_data["campaign_name"],
            "objective":        plan["objective"],
            "daily_budget":     context.user_data["daily_budget"],
            "targeting":        plan["targeting"],
            "primary_text":     plan["primary_text"],
            "headline":         plan["headline"],
            "cta":              plan.get("cta", "SHOP_NOW"),
            "destination_url":  context.user_data["destination_url"],
            "creative_path":    context.user_data.get("creative_path") or "",
            "video_url":        context.user_data.get("video_url") or "",
            "library_video_id": context.user_data.get("library_video_id") or "",
            "account_id":       accounts[0]["id"],
        }

        result = build_campaign(spec)

        # Si el video viene de Drive, moverlo a "En uso"
        drive_file_id = context.user_data.get("drive_file_id")
        if drive_file_id:
            from meta.drive_client import move_to_subfolder
            moved = move_to_subfolder(drive_file_id, "En uso")
            move_note = "\nVideo movido a <b>En uso</b> en Drive." if moved else ""
        else:
            move_note = ""

        await query.message.reply_text(
            f"<b>Campana creada!</b>\n\n"
            f"{result['campaign_name']}\n"
            f"Campaign ID: <code>{result['campaign_id']}</code>\n"
            f"Ad ID: <code>{result['ad_id']}</code>\n\n"
            f"Esta en <b>PAUSED</b>. Activala cuando quieras.{move_note}",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.error(f"Campaign creation error: {e}")
        await query.message.reply_text(
            f"Error:\n<code>{str(e)[:400]}</code>", parse_mode="HTML"
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
    await update.message.reply_text("Cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


# ── Handler ───────────────────────────────────────────────────────────────────

_FILE_FILTER = filters.PHOTO | filters.VIDEO | filters.Document.ALL


def get_create_campaign_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("crear", start_campaign)],
        states={
            CHOOSE_SOURCE:    [CallbackQueryHandler(choose_source, pattern="^src_")],
            CHOOSE_CATEGORY:  [
                CallbackQueryHandler(choose_category, pattern="^cat_"),
                CallbackQueryHandler(back_categories, pattern="^back_categories"),
            ],
            PICK_VIDEO:       [
                CallbackQueryHandler(pick_video, pattern="^vid_"),
                CallbackQueryHandler(back_categories, pattern="^back_categories"),
            ],
            PICK_DRIVE_VIDEO: [
                CallbackQueryHandler(pick_drive_folder, pattern="^(drvf_|drv_|back_drive_folders)"),
            ],
            UPLOAD_CREATIVE:  [
                MessageHandler(_FILE_FILTER | (filters.TEXT & ~filters.COMMAND), upload_creative)
            ],
            URL:       [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_url)],
            OBJECTIVE: [CallbackQueryHandler(receive_objective, pattern="^obj_")],
            BUDGET:    [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_budget)],
            CONFIRM:   [CallbackQueryHandler(confirm_campaign, pattern="^confirm_")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
        allow_reentry=True,
    )
