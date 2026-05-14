import os
import logging
import tempfile
import requests
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.adimage import AdImage
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad

logger = logging.getLogger(__name__)

OBJECTIVE_MAP = {
    "ventas": "OUTCOME_SALES",
    "trafico": "OUTCOME_TRAFFIC",
    "alcance": "OUTCOME_AWARENESS",
}

OPTIMIZATION_MAP = {
    "OUTCOME_SALES": "OFFSITE_CONVERSIONS",
    "OUTCOME_TRAFFIC": "LINK_CLICKS",
    "OUTCOME_AWARENESS": "REACH",
}

BILLING_MAP = {
    "OUTCOME_SALES": "IMPRESSIONS",
    "OUTCOME_TRAFFIC": "LINK_CLICKS",
    "OUTCOME_AWARENESS": "IMPRESSIONS",
}


def _get_account_id() -> str:
    from db.queries import get_accounts
    accounts = get_accounts()
    if not accounts:
        raise ValueError("No hay ad accounts sincronizadas. Ejecutá /sync primero.")
    return accounts[0]["id"]


def upload_image(image_path: str, account_id: str) -> str:
    account = AdAccount(account_id)
    img = AdImage(parent_id=account_id)
    img[AdImage.Field.filename] = image_path
    img.remote_create()
    return img[AdImage.Field.hash]


def build_campaign(spec: dict) -> dict:
    account_id = spec.get("account_id") or _get_account_id()
    objective_key = spec["objective"].lower()
    objective = OBJECTIVE_MAP.get(objective_key, "OUTCOME_SALES")

    campaign = Campaign(parent_id=account_id)
    campaign.update({
        Campaign.Field.name: spec["name"],
        Campaign.Field.objective: objective,
        Campaign.Field.status: Campaign.Status.paused,
        Campaign.Field.special_ad_categories: [],
    })
    campaign.remote_create(params={"status": "PAUSED"})
    campaign_id = campaign[Campaign.Field.id]
    logger.info(f"Campaign created: {campaign_id}")

    ad_set = AdSet(parent_id=account_id)
    daily_budget_cents = int(float(spec["daily_budget"]) * 100)
    ad_set.update({
        AdSet.Field.name: f"{spec['name']} — Ad Set",
        AdSet.Field.campaign_id: campaign_id,
        AdSet.Field.daily_budget: daily_budget_cents,
        AdSet.Field.billing_event: BILLING_MAP[objective],
        AdSet.Field.optimization_goal: OPTIMIZATION_MAP[objective],
        AdSet.Field.targeting: spec.get("targeting", {"geo_locations": {"countries": ["AR"]}}),
        AdSet.Field.status: AdSet.Status.paused,
        AdSet.Field.bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    })
    ad_set.remote_create()
    ad_set_id = ad_set[AdSet.Field.id]
    logger.info(f"Ad Set created: {ad_set_id}")

    image_hash = upload_image(spec["image_path"], account_id)

    creative = AdCreative(parent_id=account_id)
    creative.update({
        AdCreative.Field.name: f"{spec['name']} — Creative",
        AdCreative.Field.object_story_spec: {
            "page_id": spec.get("page_id", os.environ.get("META_PAGE_ID", "")),
            "link_data": {
                "message": spec.get("copy", ""),
                "link": spec.get("destination_url", "https://www.facebook.com"),
                "image_hash": image_hash,
                "call_to_action": {"type": "SHOP_NOW"},
            },
        },
    })
    creative.remote_create()
    creative_id = creative[AdCreative.Field.id]

    ad = Ad(parent_id=account_id)
    ad.update({
        Ad.Field.name: f"{spec['name']} — Anuncio",
        Ad.Field.adset_id: ad_set_id,
        Ad.Field.creative: {"creative_id": creative_id},
        Ad.Field.status: Ad.Status.paused,
    })
    ad.remote_create()
    ad_id = ad[Ad.Field.id]
    logger.info(f"Ad created: {ad_id}")

    return {
        "campaign_id": campaign_id,
        "ad_set_id": ad_set_id,
        "creative_id": creative_id,
        "ad_id": ad_id,
        "campaign_name": spec["name"],
    }
