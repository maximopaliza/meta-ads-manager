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

            # Campaigns
            campaigns = client.get_campaigns(account_id)
            for campaign in campaigns:
                queries.upsert_campaign(campaign)

            # Ad Sets
            try:
                ad_sets = client.get_ad_sets(account_id)
                for ad_set in ad_sets:
                    queries.upsert_ad_set(ad_set)
                logger.info(f"Synced {len(ad_sets)} ad sets for {account_id}")
            except Exception as e:
                logger.warning(f"Ad sets sync failed for {account_id}: {e}")

            # Ads (with thumbnails)
            try:
                ads = client.get_ads(account_id)
                for ad in ads:
                    queries.upsert_ad(ad)
                logger.info(f"Synced {len(ads)} ads for {account_id}")
            except Exception as e:
                logger.warning(f"Ads sync failed for {account_id}: {e}")

            # Campaign-level insights (today + last 30d for full dashboard coverage)
            for preset in ("today", "last_7d", "last_30d"):
                try:
                    insights = client.get_account_insights(account_id, preset, level="campaign")
                    for insight in insights:
                        queries.upsert_metrics(insight)
                    logger.info(f"Synced {len(insights)} campaign insights ({preset}) for {account_id}")
                except Exception as e:
                    logger.warning(f"Campaign insights ({preset}) failed for {account_id}: {e}")

            # Ad Set-level insights (today + last 30d for full dashboard coverage)
            for preset in ("today", "last_7d", "last_30d"):
                try:
                    insights = client.get_account_insights(account_id, preset, level="adset")
                    for insight in insights:
                        queries.upsert_metrics(insight)
                    logger.info(f"Synced {len(insights)} adset insights ({preset}) for {account_id}")
                except Exception as e:
                    logger.warning(f"Adset insights ({preset}) failed for {account_id}: {e}")

            # Ad-level insights (today + last 30d)
            for preset in ("today", "last_7d", "last_30d"):
                try:
                    insights = client.get_account_insights(account_id, preset, level="ad")
                    for insight in insights:
                        queries.upsert_metrics(insight)
                    logger.info(f"Synced {len(insights)} ad insights ({preset}) for {account_id}")
                except Exception as e:
                    logger.warning(f"Ad insights ({preset}) failed for {account_id}: {e}")

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
