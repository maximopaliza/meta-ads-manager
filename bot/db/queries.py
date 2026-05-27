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


def get_ads() -> list[dict]:
    res = get_client().table("ads").select("id,name,ad_set_id,status").execute()
    return res.data or []


def get_today_metrics_type(object_type: str) -> list[dict]:
    today = today_arg()
    res = (
        get_client()
        .table("metrics")
        .select("*")
        .eq("object_type", object_type)
        .eq("date", today)
        .execute()
    )
    return res.data or []


# ── Drive tracking ────────────────────────────────────────────────────────────

def link_ad_to_drive(ad_id: str, drive_file_id: str, folder: str = "Nuevos subidos") -> None:
    """Asocia un ad de Meta con su video de Drive."""
    get_client().table("ads").update({
        "drive_file_id": drive_file_id,
        "drive_folder": folder,
    }).eq("id", ad_id).execute()


def get_ads_with_drive_file() -> list[dict]:
    """Retorna todos los ads que tienen un video de Drive asociado."""
    res = (
        get_client()
        .table("ads")
        .select("id,name,status,ad_set_id,drive_file_id,drive_folder")
        .not_.is_("drive_file_id", "null")
        .execute()
    )
    return res.data or []


def get_ad_metrics_all(ad_id: str) -> list[dict]:
    """Retorna todas las métricas diarias de un ad."""
    res = (
        get_client()
        .table("metrics")
        .select("*")
        .eq("object_id", ad_id)
        .eq("object_type", "ad")
        .order("date")
        .execute()
    )
    return res.data or []


def update_ad_drive_folder(ad_id: str, folder: str) -> None:
    get_client().table("ads").update({"drive_folder": folder}).eq("id", ad_id).execute()


# ── Copy history ──────────────────────────────────────────────────────────────

def save_copy_history(data: dict) -> None:
    """Guarda o actualiza el historial de performance de un creativo."""
    get_client().table("copy_history").upsert(data, on_conflict="drive_file_id").execute()


def get_copy_winners_by_angle(angle: str, limit: int = 3) -> list[dict]:
    """Retorna copies ganadores para un ángulo dado (para usarlos como referencia)."""
    res = (
        get_client()
        .table("copy_history")
        .select("angle,primary_text,headline,avg_cpa,avg_roas,total_purchases")
        .eq("angle", angle)
        .eq("final_folder", "Winners")
        .order("avg_cpa")
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_ad_set_campaign(ad_set_id: str) -> dict | None:
    """Retorna la campaña de un ad set."""
    res = get_client().table("ad_sets").select("campaign_id,status").eq("id", ad_set_id).execute()
    if not res.data:
        return None
    ad_set = res.data[0]
    camp = get_client().table("campaigns").select("id,status,name").eq("id", ad_set["campaign_id"]).execute()
    return camp.data[0] if camp.data else None
