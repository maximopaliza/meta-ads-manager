"""
copy_manager.py — Sección de gestión de copies y ángulos (/copys).

Flujo:
  /copys → menú principal
         → Ver copies por ángulo
         → Generar nuevo copy para un ángulo
         → Editar copy existente
         → Guardar como winner
"""
import logging
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes, ConversationHandler, CommandHandler,
    MessageHandler, CallbackQueryHandler, filters,
)
from bot.conversations.create_campaign import ANGLE_CHOICES

logger = logging.getLogger(__name__)

(COPY_MENU, COPY_PICK_ANGLE, COPY_VIEW, COPY_GENERATE_WAIT,
 COPY_EDIT_PRIMARY, COPY_EDIT_HEADLINE) = range(20, 26)


# ── Entrada ───────────────────────────────────────────────────────────────────

async def start_copys(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("📖 Ver copies por ángulo", callback_data="cp_view")],
        [InlineKeyboardButton("✨ Generar nuevo copy", callback_data="cp_gen")],
        [InlineKeyboardButton("❌ Cerrar", callback_data="cp_close")],
    ])
    await update.message.reply_text(
        "✏️ <b>Gestión de Copies</b>\n\n¿Qué querés hacer?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return COPY_MENU


async def copy_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "cp_close":
        await query.edit_message_text("Cerrado.")
        return ConversationHandler.END

    context.user_data["cp_action"] = query.data
    await query.edit_message_text("Elegí el ángulo:")
    return await _show_angle_picker(query.message, context)


async def _show_angle_picker(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    rows = []
    for i in range(0, len(ANGLE_CHOICES), 2):
        row = [InlineKeyboardButton(ANGLE_CHOICES[i][1], callback_data=f"cpang_{ANGLE_CHOICES[i][0]}")]
        if i + 1 < len(ANGLE_CHOICES):
            row.append(InlineKeyboardButton(ANGLE_CHOICES[i+1][1], callback_data=f"cpang_{ANGLE_CHOICES[i+1][0]}"))
        rows.append(row)
    rows.append([InlineKeyboardButton("⬅️ Volver", callback_data="cpang_back")])
    await message.reply_text("🎯 Elegí el ángulo:", reply_markup=InlineKeyboardMarkup(rows))
    return COPY_PICK_ANGLE


async def copy_pick_angle(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "cpang_back":
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("📖 Ver copies por ángulo", callback_data="cp_view")],
            [InlineKeyboardButton("✨ Generar nuevo copy", callback_data="cp_gen")],
            [InlineKeyboardButton("❌ Cerrar", callback_data="cp_close")],
        ])
        await query.edit_message_text("✏️ <b>Gestión de Copies</b>\n\n¿Qué querés hacer?", parse_mode="HTML", reply_markup=keyboard)
        return COPY_MENU

    angle = query.data.replace("cpang_", "")
    angle_label = next((lbl for key, lbl in ANGLE_CHOICES if key == angle), angle)
    context.user_data["cp_angle"] = angle
    context.user_data["cp_angle_label"] = angle_label

    action = context.user_data.get("cp_action", "cp_view")

    if action == "cp_view":
        return await _show_copies_for_angle(query, angle, angle_label)
    else:
        await query.edit_message_text(f"⏳ Generando copy para <b>{angle_label}</b>...", parse_mode="HTML")
        return await _generate_and_show(query.message, context, angle, angle_label)


async def _show_copies_for_angle(query, angle: str, angle_label: str) -> int:
    try:
        from db.queries import get_copy_winners_by_angle
        winners = get_copy_winners_by_angle(angle) or []
    except Exception:
        winners = []

    if not winners:
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("✨ Generar uno ahora", callback_data=f"cpang_{angle}")],
            [InlineKeyboardButton("⬅️ Volver", callback_data="cpang_back")],
        ])
        await query.edit_message_text(
            f"📂 No hay copies guardados para <b>{angle_label}</b>.",
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        return COPY_PICK_ANGLE

    lines = [f"📖 <b>Copies — {angle_label}</b>\n"]
    for i, w in enumerate(winners[:5], 1):
        lines.append(
            f"<b>{i}.</b> 📝 <i>{w.get('primary_text', '')}</i>\n"
            f"   🔤 <b>{w.get('headline', '')}</b>\n"
            f"   ROAS: {w.get('roas', '?')}x | CPA: ${w.get('cpa', '?')}\n"
        )

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✨ Generar nuevo", callback_data=f"cpang_{angle}")],
        [InlineKeyboardButton("⬅️ Volver", callback_data="cpang_back")],
    ])
    await query.edit_message_text("\n".join(lines), parse_mode="HTML", reply_markup=keyboard)
    return COPY_PICK_ANGLE


async def _generate_and_show(message, context: ContextTypes.DEFAULT_TYPE, angle: str, angle_label: str) -> int:
    loop = asyncio.get_event_loop()
    try:
        from ai.analyst import generate_copy
        result = await asyncio.wait_for(
            loop.run_in_executor(None, generate_copy, "ventas", f"Ovitta Vision Complete — ángulo: {angle}"),
            timeout=30,
        )
    except Exception as e:
        logger.error(f"Copy generation error: {e}")
        result = {"primary_text": "", "headline": "", "cta": "SHOP_NOW"}

    context.user_data["cp_draft"] = result

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✏️ Editar texto principal", callback_data="cpedit_primary")],
        [InlineKeyboardButton("✏️ Editar titular", callback_data="cpedit_headline")],
        [InlineKeyboardButton("🔄 Regenerar", callback_data="cpedit_regen")],
        [InlineKeyboardButton("⬅️ Volver", callback_data="cpang_back")],
    ])
    await message.reply_text(
        f"✨ <b>Copy generado — {angle_label}</b>\n\n"
        f"📝 <i>{result.get('primary_text', '(vacío)')}</i>\n"
        f"🔤 <b>{result.get('headline', '(vacío)')}</b>\n\n"
        f"¿Qué hacemos?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return COPY_VIEW


async def copy_view(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "cpedit_primary":
        draft = context.user_data.get("cp_draft", {})
        await query.edit_message_text(
            f"📝 <b>Texto principal actual:</b>\n<i>{draft.get('primary_text', '(vacío)')}</i>\n\n"
            f"Escribí el nuevo texto principal (máx 125 caracteres):",
            parse_mode="HTML",
        )
        return COPY_EDIT_PRIMARY

    if query.data == "cpedit_headline":
        draft = context.user_data.get("cp_draft", {})
        await query.edit_message_text(
            f"🔤 <b>Titular actual:</b>\n<b>{draft.get('headline', '(vacío)')}</b>\n\n"
            f"Escribí el nuevo titular (máx 40 caracteres):",
            parse_mode="HTML",
        )
        return COPY_EDIT_HEADLINE

    if query.data == "cpedit_regen":
        angle = context.user_data.get("cp_angle", "")
        angle_label = context.user_data.get("cp_angle_label", angle)
        await query.edit_message_text(f"⏳ Regenerando copy para <b>{angle_label}</b>...", parse_mode="HTML")
        return await _generate_and_show(query.message, context, angle, angle_label)

    if query.data == "cpang_back":
        return await _show_angle_picker(query.message, context)

    return COPY_VIEW


async def copy_edit_primary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if len(text) > 125:
        await update.message.reply_text(f"Demasiado largo ({len(text)} chars). Máx 125. Intentá de nuevo:")
        return COPY_EDIT_PRIMARY

    context.user_data["cp_draft"]["primary_text"] = text
    angle_label = context.user_data.get("cp_angle_label", "")
    draft = context.user_data["cp_draft"]

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✏️ Editar texto principal", callback_data="cpedit_primary")],
        [InlineKeyboardButton("✏️ Editar titular", callback_data="cpedit_headline")],
        [InlineKeyboardButton("🔄 Regenerar", callback_data="cpedit_regen")],
        [InlineKeyboardButton("⬅️ Volver", callback_data="cpang_back")],
    ])
    await update.message.reply_text(
        f"✅ Actualizado.\n\n✨ <b>{angle_label}</b>\n\n"
        f"📝 <i>{draft.get('primary_text', '')}</i>\n"
        f"🔤 <b>{draft.get('headline', '')}</b>\n\n¿Qué más?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return COPY_VIEW


async def copy_edit_headline(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if len(text) > 40:
        await update.message.reply_text(f"Demasiado largo ({len(text)} chars). Máx 40. Intentá de nuevo:")
        return COPY_EDIT_HEADLINE

    context.user_data["cp_draft"]["headline"] = text
    angle_label = context.user_data.get("cp_angle_label", "")
    draft = context.user_data["cp_draft"]

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✏️ Editar texto principal", callback_data="cpedit_primary")],
        [InlineKeyboardButton("✏️ Editar titular", callback_data="cpedit_headline")],
        [InlineKeyboardButton("🔄 Regenerar", callback_data="cpedit_regen")],
        [InlineKeyboardButton("⬅️ Volver", callback_data="cpang_back")],
    ])
    await update.message.reply_text(
        f"✅ Actualizado.\n\n✨ <b>{angle_label}</b>\n\n"
        f"📝 <i>{draft.get('primary_text', '')}</i>\n"
        f"🔤 <b>{draft.get('headline', '')}</b>\n\n¿Qué más?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return COPY_VIEW


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


def get_copy_manager_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("copys", start_copys)],
        states={
            COPY_MENU:       [CallbackQueryHandler(copy_menu, pattern="^cp_")],
            COPY_PICK_ANGLE: [CallbackQueryHandler(copy_pick_angle, pattern="^cpang_")],
            COPY_VIEW:       [CallbackQueryHandler(copy_view, pattern="^cpedit_|^cpang_")],
            COPY_EDIT_PRIMARY:  [MessageHandler(filters.TEXT & ~filters.COMMAND, copy_edit_primary)],
            COPY_EDIT_HEADLINE: [MessageHandler(filters.TEXT & ~filters.COMMAND, copy_edit_headline)],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
        allow_reentry=True,
    )
