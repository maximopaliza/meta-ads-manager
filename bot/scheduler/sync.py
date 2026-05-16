import logging
import traceback
from meta.client import MetaClient
from db import queries

logger = logging.getLogger(__name__)

_sync_failures = 0
MAX_FAILURES = 3


def run_sync() -> None:
    global _sync_failures
    logger.info("Starting sync...")

    try:
        client = MetaClient()

        accounts = client.get_accounts()
        for account in accounts:
            queries.upsert_account(account)
            account_id = account["id"]
            logger.info(f"Syncing account: {account_id}")

            campaigns = client.get_campaigns(account_id)
            for campaign in campaigns:
                queries.upsert_campaign(campaign)

            today_insights = client.get_account_insights(account_id, "today")
            for insight in today_insights:
                queries.upsert_metrics(insight)

            week_insights = client.get_account_insights(account_id, "last_7d")
            for insight in week_insights:
                queries.upsert_metrics(insight)

            for campaign in campaigns:
                campaign_id = campaign["id"]
                ad_sets = client.get_ad_sets(campaign_id)
                for ad_set in ad_sets:
                    queries.upsert_ad_set(ad_set)

        _sync_failures = 0
        logger.info("Sync completed successfully")

    except Exception as e:
        _sync_failures += 1
        logger.error(f"Sync failed ({_sync_failures}/{MAX_FAILURES}): {e}\n{traceback.format_exc()}")

        if _sync_failures >= MAX_FAILURES:
            queries.insert_alert({
                "type": "anomaly",
                "severity": "critical",
                "title": "Sync fallando repetidamente",
                "message": f"El sync de Meta Ads falló {MAX_FAILURES} veces seguidas. Error: {str(e)[:200]}",
                "object_id": None,
                "sent_to_telegram": False,
            })
            _sync_failures = 0
