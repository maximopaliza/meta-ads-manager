"""
drive_client.py
Acceso a Google Drive mediante cuenta de servicio.

Variables de entorno requeridas:
  GOOGLE_SERVICE_ACCOUNT_JSON  — contenido del JSON de la cuenta de servicio (string)
  GOOGLE_DRIVE_FOLDER_ID       — ID de la carpeta de Drive con los videos

Setup (una sola vez):
  1. Ir a https://console.cloud.google.com
  2. Crear proyecto → habilitar "Google Drive API"
  3. Crear cuenta de servicio → descargar JSON
  4. Compartir la carpeta de Drive con el email de la cuenta de servicio
  5. Pegar el JSON en GOOGLE_SERVICE_ACCOUNT_JSON (Railway env vars)
  6. Pegar el ID de la carpeta en GOOGLE_DRIVE_FOLDER_ID
"""
import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
VIDEO_MIMES = {
    "video/mp4", "video/quicktime", "video/x-msvideo",
    "video/x-matroska", "video/webm",
}


def _get_service():
    """Devuelve un objeto de servicio de Google Drive autenticado."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        raise ImportError(
            "Instalá google-api-python-client y google-auth:\n"
            "pip install google-api-python-client google-auth"
        )

    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not sa_json:
        raise ValueError("Falta GOOGLE_SERVICE_ACCOUNT_JSON en las variables de entorno.")

    info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def is_configured() -> bool:
    """True si las variables de entorno de Drive están seteadas."""
    return bool(
        os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        and os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    )


def list_drive_videos() -> list[dict]:
    """
    Lista los videos en la carpeta de Drive configurada.
    Retorna lista de dicts: {"id", "name", "size", "modified"}
    """
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
    if not folder_id:
        raise ValueError("Falta GOOGLE_DRIVE_FOLDER_ID en las variables de entorno.")

    service = _get_service()

    # Construir query para videos en la carpeta
    mime_query = " or ".join(f"mimeType='{m}'" for m in VIDEO_MIMES)
    query = f"'{folder_id}' in parents and ({mime_query}) and trashed=false"

    results = []
    page_token = None
    while True:
        resp = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name, size, modifiedTime, mimeType)",
            pageSize=50,
            pageToken=page_token,
            orderBy="modifiedTime desc",
        ).execute()

        for f in resp.get("files", []):
            results.append({
                "id": f["id"],
                "name": f["name"],
                "size": int(f.get("size", 0)),
                "modified": f.get("modifiedTime", ""),
                "mime": f.get("mimeType", ""),
            })

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


def get_direct_url(file_id: str) -> str:
    """
    Devuelve URL de descarga directa para un archivo de Drive.
    Meta Ads API puede usar esta URL para subir el video.
    """
    # URL de descarga directa para archivos de Drive
    # Requiere que la cuenta de servicio tenga acceso al archivo
    return f"https://drive.google.com/uc?export=download&id={file_id}"
