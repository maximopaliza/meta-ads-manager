import os
import logging
from datetime import date, timedelta
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.business import Business
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad

logger = logging.getLogger(__name__)


def _init_api():
    FacebookAdsApi.init(
        app_id=os.environ["META_APP_ID"],
        app_secret=os.environ["META_APP_SECRET"],
        access_token=os.environ["META_ACCESS_TOKEN"],
    )


class MetaClient:
    def __init__(self):
        _init_api()
        self.bm_id = os.environ["META_BM_ID"]

    def get_accounts(self) -> list[dict]:
        bm = Business(self.bm_id)
        accounts = bm.get_owned_ad_accounts(fields=["id", "name", "currency", "timezone_name"])
        result = []
        for acc in accounts:
            result.append({
                "id": acc["id"],
                "name": acc["name"],
                "currency": acc.get("currency", "USD"),
                "timezone": acc.get("timezone_name", "UTC"),
            })
        return result

    def get_campaigns(self, account_id: str) -> list[dict]:
        account = AdAccount(account_id)
        campaigns = account.get_campaigns(
            fields=["id", "name", "status", "objective", "daily_budget", "lifetime_budget", "created_time", "updated_time"]
        )
        result = []
        for c in campaigns:
            result.append({
                "id": c["id"],
                "account_id": account_id,
                "name": c["name"],
                "status": c["status"],
                "objective": c.get("objective"),
                "daily_budget": int(c["daily_budget"]) if c.get("daily_budget") else None,
                "lifetime_budget": int(c["lifetime_budget"]) if c.get("lifetime_budget") else None,
                "updated_at": c.get("updated_time", date.today().isoformat()),
            })
        return result

    def get_ad_sets(self, campaign_id: str) -> list[dict]:
        campaign = Campaign(campaign_id)
        ad_sets = campaign.get_ad_sets(
            fields=["id", "name", "status", "daily_budget", "targeting", "campaign_id", "updated_time"]
        )
        result = []
        for s in ad_sets:
            result.append({
                "id": s["id"],
                "campaign_id": campaign_id,
                "name": s["name"],
                "status": s["status"],
                "daily_budget": int(s["daily_budget"]) if s.get("daily_budget") else None,
                "targeting": dict(s["targeting"]) if s.get("targeting") else None,
                "updated_at": s.get("updated_time", date.today().isoformat()),
            })
        return result

    def get_ads(self, ad_set_id: str) -> list[dict]:
        ad_set = AdSet(ad_set_id)
        ads = ad_set.get_ads(fields=["id", "name", "status", "creative", "adset_id", "updated_time"])
        result = []
        for a in ads:
            result.append({
                "id": a["id"],
                "ad_set_id": ad_set_id,
                "name": a["name"],
                "status": a["status"],
                "creative_id": a.get("creative", {}).get("id"),
                "updated_at": a.get("updated_time", date.today().isoformat()),
            })
        return result

    def get_insights(self, object_id: str, level: str, date_preset: str) -> list[dict]:
        fields = [
            "spend", "impressions", "clicks", "actions", "action_values",
            "cpc", "cpm", "frequency", "date_start",
        ]
        params = {
            "level": level,
            "date_preset": date_preset,
            "time_increment": 1,
            "fields": ",".join(fields),
        }

        if level == "campaign":
            obj = AdAccount(f"act_{object_id.split('_')[-1]}" if not object_id.startswith("act_") else object_id)
            insights = obj.get_insights(params=params)
        else:
            from facebook_business.adobjects.adreportrun import AdReportRun
            if level == "adset":
                insights_obj = AdSet(object_id)
            else:
                insights_obj = Ad(object_id)
            insights = insights_obj.get_insights(params={"date_preset": date_preset, "time_increment": 1, "fields": ",".join(fields)})

        result = []
        for row in insights:
            purchases = 0
            purchase_value = 0.0
            for action in row.get("actions", []):
                if action["action_type"] == "purchase":
                    purchases += int(action["value"])
            for av in row.get("action_values", []):
                if av["action_type"] == "purchase":
                    purchase_value += float(av["value"])

            spend = float(row.get("spend", 0))
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cpc = float(row["cpc"]) if row.get("cpc") else (spend / clicks if clicks else None)
            cpm = float(row["cpm"]) if row.get("cpm") else (spend / impressions * 1000 if impressions else None)
            roas = purchase_value / spend if spend > 0 else None

            result.append({
                "object_id": object_id,
                "object_type": level.replace("adset", "ad_set"),
                "date": row.get("date_start", date.today().isoformat()),
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "purchases": purchases,
                "purchase_value": purchase_value,
                "cpc": cpc,
                "cpm": cpm,
                "roas": roas,
                "frequency": float(row["frequency"]) if row.get("frequency") else None,
            })
        return result

    def get_account_insights(self, account_id: str, date_preset: str) -> list[dict]:
        account = AdAccount(account_id)
        fields = ["spend", "impressions", "clicks", "actions", "action_values", "cpc", "cpm", "frequency", "date_start", "campaign_id"]
        params = {"level": "campaign", "date_preset": date_preset, "time_increment": 1, "fields": ",".join(fields)}
        insights = account.get_insights(params=params)
        result = []
        for row in insights:
            purchases = sum(int(a["value"]) for a in row.get("actions", []) if a["action_type"] == "purchase")
            purchase_value = sum(float(av["value"]) for av in row.get("action_values", []) if av["action_type"] == "purchase")
            spend = float(row.get("spend", 0))
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cpc = float(row["cpc"]) if row.get("cpc") else (spend / clicks if clicks else None)
            cpm = float(row["cpm"]) if row.get("cpm") else (spend / impressions * 1000 if impressions else None)
            roas = purchase_value / spend if spend > 0 else None
            result.append({
                "object_id": row.get("campaign_id", account_id),
                "object_type": "campaign",
                "date": row.get("date_start", date.today().isoformat()),
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "purchases": purchases, "purchase_value": purchase_value,
                "cpc": cpc, "cpm": cpm, "roas": roas,
                "frequency": float(row["frequency"]) if row.get("frequency") else None,
            })
        return result

    def get_adset_insights(self, campaign_id: str, date_preset: str) -> list[dict]:
        campaign = Campaign(campaign_id)
        fields = ["spend", "impressions", "clicks", "actions", "action_values", "cpc", "cpm", "frequency", "date_start", "adset_id"]
        params = {"level": "adset", "date_preset": date_preset, "time_increment": 1, "fields": ",".join(fields)}
        insights = campaign.get_insights(params=params)
        result = []
        for row in insights:
            purchases = sum(int(a["value"]) for a in row.get("actions", []) if a["action_type"] == "purchase")
            purchase_value = sum(float(av["value"]) for av in row.get("action_values", []) if av["action_type"] == "purchase")
            spend = float(row.get("spend", 0))
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cpc = float(row["cpc"]) if row.get("cpc") else (spend / clicks if clicks else None)
            cpm = float(row["cpm"]) if row.get("cpm") else (spend / impressions * 1000 if impressions else None)
            roas = purchase_value / spend if spend > 0 else None
            result.append({
                "object_id": row.get("adset_id", ""),
                "object_type": "ad_set",
                "date": row.get("date_start", date.today().isoformat()),
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "purchases": purchases, "purchase_value": purchase_value,
                "cpc": cpc, "cpm": cpm, "roas": roas,
                "frequency": float(row["frequency"]) if row.get("frequency") else None,
            })
        return result
