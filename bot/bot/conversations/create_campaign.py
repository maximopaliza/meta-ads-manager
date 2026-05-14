import logging
import os
import tempfile
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)
from ai.analyst import generate_copy, generate_targeting
from ai.creative_analyst import analyze_creative

logger = logging.getLogger(__name__)

CREATIVE, ANALYZE_CONFIRM, OBJECTIVE, BUDGET, AUDIENCE, COPY_CHOICE, CONFIRM = range(7)

OBJECTIVE_LABELS = {
    "ventas": "🛍️ Ventas",
    "trafico": "🌐 Tráfico",
    "alcance": "📢 Alcance",
}


async def start_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🎨 <b>Crear nueva campaña</b>\n\n"
        "Enviame la imagen o video que vas a usar como creativo.",
        parse_mode="HTML",
    )
    return CREATIVE


async def receive_creative(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.message

    if message.photo:
        file = await message.photo[-1].get_file()
        suffix = ".jpg"
    elif message.video:
        file = await message.video.get_file()
        suffix = ".mp4"
    else:
        await message.reply_text("Enviame una imagen o video.")
        return CREATIVE

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    await file.download_to_drive(tmp.name)
    context.user_data["creative_path"] = tmp.name

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Sí, analizalo", callback_data="analyze_yes"),
         InlineKeyboardButton("❌ No, continuar", callback_data="analyze_no")]
    ])
    await message.reply_text(
        "✅ Creativo recibido. ¿Querés que lo analice antes de usarlo?",
        reply_markup=keyboard,
    )
    return ANALYZE_CONFIRM


async def analyze_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "analyze_yes":
        await query.edit_message_text("⏳ Analizando creativo con IA...")
        result = analyze_creative(context.user_data["creative_path"])
        await query.message.reply_text(result)

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("🛍️ Ventas", callback_data="obj_ventas"),
        InlineKeyboardButton("🌐 Tráfico", callback_data="obj_trafico"),
        InlineKeyboardButton("📢 Alcance", callback_data="obj_alcance"),
    ]])
    await query.message.reply_text("¿Cuál es el objetivo de la campaña?", reply_markup=keyboard)
    return OBJECTIVE


async def receive_objective(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    objective = query.data.replace("obj_", "")
    context.user_data["objective"] = objective
    await query.edit_message_text(f"Objetivo: {OBJECTIVE_LABELS[objective]} ✅")
    await query.message.reply_text("💰 ¿Cuál es el presupuesto diario? (en tu moneda, ej: 5000)")
    return BUDGET


async def receive_budget(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        budget = float(update.message.text.replace(",", ".").replace("$", "").strip())
        context.user_data["daily_budget"] = budget
        await update.message.reply_text(
            f"Presupuesto: ${budget:,.0f} ✅\n\n"
            "👥 Describí tu público en texto libre. Ej:\n"
            "<i>Mujeres 25-45 años de Buenos Aires interesadas en moda y compras online</i>",
            parse_mode="HTML",
        )
        return AUDIENCE
    except ValueError:
        await update.message.reply_text("Enviá solo el número. Ej: 5000")
        return BUDGET


async def receive_audience(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    description = update.message.text
    context.user_data["audience_description"] = description
    await update.message.reply_text("⏳ Generando targeting con IA...")

    targeting = generate_targeting(description)
    context.user_data["targeting"] = targeting

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✍️ Escribir copy yo", callback_data="copy_manual"),
        InlineKeyboardButton("🤖 Generar con IA", callback_data="copy_ai"),
    ]])
    await update.message.reply_text(
        f"Targeting generado: <code>{str(targeting)[:200]}</code>\n\n"
        "✏️ ¿Cómo querés hacer el texto del anuncio?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return COPY_CHOICE


async def copy_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "copy_ai":
        await query.edit_message_text("⏳ Generando copy con IA...")
        copy_data = generate_copy(
            context.user_data["objective"],
            f"Público: {context.user_data['audience_description']}",
        )
        copy_text = copy_data.get("primary_text", "")
        context.user_data["copy"] = copy_text
        context.user_data["copy_data"] = copy_data
        await query.message.reply_text(
            f"Copy generado:\n\n<i>{copy_text}</i>\n\n"
            f"Titular: <b>{copy_data.get('headline', '')}</b>",
            parse_mode="HTML",
        )
        return await _show_confirm(query.message, context)
    else:
        await query.edit_message_text("✍️ Escribí el texto del anuncio:")
        return COPY_CHOICE


async def receive_manual_copy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["copy"] = update.message.text
    return await _show_confirm(update.message, context)


async def _show_confirm(message, context: ContextTypes.DEFAULT_TYPE) -> int:
    ud = context.user_data
    accounts = __import__("db.queries", fromlist=["get_accounts"]).get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    summary = (
        f"📋 <b>Resumen de la campaña</b>\n\n"
        f"🎯 Objetivo: {OBJECTIVE_LABELS.get(ud.get('objective', ''), ud.get('objective', ''))}\n"
        f"💰 Presupuesto diario: ${ud.get('daily_budget', 0):,.0f} {currency}\n"
        f"👥 Público: {ud.get('audience_description', '')[:100]}\n"
        f"✏️ Copy: {ud.get('copy', '')[:100]}\n\n"
        f"¿Confirmás la creación?"
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar", callback_data="confirm_yes"),
        InlineKeyboardButton("❌ Cancelar", callback_data="confirm_no"),
    ]])
    await message.reply_text(summary, parse_mode="HTML", reply_markup=keyboard)
    return CONFIRM


async def confirm_campaign(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "confirm_no":
        await query.edit_message_text("❌ Campaña cancelada.")
        context.user_data.clear()
        return ConversationHandler.END

    await query.edit_message_text("⏳ Creando campaña en Meta Ads...")

    try:
        from meta.campaign_builder import build_campaign
        from db.queries import get_accounts

        accounts = get_accounts()
        if not accounts:
            await query.message.reply_text("❌ No hay ad accounts. Ejecutá /sync primero.")
            return ConversationHandler.END

        account_id = accounts[0]["id"]
        name = f"Campaña {context.user_data.get('objective', 'nueva').capitalize()} — Bot"

        spec = {
            "name": name,
            "objective": context.user_data.get("objective", "ventas"),
            "daily_budget": context.user_data.get("daily_budget", 1000),
            "targeting": context.user_data.get("targeting", {"geo_locations": {"countries": ["AR"]}}),
            "copy": context.user_data.get("copy", ""),
            "image_path": context.user_data.get("creative_path", ""),
            "account_id": account_id,
        }

        result = build_campaign(spec)
        await query.message.reply_text(
            f"✅ <b>Campaña creada exitosamente</b>\n\n"
            f"📣 Nombre: {name}\n"
            f"🆔 Campaign ID: <code>{result['campaign_id']}</code>\n"
            f"🎯 Ad Set ID: <code>{result['ad_set_id']}</code>\n"
            f"🖼️ Ad ID: <code>{result['ad_id']}</code>\n\n"
            f"<i>La campaña está en PAUSED. Activala desde Meta Ads Manager cuando estés listo.</i>",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.error(f"Campaign creation error: {e}")
        await query.message.reply_text(f"❌ Error creando la campaña: {str(e)[:300]}")

    context.user_data.clear()
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Flujo cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


def get_create_campaign_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[
            CommandHandler("crear", start_campaign),
            MessageHandler(filters.PHOTO | filters.VIDEO, receive_creative),
        ],
        states={
            CREATIVE: [MessageHandler(filters.PHOTO | filters.VIDEO, receive_creative)],
            ANALYZE_CONFIRM: [CallbackQueryHandler(analyze_confirm, pattern="^analyze_")],
            OBJECTIVE: [CallbackQueryHandler(receive_objective, pattern="^obj_")],
            BUDGET: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_budget)],
            AUDIENCE: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_audience)],
            COPY_CHOICE: [
                CallbackQueryHandler(copy_choice, pattern="^copy_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_manual_copy),
            ],
            CONFIRM: [CallbackQueryHandler(confirm_campaign, pattern="^confirm_")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
    )
