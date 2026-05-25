"""
video_library.py
Obtiene los videos del ad account de Meta y los categoriza por performance.

Categorías:
  winners    — ROAS >= 2.0 o CPA <= CPA_TARGET
  poco_gasto — gasto total < POCO_GASTO_THRESHOLD (no tuvieron presupuesto real)
  malos      — ROAS < 1.5 o CPA > CPA_BREAKEVEN
  sin_datos  — sin ads asociados o sin métricas (videos nuevos)
"""
import os
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

BASE = "https://graph.facebook.com/v21.0"

# Umbrales (en moneda de la cuenta — se usan en proporción, no en USD fijo)
CPA_TARGET      = 7      # bueno
CPA_BREAKEVEN   = 15     # límite
ROAS_WINNER     = 2.0
ROAS_MALO       = 1.5
POCO_GASTO_USD  = 5.0    # si gastó menos de esto, no tiene datos reales


def _token() -> str:
    return os.environ["META_ACCESS_TOKEN"]


def _account_id() -> str:
    from db.queries import get_accounts
    accounts = get_accounts()
    if not accounts:
        raise ValueError("No hay ad accounts. Ejecutá /sync primero.")
    return accounts[0]["id"]


def get_videos_with_performance() -> dict:
    """
    Retorna un dict con cuatro listas:
    {
      "winners":    [{"id", "title", "length", "roas", "cpa", "spend", "ventas"}],
      "poco_gasto": [...],
      "malos":      [...],
      "sin_datos":  [...],
    }
    """
    account_id = _account_id()
    token = _token()

    # 1. Obtener todos los videos de la biblioteca
    videos_raw = _get_all_pages(f"{account_id}/advideos", {
        "fields": "id,title,length,created_time",
        "limit": 50,
    }, token)

    video_map = {v["id"]: v for v in videos_raw}

    # 2. Obtener ads con sus creativos (video_id) y métricas de los últimos 30 días
    ads_raw = _get_all_pages(f"{account_id}/ads", {
        "fields": "id,name,status,creative{video_id}",
        "limit": 100,
    }, token)

    # 3. Para cada ad que tenga video_id, obtener métricas
    video_perf: dict[str, dict] = {}  # video_id → {spend, purchases, purchase_value}

    ad_ids_by_video: dict[str, list] = {}
    for ad in ads_raw:
        creative = ad.get("creative", {})
        vid_id = creative.get("video_id")
        if not vid_id:
            continue
        ad_ids_by_video.setdefault(vid_id, []).append(ad["id"])

    # Obtener métricas en batch por video (agrupando ads)
    for vid_id, ad_ids in ad_ids_by_video.items():
        spend = 0.0
        purchases = 0
        purchase_value = 0.0

        for ad_id in ad_ids:
            try:
                r = requests.get(
                    f"{BASE}/{ad_id}/insights",
                    params={
                        "access_token": token,
                        "fields": "spend,actions,action_values",
                        "date_preset": "last_30d",
                    },
                    timeout=20,
                )
                data = r.json().get("data", [])
                for row in data:
                    spend += float(row.get("spend", 0))
                    for a in row.get("actions", []):
                        if a["action_type"] in ("purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"):
                            purchases += int(float(a.get("value", 0)))
                    for a in row.get("action_values", []):
                        if a["action_type"] in ("purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"):
                            purchase_value += float(a.get("value", 0))
            except Exception as e:
                logger.warning(f"Could not fetch insights for ad {ad_id}: {e}")

        video_perf[vid_id] = {
            "spend": spend,
            "purchases": purchases,
            "purchase_value": purchase_value,
        }

    # 4. Categorizar
    winners, poco_gasto, malos, sin_datos = [], [], [], []

    for vid_id, video in video_map.items():
        perf = video_perf.get(vid_id)
        title = (video.get("title") or "Sin título")
        length = video.get("length", 0)
        base = {"id": vid_id, "title": title, "length": length}

        if not perf or perf["spend"] == 0:
            sin_datos.append(base)
            continue

        spend = perf["spend"]
        purchases = perf["purchases"]
        purchase_value = perf["purchase_value"]
        roas = purchase_value / spend if spend > 0 else 0
        cpa = spend / purchases if purchases > 0 else None

        entry = {**base, "spend": spend, "roas": roas, "cpa": cpa, "ventas": purchases}

        if spend < POCO_GASTO_USD:
            poco_gasto.append(entry)
        elif roas >= ROAS_WINNER or (cpa is not None and cpa <= CPA_TARGET):
            winners.append(entry)
        elif roas < ROAS_MALO or (cpa is not None and cpa > CPA_BREAKEVEN):
            malos.append(entry)
        else:
            # Performance intermedia — los incluimos en poco_gasto si gasto < umbral, sino en sin_datos
            sin_datos.append(entry)

    # Ordenar winners por ROAS desc, malos por ROAS asc
    winners.sort(key=lambda x: x.get("roas", 0), reverse=True)
    malos.sort(key=lambda x: x.get("roas", 0))
    poco_gasto.sort(key=lambda x: x.get("spend", 0))

    return {"winners": winners, "poco_gasto": poco_gasto, "malos": malos, "sin_datos": sin_datos}


def _get_all_pages(path: str, params: dict, token: str) -> list:
    results = []
    url = f"{BASE}/{path}"
    p = {"access_token": token, **params}
    while url:
        r = requests.get(url, params=p, timeout=30)
        data = r.json()
        results.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        p = {}  # next URL ya tiene todo incluido
    return results
