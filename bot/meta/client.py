import os
import time
import logging
import requests
from datetime import date

logger = logging.getLogger(__name__)

BASE_URL = "https://graph.facebook.com/v21.0"


class MetaClient:
    def __init__(self):
        self.token = os.environ["META_ACCESS_TOKEN"]

    def _get(self, path: str, params: dict = None) -> dict:
        p = {"access_token": self.token, **(params or {})}
        for attempt in range(3):
            r = requests.get(f"{BASE_URL}/{path}", params=p, timeout=30)
            data = r.json()
            if "error" in data:
                code = data["error"].get("code", 0)
                msg = data["error"].get("message", str(data["error"]))
                if code in (17, 80004) or "limit" in msg.lower():
                    wait = 60 * (attempt + 1)
                    logger.warning(f"Rate limit hit, waiting {wait}s...")
                    time.sleep(wait)
                    continue
                raise Exception(msg)
            time.sleep(0.3)
            return data
        raise Exception("Rate limit exceeded after retries")

    def get_accounts(self) -> list[dict]:
        data = self._get("me/adaccounts", {"fields": "id,name,currency,timezone_name"})
        result = []
        for acc in data.get("data", []):
            result.append({
                "id": acc["id"],
                "name": acc["name"],
                "currency": acc.get("currency", "USD"),
                "timezone": acc.get("timezone_name", "UTC"),
            })
        return result

    def get_campaigns(self, account_id: str) -> list[dict]:
        fields = "id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time"
        data = self._get(f"{account_id}/campaigns", {"fields": fields})
        result = []
        for c in data.get("data", []):
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
        fields = "id,name,status,daily_budget,targeting,campaign_id,updated_time"
        data = self._get(f"{campaign_id}/adsets", {"fields": fields})
        result = []
        for s in data.get("data", []):
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
        fields = "id,name,status,creative,adset_id,updated_time"
        data = self._get(f"{ad_set_id}/ads", {"fields": fields})
        result = []
        for a in data.get("data", []):
            result.append({
                "id": a["id"],
                "ad_set_id": ad_set_id,
                "name": a["name"],
                "status": a["status"],
                "creative_id": a.get("creative", {}).get("id"),
                "updated_at": a.get("updated_time", date.today().isoformat()),
            })
        return result

    def _parse_insights_row(self, row: dict, object_id: str, object_type: str) -> dict:
        purchases = sum(int(a["value"]) for a in row.get("actions", []) if a["action_type"] == "purchase")
        purchase_value = sum(float(av["value"]) for av in row.get("action_values", []) if av["action_type"] == "purchase")
        spend = float(row.get("spend", 0))
        impressions = int(row.get("impressions", 0))
        clicks = int(row.get("clicks", 0))
        cpc = float(row["cpc"]) if row.get("cpc") else (spend / clicks if clicks else None)
        cpm = float(row["cpm"]) if row.get("cpm") else (spend / impressions * 1000 if impressions else None)
        roas = purchase_value / spend if spend > 0 else None
        return {
            "object_id": object_id,
            "object_type": object_type,
            "date": row.get("date_start", date.today().isoformat()),
            "spend": spend, "impressions": impressions, "clicks": clicks,
            "purchases": purchases, "purchase_value": purchase_value,
            "cpc": cpc, "cpm": cpm, "roas": roas,
            "frequency": float(row["frequency"]) if row.get("frequency") else None,
        }

    def get_account_insights(self, account_id: str, date_preset: str) -> list[dict]:
        fields = "spend,impressions,clicks,actions,action_values,cpc,cpm,frequency,date_start,campaign_id"
        data = self._get(f"{account_id}/insights", {
            "fields": fields, "level": "campaign",
            "date_preset": date_preset, "time_increment": 1,
        })
        result = []
        for row in data.get("data", []):
            result.append(self._parse_insights_row(row, row.get("campaign_id", account_id), "campaign"))
        return result

    def get_adset_insights(self, campaign_id: str, date_preset: str) -> list[dict]:
        fields = "spend,impressions,clicks,actions,action_values,cpc,cpm,frequency,date_start,adset_id"
        data = self._get(f"{campaign_id}/insights", {
            "fields": fields, "level": "adset",
            "date_preset": date_preset, "time_increment": 1,
        })
        result = []
        for row in data.get("data", []):
            result.append(self._parse_insights_row(row, row.get("adset_id", ""), "ad_set"))
        return result
