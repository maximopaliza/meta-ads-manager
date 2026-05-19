from datetime import datetime, date, timedelta, timezone, timedelta as td
from .client import get_client

def today_arg() -> str:
    """Fecha de hoy en timezone Argentina (UTC-3)."""
    return datetime.now(timezone(td(hours=-3))).date().isoformat()


def upsert_account(account: dict) -> None:
    get_client().table("ad_accounts").upsert(account).execute()


def upsert_campaign(campaign: dict) -> None:
    get_client().table("campaigns").upsert(campaign).execute()


def upsert_ad_set(ad_set: dict) -> None:
    get_client().table("ad_sets").upsert(ad_set).execute()


def upsert_ad(ad: dict) -> None:
    get_client().table("ads").upsert(ad).execute()


def upsert_metrics(metrics: dict) -> None:
    get_client().table("metrics").upsert(metrics, on_conflict="object_id,object_type,date").execute()


def insert_alert(alert: dict) -> None:
    get_client().table("alerts").insert(alert).execute()


def get_unsent_alerts() -> list[dict]:
    res = (
        get_client()
        .table("alerts")
        .select("*")
        .eq("sent_to_telegram", False)
        .order("created_at")
        .execute()
    )
    return res.data or []


def mark_alert_sent(alert_id: str) -> None:
    get_client().table("alerts").update({"sent_to_telegram": True}).eq("id", alert_id).execute()


def get_campaigns() -> list[dict]:
    res = get_client().table("campaigns").select("*").order("updated_at", desc=True).execute()
    return res.data or []


def get_today_metrics() -> list[dict]:
    today = today_arg()
    res = (
        get_client()
        .table("metrics")
        .select("*")
        .eq("object_type", "campaign")
        .eq("date", today)
        .execute()
    )
    return res.data or []


def get_campaign_metrics_7d(campaign_id: str) -> list[dict]:
    seven_days_ago = (datetime.now(timezone(td(hours=-3))).date() - timedelta(days=7)).isoformat()
    res = (
        get_client()
        .table("metrics")
        .select("*")
        .eq("object_id", campaign_id)
        .eq("object_type", "campaign")
        .gte("date", seven_days_ago)
        .order("date")
        .execute()
    )
    return res.data or []


def get_recent_alerts(limit: int = 10) -> list[dict]:
    res = (
        get_client()
        .table("alerts")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_accounts() -> list[dict]:
    res = get_client().table("ad_accounts").select("*").execute()
    return res.data or []


def get_all_metrics_range(object_type: str, days: int = 14) -> list[dict]:
    """Trae todas las métricas de los últimos N días para el tipo dado."""
    start_date = (datetime.now(timezone(td(hours=-3))).date() - timedelta(days=days)).isoformat()
    res = (
        get_client()
        .table("metrics")
        .select("*")
        .eq("object_type", object_type)
        .gte("date", start_date)
        .order("date")
        .execute()
    )
    return res.data or []


def get_ad_sets() -> list[dict]:
    res = get_client().table("ad_sets").select("*").execute()
    return res.data or []
