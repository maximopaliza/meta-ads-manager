import os
import asyncio
import logging
from dotenv import load_dotenv

load_dotenv()

# Forzar timezone Argentina en todo el proceso
os.environ["TZ"] = "America/Argentina/Buenos_Aires"
try:
    import time
    time.tzset()
except AttributeError:
    pass  # Windows no tiene tzset, en Railway (Linux) sí funciona

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

from telegram.ext import Application, MessageHandler, CallbackQueryHandler, filters
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from bot.handlers import get_handlers, handle_text, handle_nl_action
from bot.conversations.create_campaign import get_create_campaign_handler
from bot.conversations.manage_campaigns import get_gestionar_handler, get_presupuesto_handler
from bot.conversations.analyze_ads import get_analyze_ads_handler
from scheduler import alerter


async def sync_job() -> None:
    try:
        from scheduler.sync import run_sync
        run_sync()
        logger.info("Scheduled sync completed")
    except Exception as e:
        logger.error(f"Scheduled sync failed: {e}")


async def categorizer_job() -> None:
    try:
        from scheduler.video_categorizer import run_categorizer
        run_categorizer()
    except Exception as e:
        logger.error(f"Categorizer failed: {e}")


async def analysis_job() -> None:
    try:
        from scheduler.analyzer import run_analysis
        run_analysis()
    except Exception as e:
        logger.error(f"Scheduled analysis failed: {e}")


async def alerter_job() -> None:
    await alerter.run_alerter()


def main() -> None:
    token = os.environ["TELEGRAM_BOT_TOKEN"]

    app = Application.builder().token(token).build()
    alerter.set_bot(app)

    app.add_handler(get_create_campaign_handler())
    app.add_handler(get_gestionar_handler())
    app.add_handler(get_presupuesto_handler())
    app.add_handler(get_analyze_ads_handler())

    for handler in get_handlers():
        app.add_handler(handler)

    app.add_handler(CallbackQueryHandler(handle_nl_action, pattern="^nlact_"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    from pytz import timezone as pytz_tz
    tz_arg = pytz_tz("America/Argentina/Buenos_Aires")
    scheduler = AsyncIOScheduler(timezone=tz_arg)
    scheduler.add_job(sync_job, IntervalTrigger(minutes=15, timezone=tz_arg), id="sync", replace_existing=True)
    scheduler.add_job(alerter_job, IntervalTrigger(minutes=5, timezone=tz_arg), id="alerter", replace_existing=True)
    # Categoriza videos de Drive 2 min después del sync (para tener datos frescos)
    scheduler.add_job(categorizer_job, IntervalTrigger(minutes=17, timezone=tz_arg), id="categorizer", replace_existing=True)
    # Análisis profundo una vez al día a las 23:00 Argentina
    scheduler.add_job(analysis_job, CronTrigger(hour=23, minute=0, timezone=tz_arg), id="analysis", replace_existing=True)

    async def post_init(app):
        scheduler.start()
        logger.info("Scheduler started")
        await sync_job()

    async def post_shutdown(app):
        if scheduler.running:
            scheduler.shutdown()

    app.post_init = post_init
    app.post_shutdown = post_shutdown

    logger.info("Starting bot...")
    app.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    main()
