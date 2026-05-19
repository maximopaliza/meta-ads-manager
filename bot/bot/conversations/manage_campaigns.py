import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)
from db import queries
from meta.client import MetaClient

logger = logging.getLogger(__name__)

SELECT_TOGGLE, CONFIRM_TOGGLE = range(20, 22)
SELECT_BUDGET, ENTER_BUDGET, CONFIRM_BUDGET = range(22, 25)

STATUS_EMOJI = {"ACTIVE": "🟢", "PAUSED": "⏸", "ARCHIVED": "⚫"}


# ─── GESTIONAR (pausar / activar) ────────────────────────────────────────────

async def cmd_gestionar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    campaigns = queries.get_campaigns()
    visible = [c for c in campaigns if c["status"] != "ARCHIVED"]
    if not visible:
        await update.message.reply_text("Sin campañas. Ejecutá /sync primero.")
        return ConversationHandler.END

    today_metrics = queries.get_today_metrics()
    m_map = {m["object_id"]: m for m in today_metrics}
    accounts = queries.get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    lines = ["📣 <b>Gestionar campañas</b>\n<i>Tocá una campaña para pausar o activar:</i>\n"]
    keyboard = []

    for c in sorted(visible, key=lambda x: x["status"] != "ACTIVE"):
        emoji = STATUS_EMOJI.get(c["status"], "⚪")
        m = m_map.get(c["id"])
        spend_str = f" · ${m.get('spend', 0):,.0f} {currency}" if m and m.get("spend", 0) > 0 else ""
        lines.append(f"{emoji} {c['name'][:50]}{spend_str}")

        new_status = "PAUSED" if c["status"] == "ACTIVE" else "ACTIVE"
        action_label = "⏸ Pausar" if c["status"] == "ACTIVE" else "▶ Activar"
        keyboard.append([InlineKeyboardButton(
            f"{action_label} — {c['name'][:32]}",
            callback_data=f"tgl_{new_status}_{c['id']}",
        )])

    keyboard.append([InlineKeyboardButton("❌ Cancelar", callback_data="tgl_cancel")])

    await update.message.reply_text(
        "\n".join(lines),
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return SELECT_TOGGLE


async def toggle_selected(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "tgl_cancel":
        await query.edit_message_text("Cancelado.")
        return ConversationHandler.END

    parts = query.data.split("_", 2)
    new_status = parts[1]
    campaign_id = parts[2]

    campaigns = queries.get_campaigns()
    c = next((c for c in campaigns if c["id"] == campaign_id), None)
    context.user_data["tgl_id"] = campaign_id
    context.user_data["tgl_status"] = new_status
    context.user_data["tgl_name"] = c["name"] if c else campaign_id

    action_label = "PAUSAR" if new_status == "PAUSED" else "ACTIVAR"
    icon = "⏸" if new_status == "PAUSED" else "▶"

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar", callback_data="tgl_yes"),
        InlineKeyboardButton("❌ Cancelar", callback_data="tgl_no"),
    ]])
    await query.edit_message_text(
        f"¿Confirmás {action_label}?\n\n{icon} <b>{context.user_data['tgl_name']}</b>",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return CONFIRM_TOGGLE


async def toggle_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "tgl_no":
        await query.edit_message_text("Cancelado.")
        context.user_data.clear()
        return ConversationHandler.END

    campaign_id = context.user_data["tgl_id"]
    new_status = context.user_data["tgl_status"]
    name = context.user_data["tgl_name"]

    await query.edit_message_text("⏳ Ejecutando en Meta Ads...")

    try:
        MetaClient().update_campaign_status(campaign_id, new_status)
        from db.client import get_client
        get_client().table("campaigns").update({"status": new_status}).eq("id", campaign_id).execute()

        icon = "⏸" if new_status == "PAUSED" else "🟢"
        verb = "pausada" if new_status == "PAUSED" else "activada"
        await query.message.reply_text(
            f"{icon} <b>{name}</b> {verb} exitosamente.",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.error(f"Toggle status error: {e}")
        await query.message.reply_text(f"❌ Error: {str(e)[:200]}")

    context.user_data.clear()
    return ConversationHandler.END


# ─── PRESUPUESTO ──────────────────────────────────────────────────────────────

async def cmd_presupuesto(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    campaigns = queries.get_campaigns()
    with_budget = [c for c in campaigns if c["status"] != "ARCHIVED" and c.get("daily_budget")]

    if not with_budget:
        await update.message.reply_text(
            "No hay campañas con presupuesto diario configurado.\n"
            "Las campañas con presupuesto de conjunto (ABO) se editan desde el ad set."
        )
        return ConversationHandler.END

    accounts = queries.get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    lines = ["💰 <b>Cambiar presupuesto diario</b>\n<i>Seleccioná una campaña:</i>\n"]
    keyboard = []

    for c in sorted(with_budget, key=lambda x: x["status"] != "ACTIVE"):
        emoji = STATUS_EMOJI.get(c["status"], "⚪")
        budget = c["daily_budget"] / 100
        lines.append(f"{emoji} {c['name'][:50]} — ${budget:,.0f} {currency}")
        keyboard.append([InlineKeyboardButton(
            f"{c['name'][:35]} (${budget:,.0f})",
            callback_data=f"bdg_{c['id']}",
        )])

    keyboard.append([InlineKeyboardButton("❌ Cancelar", callback_data="bdg_cancel")])

    await update.message.reply_text(
        "\n".join(lines),
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return SELECT_BUDGET


async def budget_selected(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "bdg_cancel":
        await query.edit_message_text("Cancelado.")
        return ConversationHandler.END

    campaign_id = query.data[4:]  # strip "bdg_"
    campaigns = queries.get_campaigns()
    c = next((c for c in campaigns if c["id"] == campaign_id), None)
    accounts = queries.get_accounts()
    currency = accounts[0]["currency"] if accounts else "ARS"

    context.user_data["bdg_id"] = campaign_id
    context.user_data["bdg_name"] = c["name"] if c else campaign_id
    context.user_data["bdg_current"] = (c["daily_budget"] / 100) if c and c.get("daily_budget") else 0
    context.user_data["bdg_currency"] = currency

    await query.edit_message_text(
        f"Campaña: <b>{context.user_data['bdg_name']}</b>\n"
        f"Presupuesto actual: <b>${context.user_data['bdg_current']:,.0f} {currency}</b>\n\n"
        f"Escribí el nuevo presupuesto diario (solo el número, ej: 5000):",
        parse_mode="HTML",
    )
    return ENTER_BUDGET


async def budget_amount(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        amount = float(update.message.text.replace(",", ".").replace("$", "").strip())
        if amount <= 0:
            raise ValueError
        context.user_data["bdg_new"] = amount
    except ValueError:
        await update.message.reply_text("Enviá solo el número. Ej: 5000")
        return ENTER_BUDGET

    old = context.user_data["bdg_current"]
    new = amount
    currency = context.user_data["bdg_currency"]
    name = context.user_data["bdg_name"]
    pct = ((new - old) / old * 100) if old > 0 else 0
    pct_str = f"+{pct:.0f}%" if pct >= 0 else f"{pct:.0f}%"

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar", callback_data="bdg_yes"),
        InlineKeyboardButton("❌ Cancelar", callback_data="bdg_no"),
    ]])
    await update.message.reply_text(
        f"💰 <b>Confirmar cambio de presupuesto</b>\n\n"
        f"Campaña: <b>{name}</b>\n"
        f"Actual: ${old:,.0f} {currency}\n"
        f"Nuevo: <b>${new:,.0f} {currency}</b> ({pct_str})\n\n"
        f"¿Confirmás?",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    return CONFIRM_BUDGET


async def budget_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "bdg_no":
        await query.edit_message_text("Cancelado.")
        context.user_data.clear()
        return ConversationHandler.END

    campaign_id = context.user_data["bdg_id"]
    new_amount = context.user_data["bdg_new"]
    name = context.user_data["bdg_name"]
    currency = context.user_data["bdg_currency"]
    cents = int(new_amount * 100)

    await query.edit_message_text("⏳ Aplicando en Meta Ads...")

    try:
        MetaClient().update_campaign_budget(campaign_id, cents)
        from db.client import get_client
        get_client().table("campaigns").update({"daily_budget": cents}).eq("id", campaign_id).execute()

        await query.message.reply_text(
            f"✅ <b>Presupuesto actualizado</b>\n\n"
            f"Campaña: <b>{name}</b>\n"
            f"Nuevo diario: <b>${new_amount:,.0f} {currency}</b>",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.error(f"Budget update error: {e}")
        await query.message.reply_text(f"❌ Error: {str(e)[:200]}")

    context.user_data.clear()
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


def get_gestionar_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("gestionar", cmd_gestionar)],
        states={
            SELECT_TOGGLE: [CallbackQueryHandler(toggle_selected, pattern="^tgl_")],
            CONFIRM_TOGGLE: [CallbackQueryHandler(toggle_confirm, pattern="^tgl_(yes|no)$")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
    )


def get_presupuesto_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("presupuesto", cmd_presupuesto)],
        states={
            SELECT_BUDGET: [CallbackQueryHandler(budget_selected, pattern="^bdg_")],
            ENTER_BUDGET: [MessageHandler(filters.TEXT & ~filters.COMMAND, budget_amount)],
            CONFIRM_BUDGET: [CallbackQueryHandler(budget_confirm, pattern="^bdg_(yes|no)$")],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
    )
