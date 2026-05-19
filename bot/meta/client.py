import os
import time
import logging
import requests
from datetime import date, datetime, timezone, timedelta

def _today_arg() -> str:
    """Fecha actual en Argentina (UTC-3), sin DST."""
    return datetime.now(timezone(timedelta(hours=-3))).date().isoformat()

logger = logging.getLogger(__name__)

BASE_URL = "https://graph.facebook.com/v21.0"

ATC_ACTIONS = {"add_to_cart", "fb_mobile_add_to_cart", "omni_add_to_cart"}


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
            time.sleep(2)
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
                "updated_at": c.get("updated_time", _today_arg()),
            })
        return result

    def get_ad_sets(self, account_id: str) -> list[dict]:
        fields = "id,name,status,daily_budget,campaign_id,updated_time"
        data = self._get(f"{account_id}/adsets", {"fields": fields})
        result = []
        for s in data.get("data", []):
            result.append({
                "id": s["id"],
                "campaign_id": s.get("campaign_id"),
                "name": s["name"],
                "status": s["status"],
                "daily_budget": int(s["daily_budget"]) if s.get("daily_budget") else None,
                "updated_at": s.get("updated_time", _today_arg()),
            })
        return result

    def get_ads(self, account_id: str) -> list[dict]:
        fields = "id,name,status,adset_id,updated_time"
        data = self._get(f"{account_id}/ads", {"fields": fields})
        result = []
        for a in data.get("data", []):
            result.append({
                "id": a["id"],
                "ad_set_id": a.get("adset_id"),
                "name": a["name"],
                "status": a["status"],
                "creative_id": None,
                "updated_at": a.get("updated_time", _today_arg()),
            })
        return result

    def _parse_insights_row(self, row: dict, object_id: str, object_type: str) -> dict:
        actions = row.get("actions", [])
        action_values = row.get("action_values", [])

        # Purchases
        purchases = sum(int(a["value"]) for a in actions if a["action_type"] == "purchase")
        purchase_value = sum(float(av["value"]) for av in action_values if av["action_type"] == "purchase")

        # Add to cart (use highest value across all ATC variants)
        add_to_cart = 0
        for a in actions:
            if a["action_type"] in ATC_ACTIONS:
                add_to_cart = max(add_to_cart, int(a["value"]))

        # Landing page views
        landing_page_views = sum(int(a["value"]) for a in actions if a["action_type"] == "landing_page_view")

        # Checkout initiated (pagos iniciados)
        checkout_initiated = sum(int(a["value"]) for a in actions if a["action_type"] == "initiate_checkout")

        # Base metrics
        spend = float(row.get("spend", 0))
        impressions = int(row.get("impressions", 0))
        clicks = int(row.get("clicks", 0))
        link_clicks = int(row.get("inline_link_clicks", 0))          # non-unique — used for tráfico efectivo
        unique_link_clicks = int(row.get("unique_inline_link_clicks", 0))  # unique — shown as "clics únicos enlace"
        reach = int(row.get("reach", 0))

        cpc = float(row["cpc"]) if row.get("cpc") else (spend / link_clicks if link_clicks else None)
        cpm = float(row["cpm"]) if row.get("cpm") else (spend / impressions * 1000 if impressions else None)
        roas = purchase_value / spend if spend > 0 else None

        # CTR único = unique_link_clicks / reach  (matches Meta's "CTR único" display)
        ctr = (unique_link_clicks / reach * 100) if reach > 0 and unique_link_clicks > 0 else None
        cpa = (spend / purchases) if purchases > 0 else None
        cost_per_atc = (spend / add_to_cart) if add_to_cart > 0 else None

        # Video metrics
        # Hook Rate = video_view (3-second views) / impressions — matches Meta Ads Manager
        video_3s = sum(int(a["value"]) for a in actions if a["action_type"] == "video_view")
        hook_rate = (video_3s / impressions * 100) if impressions > 0 and video_3s > 0 else None

        video_avg_raw = row.get("video_avg_time_watched_actions", [])
        video_avg_time_watched = float(video_avg_raw[0]["value"]) if video_avg_raw else None

        return {
            "object_id": object_id,
            "object_type": object_type,
            "date": row.get("date_start", _today_arg()),
            "spend": spend,
            "impressions": impressions,
            "clicks": clicks,
            "link_clicks": link_clicks,
            "unique_link_clicks": unique_link_clicks,
            "reach": reach,
            "purchases": purchases,
            "purchase_value": purchase_value,
            "cpc": cpc,
            "cpm": cpm,
            "roas": roas,
            "frequency": float(row["frequency"]) if row.get("frequency") else None,
            "add_to_cart": add_to_cart,
            "cost_per_atc": cost_per_atc,
            "landing_page_views": landing_page_views,
            "hook_rate": hook_rate,
            "video_avg_time_watched": video_avg_time_watched,
            "ctr": ctr,
            "cpa": cpa,
            "checkout_initiated": checkout_initiated,
        }

    def _insights_fields(self, id_field: str) -> str:
        return (
            f"spend,impressions,clicks,inline_link_clicks,unique_inline_link_clicks,reach,"
            f"actions,action_values,"
            f"cpc,cpm,frequency,date_start,"
            f"video_play_actions,video_avg_time_watched_actions,{id_field}"
        )

    def get_account_insights(self, account_id: str, date_preset: str, level: str = "campaign") -> list[dict]:
        id_field = "campaign_id" if level == "campaign" else "adset_id"
        object_type = "campaign" if level == "campaign" else "ad_set"

        data = self._get(f"{account_id}/insights", {
            "fields": self._insights_fields(id_field),
            "level": level,
            "date_preset": date_preset,
            "time_increment": 1,
        })
        result = []
        for row in data.get("data", []):
            obj_id = row.get(id_field, account_id)
            result.append(self._parse_insights_row(row, obj_id, object_type))
        return result
