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

ATC_ACTIONS = {"add_to_cart", "fb_mobile_add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"}
PURCHASE_ACTIONS = {"purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "fb_pixel_purchase"}
CHECKOUT_ACTIONS = {"initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"}


class MetaClient:
    def __init__(self):
        self.token = os.environ["META_ACCESS_TOKEN"]

    def _get(self, path: str, params: dict = None) -> dict:
        p = {"access_token": self.token, **(params or {})}
        for attempt in range(3):
            r = requests.get(f"{BASE_URL}/{path}", params=p, timeout=60)
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

    def _get_all_pages(self, path: str, params: dict = None) -> list[dict]:
        """Igual que _get pero sigue la paginación automáticamente."""
        results = []
        p = {"access_token": self.token, **(params or {})}
        url = f"{BASE_URL}/{path}"
        while url:
            for attempt in range(3):
                r = requests.get(url, params=p, timeout=60)
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
                break
            else:
                raise Exception("Rate limit exceeded after retries")
            results.extend(data.get("data", []))
            # Paginación: si hay next, seguir. Después de la primera página limpiar params (ya van en la URL)
            next_url = data.get("paging", {}).get("next")
            url = next_url
            p = {}  # params ya están en la URL de next
        return results

    def _post(self, path: str, data: dict) -> dict:
        params = {"access_token": self.token}
        r = requests.post(f"{BASE_URL}/{path}", params=params, data=data, timeout=30)
        result = r.json()
        if "error" in result:
            raise Exception(result["error"].get("message", str(result["error"])))
        return result

    def update_campaign_status(self, campaign_id: str, status: str) -> bool:
        result = self._post(campaign_id, {"status": status})
        return result.get("success", False)

    def update_campaign_budget(self, campaign_id: str, daily_budget_cents: int) -> bool:
        result = self._post(campaign_id, {"daily_budget": str(daily_budget_cents)})
        return result.get("success", False)

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

        # Purchases — accept all Meta purchase action types, take max to avoid double-counting
        purchases = max((int(a["value"]) for a in actions if a["action_type"] in PURCHASE_ACTIONS), default=0)
        purchase_value = max((float(av["value"]) for av in action_values if av["action_type"] in PURCHASE_ACTIONS), default=0.0)

        # Add to cart — take max across all ATC variants to avoid double-counting
        add_to_cart = max((int(a["value"]) for a in actions if a["action_type"] in ATC_ACTIONS), default=0)

        # Landing page views
        landing_page_views = sum(int(a["value"]) for a in actions if a["action_type"] == "landing_page_view")

        # Checkout initiated (pagos iniciados) — take max across variants
        checkout_initiated = max((int(a["value"]) for a in actions if a["action_type"] in CHECKOUT_ACTIONS), default=0)

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

        # Video retention milestones (count of people who watched to each %)
        def _video_pct(field: str) -> int | None:
            raw = row.get(field, [])
            if not raw:
                return None
            try:
                return int(float(raw[0]["value"]))
            except (KeyError, IndexError, ValueError, TypeError):
                return None

        video_p25 = _video_pct("video_p25_watched_actions")
        video_p50 = _video_pct("video_p50_watched_actions")
        video_p75 = _video_pct("video_p75_watched_actions")
        video_p95 = _video_pct("video_p95_watched_actions")
        video_thruplay = _video_pct("video_thruplay_watched_actions")

        # Hold Rate = % of 3s viewers who watched ≥50% of the video
        # Tells you if the video body holds attention after the hook
        hold_rate = (video_p50 / video_3s * 100) if video_3s and video_p50 else None

        # ThruPlay Rate = ThruPlays / impressions × 100
        # How many people who saw the ad watched it to 95%+ (or 15s for longer videos)
        thruplay_rate = (video_thruplay / impressions * 100) if impressions > 0 and video_thruplay else None

        # CTR post-view = link_clicks / 3s_views × 100
        # Of people who watched 3s, what % clicked — measures offer/CTA effectiveness
        ctr_post_view = (unique_link_clicks / video_3s * 100) if video_3s > 0 else None

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
            "video_3s_views": video_3s if video_3s > 0 else None,
            "video_p25_watched": video_p25,
            "video_p50_watched": video_p50,
            "video_p75_watched": video_p75,
            "video_p95_watched": video_p95,
            "video_thruplay": video_thruplay,
            "hold_rate": hold_rate,
            "thruplay_rate": thruplay_rate,
            "ctr_post_view": ctr_post_view,
            "ctr": ctr,
            "cpa": cpa,
            "checkout_initiated": checkout_initiated,
        }

    def _insights_fields(self, id_field: str) -> str:
        return (
            f"spend,impressions,clicks,inline_link_clicks,unique_inline_link_clicks,reach,"
            f"actions,action_values,"
            f"cpc,cpm,frequency,date_start,"
            f"video_avg_time_watched_actions,"
            f"video_p25_watched_actions,video_p50_watched_actions,"
            f"video_p75_watched_actions,video_p95_watched_actions,"
            f"video_thruplay_watched_actions,"
            f"{id_field}"
        )

    def get_account_insights(self, account_id: str, date_preset: str, level: str = "campaign") -> list[dict]:
        if level == "campaign":
            id_field = "campaign_id"
            object_type = "campaign"
        elif level == "adset":
            id_field = "adset_id"
            object_type = "ad_set"
        else:
            id_field = "ad_id"
            object_type = "ad"

        rows = self._get_all_pages(f"{account_id}/insights", {
            "fields": self._insights_fields(id_field),
            "level": level,
            "date_preset": date_preset,
            "time_increment": 1,
            "use_account_attribution_setting": True,
            "limit": 500,
        })
        return [self._parse_insights_row(row, row.get(id_field, account_id), object_type) for row in rows]

    def get_insights_date_range(self, account_id: str, since: str, until: str, level: str = "campaign") -> list[dict]:
        """Trae insights por rango de fechas específico (para backfill histórico)."""
        if level == "campaign":
            id_field = "campaign_id"
            object_type = "campaign"
        elif level == "adset":
            id_field = "adset_id"
            object_type = "ad_set"
        else:
            id_field = "ad_id"
            object_type = "ad"

        import json
        rows = self._get_all_pages(f"{account_id}/insights", {
            "fields": self._insights_fields(id_field),
            "level": level,
            "time_range": json.dumps({"since": since, "until": until}),
            "time_increment": 1,
            "use_account_attribution_setting": True,
            "limit": 500,
        })
        return [self._parse_insights_row(row, row.get(id_field, account_id), object_type) for row in rows]
