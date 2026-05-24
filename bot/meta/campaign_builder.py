import os
import logging
from pathlib import Path
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.adimage import AdImage
from facebook_business.adobjects.advideo import AdVideo
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


def _get_page_id() -> str:
    """Devuelve el META_PAGE_ID del env, o lo detecta automáticamente desde la API."""
    page_id = os.environ.get("META_PAGE_ID", "").strip()
    if page_id:
        return page_id

    # Auto-detect: busca páginas asociadas al access token
    try:
        import requests
        token = os.environ["META_ACCESS_TOKEN"]
        r = requests.get(
            "https://graph.facebook.com/v21.0/me/accounts",
            params={"access_token": token, "fields": "id,name"},
            timeout=30,
        )
        data = r.json()
        pages = data.get("data", [])
        if pages:
            page = pages[0]
            logger.info(f"Auto-detected page: {page['name']} ({page['id']})")
            return page["id"]
    except Exception as e:
        logger.error(f"Could not auto-detect page: {e}")

    raise ValueError(
        "No se encontró META_PAGE_ID. Agregalo en las variables de entorno de Railway."
    )


def _is_video(creative_path: str) -> bool:
    return Path(creative_path).suffix.lower() in (".mp4", ".mov", ".avi", ".mkv")


def upload_image(image_path: str, account_id: str) -> str:
    img = AdImage(parent_id=account_id)
    img[AdImage.Field.filename] = image_path
    img.remote_create()
    return img[AdImage.Field.hash]


def upload_video(video_path: str, account_id: str) -> str:
    """Sube un video a Meta y devuelve el video_id."""
    video = AdVideo(parent_id=account_id)
    video[AdVideo.Field.filepath] = video_path
    video.remote_create()
    return video[AdVideo.Field.id]


def build_campaign(spec: dict) -> dict:
    """
    Crea campaña completa en Meta Ads (PAUSED).
    spec debe tener:
      - name: str
      - objective: "ventas" | "trafico" | "alcance"
      - daily_budget: float (en moneda local)
      - targeting: dict (Meta targeting spec)
      - primary_text: str
      - headline: str
      - cta: str (ej: "SHOP_NOW")
      - destination_url: str
      - creative_path: str (ruta local al archivo)
      - account_id: str (opcional, usa el primero si no se pasa)
      - page_id: str (opcional, usa META_PAGE_ID del env)
    """
    account_id = spec.get("account_id") or _get_account_id()
    objective_key = spec["objective"].lower()
    objective = OBJECTIVE_MAP.get(objective_key, "OUTCOME_SALES")
    page_id = spec.get("page_id") or _get_page_id()
    destination_url = spec.get("destination_url", "")

    # 1. Campaña
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

    # 2. Ad Set
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

    # 3. Creative (imagen o video)
    creative_path = spec.get("creative_path", "")
    creative = AdCreative(parent_id=account_id)

    if creative_path and _is_video(creative_path):
        video_id = upload_video(creative_path, account_id)
        story_spec = {
            "page_id": page_id,
            "video_data": {
                "video_id": video_id,
                "message": spec.get("primary_text", ""),
                "title": spec.get("headline", ""),
                "link_description": spec.get("headline", ""),
                "call_to_action": {
                    "type": spec.get("cta", "SHOP_NOW"),
                    "value": {"link": destination_url},
                },
            },
        }
    else:
        image_hash = upload_image(creative_path, account_id)
        story_spec = {
            "page_id": page_id,
            "link_data": {
                "message": spec.get("primary_text", ""),
                "link": destination_url,
                "image_hash": image_hash,
                "name": spec.get("headline", ""),
                "call_to_action": {
                    "type": spec.get("cta", "SHOP_NOW"),
                    "value": {"link": destination_url},
                },
            },
        }

    creative.update({
        AdCreative.Field.name: f"{spec['name']} — Creative",
        AdCreative.Field.object_story_spec: story_spec,
    })
    creative.remote_create()
    creative_id = creative[AdCreative.Field.id]
    logger.info(f"Creative created: {creative_id}")

    # 4. Ad
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
