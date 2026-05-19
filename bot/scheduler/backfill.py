"""
Backfill histórico de Meta Ads.

Uso:
  python -m scheduler.backfill          # últimos 90 días
  python -m scheduler.backfill 180      # últimos 180 días
  python -m scheduler.backfill 2024-01-01  2024-12-31  # rango específico

También invocable desde el bot: /backfill [dias]
"""
import sys
import logging
import time
from datetime import datetime, timedelta, timezone, timedelta as td
from meta.client import MetaClient
from db import queries

logger = logging.getLogger(__name__)

LEVELS = [
    ("campaign", "campaign"),
    ("adset", "ad_set"),
    ("ad", "ad"),
]


def _today_arg() -> str:
    return datetime.now(timezone(td(hours=-3))).date().isoformat()


def run_backfill(since: str, until: str) -> dict:
    """
    Trae todos los datos diarios entre since y until (inclusive) para todos los niveles.
    Hace chunks de 30 días para no golpear los rate limits de Meta.
    Devuelve dict con conteos.
    """
    client = MetaClient()
    accounts = client.get_accounts()
    total = {"campaign": 0, "ad_set": 0, "ad": 0}

    # Chunk de 30 días para no saturar la API
    since_dt = datetime.strptime(since, "%Y-%m-%d")
    until_dt = datetime.strptime(until, "%Y-%m-%d")
    chunk_days = 30

    for account in accounts:
        account_id = account["id"]
        logger.info(f"Backfill para cuenta {account_id} ({since} → {until})")

        current = since_dt
        while current <= until_dt:
            chunk_end = min(current + timedelta(days=chunk_days - 1), until_dt)
            s = current.strftime("%Y-%m-%d")
            u = chunk_end.strftime("%Y-%m-%d")
            logger.info(f"  Chunk {s} → {u}")

            for api_level, db_type in LEVELS:
                try:
                    rows = client.get_insights_date_range(account_id, s, u, api_level)
                    for row in rows:
                        queries.upsert_metrics(row)
                    total[db_type] += len(rows)
                    logger.info(f"    {api_level}: {len(rows)} filas guardadas")
                    time.sleep(3)  # Pausa entre llamadas
                except Exception as e:
                    logger.error(f"    Error {api_level} ({s}→{u}): {e}")

            current = chunk_end + timedelta(days=1)

    logger.info(f"Backfill completo: {total}")
    return total


if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        level=logging.INFO,
    )

    from dotenv import load_dotenv
    load_dotenv()

    args = sys.argv[1:]
    today = _today_arg()

    if len(args) == 0:
        days = 90
        since = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        until = today
    elif len(args) == 1:
        if args[0].isdigit():
            days = int(args[0])
            since = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=days - 1)).strftime("%Y-%m-%d")
            until = today
        else:
            print("Uso: python -m scheduler.backfill [dias] o [since until]")
            sys.exit(1)
    elif len(args) == 2:
        since, until = args[0], args[1]
    else:
        print("Uso: python -m scheduler.backfill [dias] o [since until]")
        sys.exit(1)

    print(f"Iniciando backfill: {since} → {until}")
    result = run_backfill(since, until)
    print(f"Completado: {result}")
