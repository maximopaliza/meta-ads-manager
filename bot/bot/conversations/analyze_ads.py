"""
analyze_ads.py — /analizar: análisis de creativos + métricas de ads existentes en Meta.

Flujo:
  /analizar → lista ads activos con métricas
           → usuario elige cuáles analizar
           → bot obtiene video del creativo (Drive o Meta)
           → Gemini analiza creativo + métricas
           → reporte por ad: ángulo, diagnóstico, recomendación, copy mejorado
"""
import logging
import asyncio
from datetime import date, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes, ConversationHandler, CommandHandler,
    MessageHandler, CallbackQueryHandler, filters,
)

logger = logging.getLogger(__name__)

(PICK_ADS, CONFIRM_ANALYZE) = range(20, 22)

RECOMMENDATION_EMOJI = {
    "escalar": "🚀",
    "pausar": "⏸️",
    "cambiar_copy": "✏️",
    "esperar_datos": "⏳",
    "optimizar": "🔧",
}


def _get_ad_metrics_summary(ad_id: str) -> str:
    """Formatea las métricas del ad para pasarle a Gemini."""
    from db.queries import get_ad_metrics_all
    metrics = get_ad_metrics_all(ad_id)
    if not metrics:
        return "Sin métricas disponibles."

    rows = sorted([m for m in metrics if (m.get("spend") or 0) > 0], key=lambda x: x["date"])
    days = len(rows)
    total_spend = sum(m.get("spend", 0) for m in rows)
    total_purchases = sum(m.get("purchases", 0) for m in rows)
    total_atc = sum(m.get("add_to_cart", 0) for m in rows)
    avg_cpa = total_spend / total_purchases if total_purchases > 0 else None
    avg_roas = sum(m.get("purchase_value", 0) for m in rows) / total_spend if total_spend > 0 else None
    avg_ctr = sum(m.get("ctr", 0) or 0 for m in rows) / days if days > 0 else None
    avg_cpm = sum(m.get("cpm", 0) or 0 for m in rows) / days if days > 0 else None

    lines = [
        f"Días activos: {days}",
        f"Gasto total: ${total_spend:.2f}",
        f"Ventas: {total_purchases}",
        f"Add to cart: {total_atc}",
        f"CPA promedio: ${avg_cpa:.2f}" if avg_cpa else "CPA: sin ventas",
        f"ROAS promedio: {avg_roas:.2f}x" if avg_roas else "ROAS: sin ventas",
        f"CTR promedio: {avg_ctr:.2f}%" if avg_ctr else "CTR: sin datos",
        f"CPM promedio: ${avg_cpm:.2f}" if avg_cpm else "CPM: sin datos",
    ]

    if rows:
        last = rows[-1]
        lines.append(f"\nÚltimo día ({last['date']}): ventas={last.get('purchases',0)}, gasto=${last.get('spend',0):.2f}")

    return "\n".join(lines)


def _get_creative_analysis(ad: dict) -> str:
    """Obtiene el análisis del creativo — desde cache Drive o nombre del ad."""
    drive_file_id = ad.get("drive_file_id")

    if drive_file_id:
        try:
            from db.client import get_client
            res = get_client().table("video_analysis").select("*").eq("drive_file_id", drive_file_id).execute()
            if res.data:
                cached = res.data[0]
                return (
                    f"Ángulo detectado: {cached.get('angle', 'desconocido')}\n"
                    f"Análisis: {cached.get('analysis', '')}\n"
                    f"Copy actual — Texto: {cached.get('primary_text', '')}\n"
                    f"Copy actual — Titular: {cached.get('headline', '')}"
                )
        except Exception:
            pass

    # Sin análisis previo — usar solo el nombre del ad como contexto
    return f"Nombre del ad: {ad.get('name', '')}\nSin análisis de creativo disponible (video no analizado previamente)."


async def _analyze_one_ad(ad: dict, progress_msg, idx: int, total: int) -> dict:
    """Analiza un ad: creativo + métricas. Devuelve el resultado de Gemini."""
    try:
        await progress_msg.edit_text(
            f"🔍 Analizando <b>{idx}/{total}</b>: {ad['name'][:40]}...",
            parse_mode="HTML"
        )
    except Exception:
        pass

    loop = asyncio.get_event_loop()

    # Si tiene drive_file_id y no está en cache, analizar video
    drive_file_id = ad.get("drive_file_id")
    if drive_file_id:
        try:
            from db.client import get_client
            res = get_client().table("video_analysis").select("id").eq("drive_file_id", drive_file_id).execute()
            if not res.data:
                from ai.video_analyzer import analyze_video
                await loop.run_in_executor(None, analyze_video, drive_file_id, ad.get("name", ""), "")
        except Exception as e:
            logger.warning(f"Could not pre-analyze video for {ad['id']}: {e}")

    creative_analysis = await loop.run_in_executor(None, _get_creative_analysis, ad)
    metrics_summary = await loop.run_in_executor(None, _get_ad_metrics_summary, ad["id"])

    from ai.analyst import analyze_ad_full
    result = await loop.run_in_executor(None, analyze_ad_full, creative_analysis, metrics_summary)
    result["ad_name"] = ad["name"]
    result["ad_id"] = ad["id"]
    result["ad_status"] = ad.get("status", "")
    return result


def _format_ad_report(result: dict) -> str:
    """Formatea el reporte de un ad para Telegram."""
    emoji = RECOMMENDATION_EMOJI.get(result.get("recommendation", ""), "📊")
    name = result.get("ad_name", "")[:45]
    angle = result.get("angle", "sin datos")
    rec = result.get("recommendation", "")
    rec_detail = result.get("recommendation_detail", "")
    whats_working = result.get("whats_working", "")
    whats_wrong = result.get("whats_wrong", "")
    metrics_diag = result.get("metrics_diagnosis", "")
    suggested_text = result.get("suggested_primary_text")
    suggested_headline = result.get("suggested_headline")

    lines = [
        f"{emoji} <b>{name}</b>",
        f"Ángulo: <code>{angle}</code>",
        "",
        f"📊 {metrics_diag}" if metrics_diag else "",
        f"✅ {whats_working}" if whats_working else "",
        f"⚠️ {whats_wrong}" if whats_wrong else "",
        f"💡 <b>{rec.upper()}</b> — {rec_detail}" if rec_detail else "",
    ]

    if suggested_text or suggested_headline:
        lines += ["", "✏️ <b>Copy sugerido:</b>"]
        if suggested_text:
            lines.append(f"<i>{suggested_text}</i>")
        if suggested_headline:
            lines.append(f"<b>{suggested_headline}</b>")

    return "\n".join(l for l in lines if l)


# ── Handlers ──────────────────────────────────────────────────────────────────

async def start_analyze(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    msg = await update.message.reply_text("⏳ Cargando ads...")

    from db.queries import get_campaigns, get_ad_metrics_all
    from db.client import get_client

    try:
        res = get_client().table("ads").select("id,name,status,ad_set_id,drive_file_id").execute()
        ads = res.data or []
    except Exception as e:
        await msg.edit_text(f"❌ Error: {e}")
        return ConversationHandler.END

    if not ads:
        await msg.edit_text("No hay ads en la base de datos. Ejecutá /sync primero.")
        return ConversationHandler.END

    # Traer métricas de hoy y últimos 7 días para mostrar resumen
    today = date.today().isoformat()
    week_ago = (date.today() - timedelta(days=7)).isoformat()

    ads_with_metrics = []
    for ad in ads:
        metrics = get_ad_metrics_all(ad["id"])
        recent = [m for m in metrics if m.get("date", "") >= week_ago]
        spend_7d = sum(m.get("spend", 0) for m in recent)
        purchases_7d = sum(m.get("purchases", 0) for m in recent)
        cpa_7d = spend_7d / purchases_7d if purchases_7d > 0 else None
        ads_with_metrics.append({
            **ad,
            "spend_7d": spend_7d,
            "purchases_7d": purchases_7d,
            "cpa_7d": cpa_7d,
        })

    # Ordenar: activos primero, luego por gasto
    ads_with_metrics.sort(key=lambda x: (x["status"] != "ACTIVE", -x["spend_7d"]))
    context.user_data["ads_list"] = ads_with_metrics

    try:
        await msg.delete()
    except Exception:
        pass

    lines = ["📋 <b>Ads disponibles</b> (últimos 7 días):\n"]
    for i, a in enumerate(ads_with_metrics[:20], 1):
        status_icon = "🟢" if a["status"] == "ACTIVE" else "⏸️"
        cpa_str = f"CPA ${a['cpa_7d']:.2f}" if a["cpa_7d"] else ("sin ventas" if a["spend_7d"] > 0 else "sin gasto")
        lines.append(f"<code>{i:2d}.</code> {status_icon} {a['name'][:40]}\n      ${a['spend_7d']:.2f} gastado · {cpa_str}")

    lines.append("\n¿Cuáles analizamos? Escribí los números (ej: <code>1,3,5</code>) o <code>todos</code>")
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🟢 Solo activos", callback_data="analyze_active")],
        [InlineKeyboardButton("📋 Todos", callback_data="analyze_all")],
        [InlineKeyboardButton("❌ Cancelar", callback_data="analyze_cancel")],
    ])
    await update.message.reply_text("\n".join(lines), parse_mode="HTML", reply_markup=keyboard)
    return PICK_ADS


async def pick_ads_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "analyze_cancel":
        await query.edit_message_text("Cancelado.")
        return ConversationHandler.END

    ads = context.user_data["ads_list"]

    if query.data == "analyze_all":
        selected = ads
    else:  # analyze_active
        selected = [a for a in ads if a["status"] == "ACTIVE"]
        if not selected:
            await query.edit_message_text("No hay ads activos. Intentá con 'Todos'.")
            return ConversationHandler.END

    context.user_data["selected_ads"] = selected
    await query.edit_message_text(f"🔍 Analizando {len(selected)} ad(s)...")
    return await _run_full_analysis(query.message, context, selected)


async def pick_ads_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip().lower()
    ads = context.user_data["ads_list"]

    if text in ("todos", "all"):
        selected = ads
    else:
        try:
            indices = [int(x.strip()) - 1 for x in text.split(",")]
            selected = [ads[i] for i in indices if 0 <= i < len(ads)]
        except (ValueError, IndexError):
            await update.message.reply_text("No entendí. Escribí números separados por coma. Ej: 1,3,5")
            return PICK_ADS

    if not selected:
        await update.message.reply_text("Ningún ad válido. Intentá de nuevo.")
        return PICK_ADS

    context.user_data["selected_ads"] = selected
    msg = await update.message.reply_text(f"🔍 Analizando {len(selected)} ad(s)...")
    return await _run_full_analysis(msg, context, selected)


async def _run_full_analysis(progress_msg, context: ContextTypes.DEFAULT_TYPE, ads: list) -> int:
    results = []
    for i, ad in enumerate(ads[:10], 1):  # máx 10 ads por análisis
        try:
            result = await _analyze_one_ad(ad, progress_msg, i, min(len(ads), 10))
            results.append(result)
        except Exception as e:
            logger.error(f"Analysis failed for {ad['id']}: {e}")
            results.append({
                "ad_name": ad["name"],
                "ad_id": ad["id"],
                "recommendation": "esperar_datos",
                "recommendation_detail": f"Error: {str(e)[:100]}",
                "angle": "sin_datos",
            })

    try:
        await progress_msg.delete()
    except Exception:
        pass

    # Enviar un mensaje por ad (para no superar límite de Telegram)
    for r in results:
        report = _format_ad_report(r)
        try:
            await progress_msg.reply_text(report, parse_mode="HTML")
        except Exception as e:
            logger.error(f"Error sending report: {e}")

    if len(ads) > 10:
        await progress_msg.reply_text(f"ℹ️ Se analizaron los primeros 10 de {len(ads)} ads.")

    context.user_data.clear()
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


def get_analyze_ads_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("analizar", start_analyze)],
        states={
            PICK_ADS: [
                CallbackQueryHandler(pick_ads_callback, pattern="^analyze_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, pick_ads_text),
            ],
        },
        fallbacks=[CommandHandler("cancelar", cancel)],
        per_user=True,
        per_chat=True,
        allow_reentry=True,
    )
