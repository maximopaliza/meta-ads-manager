import logging
import os
from db import queries

logger = logging.getLogger(__name__)

SEVERITY_EMOJI = {
    "info": "💡",
    "warning": "⚠️",
    "critical": "🔴",
}

TYPE_LABEL = {
    "anomaly": "Anomalía",
    "recommendation": "Recomendación",
    "milestone": "Hito",
}

_bot_app = None


def set_bot(app) -> None:
    global _bot_app
    _bot_app = app


def _format_message(alert: dict) -> str:
    emoji = SEVERITY_EMOJI.get(alert["severity"], "📢")
    type_label = TYPE_LABEL.get(alert["type"], alert["type"])
    return (
        f"{emoji} <b>{alert['title']}</b>\n"
        f"<i>{type_label}</i>\n\n"
        f"{alert['message']}"
    )


async def run_alerter() -> None:
    if _bot_app is None:
        logger.warning("Bot not initialized in alerter")
        return

    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    unsent = queries.get_unsent_alerts()

    for alert in unsent:
        try:
            message = _format_message(alert)
            await _bot_app.bot.send_message(
                chat_id=chat_id,
                text=message,
                parse_mode="HTML",
            )
            queries.mark_alert_sent(alert["id"])
            logger.info(f"Alert sent: {alert['id']}")
        except Exception as e:
            logger.error(f"Failed to send alert {alert['id']}: {e}")
