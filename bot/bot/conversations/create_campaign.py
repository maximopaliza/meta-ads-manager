"""
create_campaign.py — Flujo de creación de campañas.

Flujo principal (Drive configurado):
  /crear → lista videos en "No subidos"
         → usuario elige todos o cuáles
         → bot analiza cada video con Gemini (ángulo + copy)
         → agrupa por ángulo, propone estructura CBO
         → por cada grupo: pide URL de destino → genera copy final → pide presupuesto
         → confirmación global → crea todas las campañas → mueve videos a "Nuevos subidos"

Flujo fallback (sin Drive):
  /crear → Biblioteca Meta | Subir nuevo (flujo original)
"""
import logging
import os
import re
import asyncio
import tempfile
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import BadRequest
from telegram.ext import (
    ContextTypes, ConversationHandler, CommandHandler,
    MessageHandler, CallbackQueryHandler, filters,
)

logger = logging.getLogger(__name__)

# ── Estados flujo Drive (multi-ads) ──────────────────────────────────────────
(DRIVE_SELECT_MODE, DRIVE_PICK_SPECIFIC, DRIVE_REVIEW_GROUPS,
 DRIVE_GROUP_URL, DRIVE_GROUP_BUDGET, DRIVE_CONFIRM_ALL,
 DRIVE_PICK_ANGLE) = range(10, 17)

# ── Estados flujo fallback (single ad) ───────────────────────────────────────
(CHOOSE_SOURCE, CHOOSE_CATEGORY, PICK_VIDEO, PICK_DRIVE_VIDEO,
 UPLOAD_CREATIVE, URL, OBJECTIVE, BUDGET, CONFIRM) = range(9)

OBJECTIVE_LABELS = {"ventas": "Ventas", "trafico": "Tráfico", "alcance": "Alcance"}
URL_RE = re.compile(r"https?://\S+")
VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
MAX_TG_MB = 19


def _fmt_dur(seconds) -> str:
    try:
        s = int(float(seconds))
        return f"{s//60}:{s%60:02d}"
    except Exception:
        return "?"


# ── Entrada ───────────────────────────────────────────────────────────────────

async def start_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()

    from meta.drive_client import is_configured as drive_ok
    if not drive_ok():
        return await _start_fallback(update, context)

    msg = await update.message.reply_text("⏳ Cargando videos de <b>No subidos</b>...", parse_mode="HTML")
    try:
        from meta.drive_client import get_structure
        structure = get_structure()
        videos = structure.get("No subidos", {}).get("videos", [])
    except Exception as e:
        await msg.edit_text(f"❌ Error al conectar con Drive:\n<code>{str(e)[:200]}</code>", parse_mode="HTML")
        return ConversationHandler.END

    try:
        await msg.delete()
    except Exception:
        pass

    if not videos:
        await update.message.reply_text(
            "📂 No hay videos en la carpeta <b>No subidos</b> de Drive.\n\n"
            "Subí los videos ahí y volvé a escribir /crear.",
            parse_mode="HTML",
        )
        return ConversationHandler.END

    context.user_data["no_subidos"] = videos
    return await _show_video_selection(update.message, context, videos)


MAX_VIDEOS_PER_BATCH = 10


async def _show_video_selection(message, context: ContextTypes.DEFAULT_TYPE, videos: list) -> int:
    lines = ["📂 <b>No subidos</b> — elegí qué analizar:\n"]
    for i, v in enumerate(videos[:20], 1):
        name = (v.get("name") or "Sin nombre")[:45]
        mb = v.get("size", 0) / (1024 * 1024)
        lines.append(f"<code>{i:2d}.</code> {name} <i>({mb:.0f}MB)</i>")

    if len(videos) > MAX_VIDEOS_PER_BATCH:
        lines.append(f"\n⚠️ <i>Hay {len(videos)} videos. Se analizan hasta {MAX_VIDEOS_PER_BATCH} por vez. Elegí cuáles o seleccioná todos (toma los primeros {MAX_VIDEOS_PER_BATCH}).</i>")

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(f"🎯 Primeros {min(len(videos), MAX_VIDEOS_PER_BATCH)}", callback_data="drv_all")],
        [InlineKeyboardButton("🔢 Elegir cuáles", callback_data="drv_pick")],
        [InlineKeyboardButton("❌ Cancelar", callback_data="drv_cancel")],
    ])
    await message.reply_text("\n".join(lines), parse_mode="HTML", reply_markup=keyboard)
    return DRIVE_SELECT_MODE


async def drive_select_mode(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "drv_cancel":
        await query.edit_message_text("Cancelado.")
        return ConversationHandler.END

    videos = context.user_data["no_subidos"]

    if query.data == "drv_all":
        selected = videos[:MAX_VIDEOS_PER_BATCH]
        context.user_data["selected_videos"] = selected
        await query.edit_message_text(f"✅ Analizando {len(selected)} video(s)...")
        return await _run_analysis(query.message, context)

    # drv_pick
    await query.edit_message_text(
        "Escribí los números separados por coma.\n"
        "Ej: <code>1,3,5</code> o <code>todos</code>",
        parse_mode="HTML",
    )
    return DRIVE_PICK_SPECIFIC


async def drive_pick_specific(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip().lower()
    videos = context.user_data["no_subidos"]

    if text in ("todos", "all"):
        selected = videos
    else:
        try:
            indices = [int(x.strip()) - 1 for x in text.split(",")]
            selected = [videos[i] for i in indices if 0 <= i < len(videos)]
        except (ValueError, IndexError):
            await update.message.reply_text("No entendí. Escribí números separados por coma. Ej: 1,3,5")
            return DRIVE_PICK_SPECIFIC

    if not selected:
        await update.message.reply_text("Ningún video válido. Intentá de nuevo.")
        return DRIVE_PICK_SPECIFIC

    if len(selected) > MAX_VIDEOS_PER_BATCH:
        selected = selected[:MAX_VIDEOS_PER_BATCH]
        await update.message.reply_text(f"⚠️ Máximo {MAX_VIDEOS_PER_BATCH} videos por vez. Tomando los primeros {MAX_VIDEOS_PER_BATCH}.")

    context.user_data["selected_videos"] = selected
    msg = await update.message.reply_text(f"⏳ Analizando {len(selected)} video(s)...")
    return await _run_analysis(msg, context)


# ── Análisis y agrupación ─────────────────────────────────────────────────────

ANGLE_CHOICES = [
    ("fatiga_pantallas", "😩 Fatiga / pantallas"),
    ("ojo_seco", "💧 Ojo seco"),
    ("cataratas", "👁️ Cataratas"),
    ("glaucoma", "🔵 Glaucoma"),
    ("retinopatia_diabetica", "🩸 Retinopatía diabética"),
    ("vision_nocturna", "🌙 Visión nocturna"),
    ("ojos_rojos", "🔴 Ojos rojos"),
    ("degeneracion_macular", "🔬 Degeneración macular"),
    ("pterigion", "🌱 Pterigión"),
    ("antecedentes_familiares", "👨‍👩‍👧 Antecedentes familiares"),
    ("deterioro_por_edad", "⏳ Deterioro por edad"),
    ("spray_vs_oral", "💊 Spray vs oral"),
    ("estudio_areds2", "📊 Estudio AREDS2"),
    ("antes_de_operar", "🔪 Antes de operar"),
    ("posicionamiento_marca", "🏆 Marca"),
]


async def _run_analysis(progress_msg, context: ContextTypes.DEFAULT_TYPE) -> int:
    videos = context.user_data["selected_videos"]
    loop = asyncio.get_event_loop()
    analyses = []
    uncached = []

    # 1. Revisar cuáles tienen cache
    try:
        await progress_msg.edit_text("⏳ Revisando cache de análisis...", parse_mode="HTML")
    except Exception:
        pass

    for v in videos:
        file_id = v["id"]
        name = v.get("name", "video.mp4")
        try:
            from ai.video_analyzer import get_cached_analysis
            cached = get_cached_analysis(file_id)
            if cached and cached.get("angle") not in ("sin_datos", "fatiga_pantallas", "", None):
                analyses.append({**cached, "drive_file_id": file_id, "file_name": name})
                logger.info(f"Cache hit: {name} → {cached.get('angle')}")
            else:
                uncached.append(v)
        except Exception:
            uncached.append(v)

    # 2. Si hay videos sin cache, preguntar ángulo manualmente
    if uncached:
        context.user_data["analyses_so_far"] = analyses
        context.user_data["uncached_queue"] = uncached
        context.user_data["uncached_idx"] = 0
        try:
            await progress_msg.delete()
        except Exception:
            pass
        return await _ask_angle_for_next(progress_msg, context)

    # 3. Todo cacheado → seguir directo
    context.user_data["analyses"] = analyses
    groups = _group_by_angle(analyses)
    context.user_data["groups"] = groups
    try:
        await progress_msg.delete()
    except Exception:
        pass
    return await _show_groups(progress_msg, context, groups)


async def _ask_angle_for_next(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    queue = context.user_data["uncached_queue"]
    idx = context.user_data["uncached_idx"]
    v = queue[idx]
    name = v.get("name", "video.mp4")
    total = len(queue)

    rows = []
    for i in range(0, len(ANGLE_CHOICES), 2):
        row = [InlineKeyboardButton(ANGLE_CHOICES[i][1], callback_data=f"ang_{ANGLE_CHOICES[i][0]}")]
        if i + 1 < len(ANGLE_CHOICES):
            row.append(InlineKeyboardButton(ANGLE_CHOICES[i+1][1], callback_data=f"ang_{ANGLE_CHOICES[i+1][0]}"))
        rows.append(row)

    await message.reply_text(
        f"🎬 <b>{idx+1}/{total}</b>: <code>{name[:50]}</code>\n\n¿Qué ángulo usa este video?",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return DRIVE_PICK_ANGLE


async def drive_pick_angle(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    angle = query.data.replace("ang_", "")
    queue = context.user_data["uncached_queue"]
    idx = context.user_data["uncached_idx"]
    v = queue[idx]
    name = v.get("name", "video.mp4")

    # Generar copy básico con Gemini para este ángulo
    loop = asyncio.get_event_loop()
    try:
        from ai.analyst import generate_copy
        copy_result = await asyncio.wait_for(
            loop.run_in_executor(None, generate_copy, "ventas", f"Video de Vision Complete — ángulo: {angle}"),
            timeout=30,
        )
    except Exception:
        copy_result = {"primary_text": "", "headline": "", "cta": "SHOP_NOW"}

    angle_label = next((lbl for key, lbl in ANGLE_CHOICES if key == angle), angle)
    await query.edit_message_text(
        f"✅ <b>{name[:40]}</b> → {angle_label}",
        parse_mode="HTML",
    )

    context.user_data["analyses_so_far"].append({
        "drive_file_id": v["id"],
        "file_name": name,
        "angle": angle,
        "analysis": f"Ángulo seleccionado manualmente: {angle}",
        "primary_text": copy_result.get("primary_text", ""),
        "headline": copy_result.get("headline", ""),
        "cta": copy_result.get("cta", "SHOP_NOW"),
        "audience_summary": "",
        "targeting": {"geo_locations": {"countries": ["AR"]}, "age_min": 35, "age_max": 65},
    })

    next_idx = idx + 1
    context.user_data["uncached_idx"] = next_idx

    if next_idx < len(queue):
        return await _ask_angle_for_next(query.message, context)

    # Todos los ángulos asignados → continuar
    all_analyses = context.user_data["analyses_so_far"]
    context.user_data["analyses"] = all_analyses
    groups = _group_by_angle(all_analyses)
    context.user_data["groups"] = groups
    return await _show_groups(query.message, context, groups)


def _group_by_angle(analyses: list[dict]) -> list[dict]:
    """Agrupa videos por ángulo detectado."""
    angle_map: dict[str, list] = {}
    for a in analyses:
        angle = a.get("angle") or "sin_datos"
        angle_map.setdefault(angle, []).append(a)

    groups = []
    for angle, items in angle_map.items():
        n = len(items)
        groups.append({
            "angle": angle,
            "videos": items,
            "structure": f"1-1-{n}",
        })
    return groups


async def _show_groups(message, context: ContextTypes.DEFAULT_TYPE, groups: list) -> int:
    lines = ["🎯 <b>Grupos detectados</b> (por ángulo):\n"]
    for i, g in enumerate(groups, 1):
        n = len(g["videos"])
        names = ", ".join(v["file_name"][:25] for v in g["videos"])
        lines.append(
            f"<b>{i}. {g['angle']}</b> — {n} video(s)\n"
            f"   <i>{names}</i>\n"
            f"   Estructura: CBO {g['structure']}\n"
        )

    lines.append("¿Confirmás esta estructura?")
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Confirmar grupos", callback_data="groups_ok")],
        [InlineKeyboardButton("❌ Cancelar todo", callback_data="groups_cancel")],
    ])
    await message.reply_text("\n".join(lines), parse_mode="HTML", reply_markup=keyboard)
    return DRIVE_REVIEW_GROUPS


async def drive_review_groups(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "groups_cancel":
        await query.edit_message_text("Cancelado.")
        context.user_data.clear()
        return ConversationHandler.END

    # Confirmar → empezar a recopilar URL por grupo
    groups = context.user_data["groups"]
    context.user_data["current_group"] = 0
    context.user_data["groups_config"] = []

    await query.edit_message_text("✅ Grupos confirmados. Ahora necesito la URL de destino por campaña.")
    return await _ask_group_url(query.message, context)


# ── Recopilación URL + presupuesto por grupo ──────────────────────────────────

async def _ask_group_url(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    idx = context.user_data["current_group"]
    groups = context.user_data["groups"]
    g = groups[idx]
    n_total = len(groups)

    await message.reply_text(
        f"📎 <b>Grupo {idx + 1}/{n_total}</b> — <code>{g['angle']}</code>\n"
        f"{len(g['videos'])} video(s)\n\n"
        f"Enviame la <b>URL de destino</b> (landing page):",
        parse_mode="HTML",
    )
    return DRIVE_GROUP_URL


async def drive_group_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text("URL inválida. Ej: https://ovitta.store/products/...")
        return DRIVE_GROUP_URL

    url = match.group()
    idx = context.user_data["current_group"]
    groups = context.user_data["groups"]
    g = groups[idx]

    # Generar copy para este grupo usando referencia de copies ganadores
    msg = await update.message.reply_text("⏳ Generando copy...")
    try:
        copies = await _generate_group_copies(g, url)
    except Exception as e:
        logger.error(f"Copy generation error: {e}")
        copies = [{"primary_text": v.get("primary_text", ""), "headline": v.get("headline", ""), "cta": "SHOP_NOW"} for v in g["videos"]]

    try:
        await msg.delete()
    except Exception:
        pass

    context.user_data["groups_config"].append({"angle": g["angle"], "url": url, "copies": copies})

    # Mostrar preview del copy
    lines = [f"✏️ <b>Copy generado para {g['angle']}</b>:\n"]
    for i, (v, c) in enumerate(zip(g["videos"], copies), 1):
        lines.append(
            f"<b>Ad {i}</b> — {v['file_name'][:30]}\n"
            f"<i>{c.get('primary_text', '')}</i>\n"
            f"<b>{c.get('headline', '')}</b>\n"
        )
    lines.append(f"💰 ¿Cuánto por día para esta campaña? (en ARS)\n<i>Ej: 5000</i>")
    await update.message.reply_text("\n".join(lines), parse_mode="HTML")
    return DRIVE_GROUP_BUDGET


async def _generate_group_copies(group: dict, url: str) -> list[dict]:
    """Genera copies para todos los videos del grupo."""
    loop = asyncio.get_event_loop()
    from db.queries import get_copy_winners_by_angle
    winners = get_copy_winners_by_angle(group["angle"])

    copies = []
    for v in group["videos"]:
        try:
            from ai.video_analyzer import analyze_video
            result = await loop.run_in_executor(None, analyze_video, v["drive_file_id"], v["file_name"], url)
            copies.append({
                "primary_text": result.get("primary_text", ""),
                "headline": result.get("headline", ""),
                "cta": result.get("cta", "SHOP_NOW"),
            })
        except Exception:
            copies.append({
                "primary_text": v.get("primary_text", ""),
                "headline": v.get("headline", ""),
                "cta": "SHOP_NOW",
            })
    return copies


async def drive_group_budget(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        budget = float(update.message.text.replace(",", ".").replace("$", "").strip())
        if budget <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("Solo el número. Ej: 5000")
        return DRIVE_GROUP_BUDGET

    idx = context.user_data["current_group"]
    context.user_data["groups_config"][idx]["budget"] = budget

    groups = context.user_data["groups"]
    next_idx = idx + 1
    context.user_data["current_group"] = next_idx

    if next_idx < len(groups):
        return await _ask_group_url(update.message, context)

    # Todos los grupos configurados → mostrar resumen final
    return await _show_final_confirm(update.message, context)


# ── Confirmación final ────────────────────────────────────────────────────────

async def _show_final_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    groups = context.user_data["groups"]
    configs = context.user_data["groups_config"]
    accounts = __import__("db.queries", fromlist=["get_accounts"]).get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    lines = ["📋 <b>Resumen — Campañas a crear</b>\n"]
    for i, (g, cfg) in enumerate(zip(groups, configs), 1):
        n = len(g["videos"])
        lines.append(
            f"<b>{i}. {g['angle']}</b> — CBO {g['structure']}\n"
            f"   URL: {cfg['url'][:50]}\n"
            f"   Presupuesto: <b>${cfg['budget']:,.0f} {currency}/día</b>\n"
            f"   {n} ad(s) en PAUSED\n"
        )

    lines.append("¿Creamos todo?")
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Crear todo", callback_data="create_all")],
        [InlineKeyboardButton("❌ Cancelar", callback_data="create_cancel")],
    ])
    await message.reply_text("\n".join(lines), parse_mode="HTML", reply_markup=keyboard)
    return DRIVE_CONFIRM_ALL


async def drive_confirm_all(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "create_cancel":
        await query.edit_message_text("Cancelado.")
        context.user_data.clear()
        return ConversationHandler.END

    await query.edit_message_text("⏳ Creando campañas en Meta Ads...")

    groups = context.user_data["groups"]
    configs = context.user_data["groups_config"]
    loop = asyncio.get_event_loop()

    from db.queries import get_accounts, link_ad_to_drive
    from meta.drive_client import move_to_subfolder
    from meta.campaign_builder import build_multi_ad_campaign

    accounts = get_accounts()
    if not accounts:
        await query.message.reply_text("❌ No hay ad accounts. Ejecutá /sync.")
        return ConversationHandler.END

    account_id = accounts[0]["id"]
    results = []
    errors = []

    for g, cfg in zip(groups, configs):
        try:
            campaign_name = f"Campaña {g['angle'].replace('_', ' ').title()} {datetime.now().strftime('%d/%m %H:%M')}"
            ads_spec = []
            for v, copy in zip(g["videos"], cfg["copies"]):
                ads_spec.append({
                    "ad_name": v["file_name"],
                    "primary_text": copy.get("primary_text", ""),
                    "headline": copy.get("headline", ""),
                    "cta": copy.get("cta", "SHOP_NOW"),
                    "library_video_id": "",
                    "video_url": f"https://drive.google.com/uc?export=download&id={v['drive_file_id']}",
                    "creative_path": "",
                    "drive_file_id": v["drive_file_id"],
                })

            spec = {
                "name": campaign_name,
                "objective": "ventas",
                "daily_budget": cfg["budget"],
                "targeting": g["videos"][0].get("targeting", {"geo_locations": {"countries": ["AR"]}, "age_min": 35, "age_max": 65}),
                "destination_url": cfg["url"],
                "account_id": account_id,
                "ads": ads_spec,
            }

            result = await loop.run_in_executor(None, build_multi_ad_campaign, spec)

            # Vincular ads con Drive y moverlos a "Nuevos subidos"
            for ad_info in result.get("ads", []):
                if ad_info.get("drive_file_id") and ad_info.get("ad_id"):
                    try:
                        link_ad_to_drive(ad_info["ad_id"], ad_info["drive_file_id"], "Nuevos subidos")
                        move_to_subfolder(ad_info["drive_file_id"], "Nuevos subidos")
                    except Exception as e:
                        logger.warning(f"Could not link/move {ad_info['drive_file_id']}: {e}")

            results.append(f"✅ <b>{campaign_name}</b>\nID: <code>{result['campaign_id']}</code> — {len(result.get('ads', []))} ads")

        except Exception as e:
            logger.error(f"Campaign creation error for {g['angle']}: {e}", exc_info=True)
            errors.append(f"❌ {g['angle']}: {str(e)[:100]}")

    lines = ["<b>Resultado</b>\n"] + results
    if errors:
        lines += ["\n<b>Errores:</b>"] + errors
    lines.append("\nTodas en <b>PAUSED</b>. Activálas cuando estés listo.")

    await query.message.reply_text("\n".join(lines), parse_mode="HTML")
    context.user_data.clear()
    return ConversationHandler.END


# ── Flujo fallback (sin Drive) ────────────────────────────────────────────────

CATEGORY_LABELS = {
    "winners": "Winners", "poco_gasto": "Poco gasto",
    "malos": "Malos", "sin_datos": "Sin historial",
}


async def _start_fallback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    rows = [
        [InlineKeyboardButton("Biblioteca Meta", callback_data="src_library")],
        [InlineKeyboardButton("Subir nuevo", callback_data="src_upload")],
    ]
    await update.message.reply_text(
        "<b>Nueva campaña</b>\n\n¿De dónde tomamos el creativo?",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(rows),
    )
    return CHOOSE_SOURCE


async def choose_source(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "src_upload":
        await query.edit_message_text(
            "Enviame la imagen o video.\n<i>Videos pesados: mandá el link de Google Drive.</i>",
            parse_mode="HTML",
        )
        return UPLOAD_CREATIVE

    await query.edit_message_text("Cargando videos de Meta...")
    context.user_data["video_source"] = query.data
    try:
        from meta.video_library import get_videos_with_performance
        context.user_data["categorized"] = get_videos_with_performance()
    except Exception as e:
        await query.message.reply_text(f"Error: {e}")
        return ConversationHandler.END
    return await _show_categories(query.message, context)


async def _show_categories(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    categorized = context.user_data["categorized"]
    rows = []
    for key, label in CATEGORY_LABELS.items():
        if categorized.get(key):
            rows.append([InlineKeyboardButton(f"{label} ({len(categorized[key])})", callback_data=f"cat_{key}")])
    if not rows:
        await message.reply_text("No encontré videos en Meta.")
        return ConversationHandler.END
    total = sum(len(v) for v in categorized.values())
    await message.reply_text(
        f"<b>{total} videos en Meta</b>\n\n¿De qué categoría?",
        parse_mode="HTML", reply_markup=InlineKeyboardMarkup(rows),
    )
    return CHOOSE_CATEGORY


async def choose_category(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    cat = query.data.replace("cat_", "")
    context.user_data["selected_category"] = cat
    videos = context.user_data["categorized"].get(cat, [])
    if not videos:
        await query.edit_message_text("No hay videos en esa categoría.")
        return CHOOSE_CATEGORY
    rows = []
    for v in videos[:20]:
        name = (v.get("title") or "Sin título")[:32]
        extra = f" - {v['roas']:.1f}x" if v.get("roas") else (f" - ${v['spend']:.0f}" if v.get("spend") else "")
        if v.get("length"):
            extra += f" - {_fmt_dur(v['length'])}"
        rows.append([InlineKeyboardButton(f"{name}{extra}", callback_data=f"vid_{v['id']}")])
    rows.append([InlineKeyboardButton("Volver", callback_data="back_categories")])
    await query.edit_message_text(
        f"{CATEGORY_LABELS.get(cat, cat)} — elegí el creativo:",
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
    title = video.get("title") or video.get("name") or "Sin título"
    context.user_data.update({
        "library_video_id": video_id, "drive_file_id": None,
        "library_video_title": title, "is_video": True,
        "creative_path": None, "video_url": None,
    })
    await query.edit_message_text(f"<b>{title}</b> seleccionado.", parse_mode="HTML")
    await query.message.reply_text("Enviame la <b>URL de destino</b>.", parse_mode="HTML")
    return URL


async def upload_creative(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.message
    if message.text:
        match = URL_RE.search(message.text)
        if match:
            raw = match.group()
            m = re.search(r"/d/([a-zA-Z0-9_-]+)", raw)
            url = f"https://drive.google.com/uc?export=download&id={m.group(1)}" if m else raw
            context.user_data.update({"video_url": url, "creative_path": None, "library_video_id": None, "is_video": True})
            await message.reply_text("Link recibido.\n\nEnviame la <b>URL de destino</b>.", parse_mode="HTML")
            return URL
        await message.reply_text("Enviame el archivo o link de Google Drive.")
        return UPLOAD_CREATIVE

    tg_file = message.photo[-1] if message.photo else message.video if message.video else message.document if message.document else None
    if not tg_file:
        await message.reply_text("Enviame una imagen, video o link de Google Drive.")
        return UPLOAD_CREATIVE

    suffix = ".mp4" if message.video or (message.document and message.document.mime_type in VIDEO_MIMES) else ".jpg"
    is_video = suffix == ".mp4"
    file_size = tg_file.file_size or 0

    if file_size > MAX_TG_MB * 1024 * 1024:
        await message.reply_text(
            f"El archivo pesa <b>{file_size / 1024 / 1024:.0f} MB</b>.\n\n"
            f"Subilo a <b>Google Drive</b> y pegá el link acá.",
            parse_mode="HTML",
        )
        return UPLOAD_CREATIVE

    try:
        file = await tg_file.get_file()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        await file.download_to_drive(tmp.name)
        context.user_data.update({
            "creative_path": tmp.name, "video_url": None,
            "library_video_id": None, "is_video": is_video,
        })
    except BadRequest as e:
        if "too big" in str(e).lower() or "too large" in str(e).lower():
            await message.reply_text("Archivo muy pesado. Subilo a Google Drive y pegá el link.")
            return UPLOAD_CREATIVE
        raise

    await message.reply_text("Creativo recibido.\n\nEnviame la <b>URL de destino</b>.", parse_mode="HTML")
    return URL


async def receive_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text("URL inválida. Ej: https://tutienda.com/producto")
        return URL
    url = match.group()
    context.user_data["destination_url"] = url
    msg = await update.message.reply_text("Analizando con IA...")

    try:
        from ai.creative_analyst import analyze_for_campaign
        plan = analyze_for_campaign(context.user_data.get("creative_path", ""), url)
    except Exception as e:
        plan = {"angle": "ventas", "analysis": "Sin análisis.", "objective": "ventas",
                "primary_text": "", "headline": "", "cta": "SHOP_NOW",
                "audience_summary": "", "targeting": {"geo_locations": {"countries": ["AR"]}, "age_min": 35, "age_max": 65}}

    context.user_data["plan"] = plan
    obj_label = OBJECTIVE_LABELS.get(plan["objective"], "Ventas")
    try:
        await msg.delete()
    except Exception:
        pass

    text_out = (
        f"<b>Análisis</b>\n\n{plan['analysis']}\n\n"
        f"<b>Copy sugerido</b>\n<i>{plan['primary_text']}</i>\n<b>{plan['headline']}</b>\n\n"
        f"{plan['audience_summary']}\n\nObjetivo: <b>{obj_label}</b>\n\n¿Cambiás el objetivo?"
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("Ventas", callback_data="obj_ventas"),
        InlineKeyboardButton("Tráfico", callback_data="obj_trafico"),
        InlineKeyboardButton("Alcance", callback_data="obj_alcance"),
    ], [InlineKeyboardButton(f"Mantener ({obj_label})", callback_data=f"obj_{plan['objective']}")]])
    await update.message.reply_text(text_out, parse_mode="HTML", reply_markup=keyboard)
    return OBJECTIVE


async def receive_objective(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    objective = query.data.replace("obj_", "")
    context.user_data["plan"]["objective"] = objective
    await query.edit_message_text(f"Objetivo: {OBJECTIVE_LABELS.get(objective, objective)}")
    accounts = __import__("db.queries", fromlist=["get_accounts"]).get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"
    context.user_data["currency"] = currency
    await query.message.reply_text(f"¿Cuánto por día? (en {currency})\n<i>Ej: 5000</i>", parse_mode="HTML")
    return BUDGET


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


async def _show_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    plan = context.user_data["plan"]
    budget = context.user_data["daily_budget"]
    currency = context.user_data.get("currency", "ARS")
    url = context.user_data["destination_url"]
    lib_title = context.user_data.get("library_video_title", "")
    creative_line = f"Video: {lib_title}" if lib_title else ("Video (Drive)" if context.user_data.get("video_url") else ("Video" if context.user_data.get("is_video") else "Imagen"))
    campaign_name = f"Campaña {plan['objective'].capitalize()} Bot {datetime.now().strftime('%d/%m %H:%M')}"
    context.user_data["campaign_name"] = campaign_name
    summary = (
        f"<b>Resumen</b>\n\n<code>{campaign_name}</code>\n"
        f"Objetivo: {OBJECTIVE_LABELS.get(plan['objective'], plan['objective'])}\n"
        f"Presupuesto: <b>${budget:,.0f} {currency}</b>/día\n{creative_line}\nURL: {url}\n\n"
        f"<i>{plan['primary_text']}</i>\n<b>{plan['headline']}</b>\n\n"
        f"{plan['audience_summary']}\n\nSe crea en modo <b>PAUSED</b>."
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("Confirmar y crear", callback_data="confirm_yes"),
        InlineKeyboardButton("Cancelar", callback_data="confirm_no"),
    ]])
    await message.reply_text(summary, parse_mode="HTML", reply_markup=keyboard)
    return CONFIRM


async def confirm_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "confirm_no":
        await query.edit_message_text("Cancelado.")
        context.user_data.clear()
        return ConversationHandler.END

    await query.edit_message_text("Creando campaña en Meta Ads...")
    try:
        from meta.campaign_builder import build_campaign
        from db.queries import get_accounts
        accounts = get_accounts()
        if not accounts:
            await query.message.reply_text("No hay ad accounts. Ejecutá /sync.")
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
            f"✅ <b>Campaña creada!</b>\n\n{result['campaign_name']}\n"
            f"Campaign ID: <code>{result['campaign_id']}</code>\n"
            f"Ad ID: <code>{result['ad_id']}</code>\n\nEstá en <b>PAUSED</b>.",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.error(f"Campaign creation error: {e}")
        await query.message.reply_text(f"Error:\n<code>{str(e)[:400]}</code>", parse_mode="HTML")
    finally:
        try:
            p = context.user_data.get("creative_path")
            if p:
                os.unlink(p)
        except Exception:
            pass
        context.user_data.clear()
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


# ── Handlers ──────────────────────────────────────────────────────────────────

_FILE_FILTER = filters.PHOTO | filters.VIDEO | filters.Document.ALL


def get_create_campaign_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("crear", start_campaign)],
        states={
            # ── Flujo Drive (multi-ads) ──
            DRIVE_SELECT_MODE:   [CallbackQueryHandler(drive_select_mode, pattern="^drv_")],
            DRIVE_PICK_SPECIFIC: [MessageHandler(filters.TEXT & ~filters.COMMAND, drive_pick_specific)],
            DRIVE_PICK_ANGLE:    [CallbackQueryHandler(drive_pick_angle, pattern="^ang_")],
            DRIVE_REVIEW_GROUPS: [CallbackQueryHandler(drive_review_groups, pattern="^groups_")],
            DRIVE_GROUP_URL:     [MessageHandler(filters.TEXT & ~filters.COMMAND, drive_group_url)],
            DRIVE_GROUP_BUDGET:  [MessageHandler(filters.TEXT & ~filters.COMMAND, drive_group_budget)],
            DRIVE_CONFIRM_ALL:   [CallbackQueryHandler(drive_confirm_all, pattern="^create_")],

            # ── Flujo fallback (single ad) ──
            CHOOSE_SOURCE:   [CallbackQueryHandler(choose_source, pattern="^src_")],
            CHOOSE_CATEGORY: [
                CallbackQueryHandler(choose_category, pattern="^cat_"),
                CallbackQueryHandler(back_categories, pattern="^back_categories"),
            ],
            PICK_VIDEO: [
                CallbackQueryHandler(pick_video, pattern="^vid_"),
                CallbackQueryHandler(back_categories, pattern="^back_categories"),
            ],
            UPLOAD_CREATIVE: [MessageHandler(_FILE_FILTER | (filters.TEXT & ~filters.COMMAND), upload_creative)],
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
