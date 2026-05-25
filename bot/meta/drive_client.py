"""
drive_client.py
Acceso a Google Drive con estructura de carpetas por estado de video.

Estructura en Drive:
  Ovitta ADS Argentina/  (GOOGLE_DRIVE_FOLDER_ID)
    ├── No subidos/     ← videos nuevos sin campaña
    ├── En uso/         ← tienen campaña activa
    ├── Winners/        ← ROAS ≥ 2x o CPA ≤ target
    ├── Poco gasto/     ← gasto < $5
    └── Malos/          ← mal rendimiento

Variables de entorno requeridas:
  GOOGLE_SERVICE_ACCOUNT_JSON  — JSON de la cuenta de servicio
  GOOGLE_DRIVE_FOLDER_ID       — ID de la carpeta raíz
"""
import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

VIDEO_MIMES = {
    "video/mp4", "video/quicktime", "video/x-msvideo",
    "video/x-matroska", "video/webm",
}

# Nombres de subcarpetas (orden de visualización)
SUBFOLDER_NAMES = ["No subidos", "En uso", "Winners", "Poco gasto", "Malos"]

SUBFOLDER_EMOJIS = {
    "No subidos": "🆕",
    "En uso":     "🔄",
    "Winners":    "🏆",
    "Poco gasto": "💸",
    "Malos":      "❌",
}


def _get_service():
    """Devuelve un objeto de servicio de Google Drive autenticado con permiso completo."""
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
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def is_configured() -> bool:
    """True si las variables de entorno de Drive están seteadas."""
    return bool(
        os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        and os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    )


def _get_root_id() -> str:
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
    if not folder_id:
        raise ValueError("Falta GOOGLE_DRIVE_FOLDER_ID en las variables de entorno.")
    return folder_id


def get_or_create_subfolder(service, name: str, parent_id: str) -> str:
    """Devuelve el ID de una subcarpeta por nombre, creándola si no existe."""
    query = (
        f"'{parent_id}' in parents "
        f"and name='{name}' "
        f"and mimeType='application/vnd.google-apps.folder' "
        f"and trashed=false"
    )
    resp = service.files().list(q=query, fields="files(id, name)").execute()
    files = resp.get("files", [])
    if files:
        return files[0]["id"]

    # Crear subcarpeta
    folder = service.files().create(
        body={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        },
        fields="id",
    ).execute()
    logger.info(f"Subcarpeta creada en Drive: {name}")
    return folder["id"]


def ensure_structure() -> dict:
    """
    Crea las subcarpetas si no existen.
    Retorna {nombre: id} de todas las subcarpetas.
    """
    service = _get_service()
    root_id = _get_root_id()
    folders = {}
    for name in SUBFOLDER_NAMES:
        folders[name] = get_or_create_subfolder(service, name, root_id)
    return folders


def get_structure() -> dict:
    """
    Retorna la estructura de carpetas con sus videos.
    {
      "No subidos": {"id": "...", "videos": [{"id", "name", "size", "modified"}]},
      "En uso":     {...},
      ...
    }
    """
    service = _get_service()
    root_id = _get_root_id()

    result = {}
    for name in SUBFOLDER_NAMES:
        folder_id = get_or_create_subfolder(service, name, root_id)
        videos = _list_videos_in_folder(service, folder_id)
        result[name] = {"id": folder_id, "videos": videos}

    return result


def list_videos_in_subfolder(subfolder_name: str) -> list[dict]:
    """Lista los videos de una subcarpeta específica."""
    service = _get_service()
    root_id = _get_root_id()
    folder_id = get_or_create_subfolder(service, subfolder_name, root_id)
    return _list_videos_in_folder(service, folder_id)


def _list_videos_in_folder(service, folder_id: str) -> list[dict]:
    """Lista videos en un folder_id."""
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
                "id":       f["id"],
                "name":     f["name"],
                "size":     int(f.get("size", 0)),
                "modified": f.get("modifiedTime", ""),
                "mime":     f.get("mimeType", ""),
            })

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


def move_to_subfolder(file_id: str, dest_name: str) -> bool:
    """
    Mueve un archivo a una subcarpeta (dest_name).
    Retorna True si tuvo éxito.
    """
    try:
        service = _get_service()
        root_id = _get_root_id()
        dest_id = get_or_create_subfolder(service, dest_name, root_id)

        # Obtener padres actuales
        file_meta = service.files().get(fileId=file_id, fields="parents").execute()
        current_parents = ",".join(file_meta.get("parents", []))

        service.files().update(
            fileId=file_id,
            addParents=dest_id,
            removeParents=current_parents,
            fields="id, parents",
        ).execute()
        logger.info(f"Video {file_id} movido a '{dest_name}'")
        return True
    except Exception as e:
        logger.error(f"Error moviendo video {file_id} a '{dest_name}': {e}")
        return False


def get_direct_url(file_id: str) -> str:
    """URL de descarga directa para que Meta descargue el video."""
    return f"https://drive.google.com/uc?export=download&id={file_id}"


# ── Compatibilidad con código anterior ───────────────────────────────────────

def list_drive_videos() -> list[dict]:
    """Lista TODOS los videos de la carpeta raíz (legacy). Usa list_videos_in_subfolder para subcarpetas."""
    service = _get_service()
    root_id = _get_root_id()
    return _list_videos_in_folder(service, root_id)
