# campaign_uploader.py - Procesa jobs de campana pendientes del dashboard.
# El dashboard guarda el job en campaign_drafts con status='pending_bot'.
# Este scheduler descarga los videos de Drive, los sube a Meta y notifica por Telegram.
import logging
import os
import asyncio

from db.client import get_client

logger = logging.getLogger(__name__)


async def process_pending_campaigns(bot=None) -> None:
    try:
        sb = get_client()
        res = sb.table('campaign_drafts').select('*').in_('status', ['pending_bot', 'partial_error']).execute()
        jobs = res.data or []
        if not jobs:
            return
        logger.info(f"[CampaignUploader] {len(jobs)} jobs pendientes")
        for job in jobs:
            await _process_job(job, bot)
    except Exception as e:
        logger.error(f"[CampaignUploader] Error: {e}", exc_info=True)


async def _process_job(job: dict, bot=None) -> None:
    job_id        = job['id']
    spec          = job.get('ads') or {}
    campaign_name = job.get('campaign_name', 'Campana')

    logger.info(f"[CampaignUploader] Procesando job {job_id} - {campaign_name}")

    sb = get_client()
    sb.table('campaign_drafts').update({'status': 'uploading_bot'}).eq('id', job_id).execute()

    account_id      = spec.get('accountId', '')
    page_id         = spec.get('pageId', '')
    ig_account_id   = spec.get('igAccountId')
    destination_url = spec.get('destinationUrl', '')
    cta             = spec.get('cta', 'SHOP_NOW')
    ad_description  = spec.get('adDescription', '')
    url_params      = spec.get('urlParams', '')
    ad_sets         = spec.get('adSets', [])

    total_ads     = sum(len(s.get('ads', [])) for s in ad_sets)
    success_count = 0
    error_count   = 0
    errors        = []
    loop          = asyncio.get_event_loop()

    for set_spec in ad_sets:
        ad_set_id = set_spec.get('adSetId', '')
        for ad_spec in set_spec.get('ads', []):
            file_id   = ad_spec.get('driveFileId', '')
            file_name = ad_spec.get('fileName', 'ad')
            mime_type = ad_spec.get('mimeType', 'video/mp4')
            headline  = ad_spec.get('headline', '')
            primary   = ad_spec.get('primaryText', '')

            try:
                file_bytes = await loop.run_in_executor(None, _download_drive_file, file_id)

                is_video = mime_type.startswith('video/')
                if is_video:
                    video_id = await loop.run_in_executor(
                        None, _upload_video, account_id, file_bytes, file_name
                    )
                    story_spec = _build_video_story(
                        page_id, video_id, headline, primary,
                        destination_url, cta, ad_description, url_params, ig_account_id
                    )
                else:
                    image_hash = await loop.run_in_executor(
                        None, _upload_image, account_id, file_bytes
                    )
                    story_spec = _build_image_story(
                        page_id, image_hash, headline, primary,
                        destination_url, cta, ad_description, url_params, ig_account_id
                    )

                creative_id = await loop.run_in_executor(
                    None, _create_creative, account_id, file_name, story_spec
                )
                ad_id = await loop.run_in_executor(
                    None, _create_ad, account_id, ad_set_id, file_name, creative_id
                )
                logger.info(f"  [Ad OK] {file_name} -> {ad_id}")
                success_count += 1

                try:
                    from meta.drive_client import move_to_subfolder
                    await loop.run_in_executor(None, move_to_subfolder, file_id, 'Nuevos subidos')
                except Exception:
                    pass

            except Exception as e:
                import traceback
                logger.error(f"  [Ad ERROR] {file_name}: {e}\n{traceback.format_exc()}")
                error_count += 1
                errors.append(f"{file_name}: {str(e)[:80]}")

    final_status = 'PAUSED' if error_count == 0 else 'partial_error'
    sb.table('campaign_drafts').update({
        'status': final_status,
        'notes':  f"{success_count}/{total_ads} ads subidos" + (f" - {error_count} errores" if error_count else ''),
    }).eq('id', job_id).execute()

    if bot:
        chat_id = os.environ.get('TELEGRAM_CHAT_ID')
        if chat_id:
            lines = [f"[Campana] <b>{campaign_name}</b>\n",
                     f"{success_count}/{total_ads} ads creados en PAUSED"]
            if error_count:
                lines.append(f"Fallaron {error_count}:")
                for e in errors[:3]:
                    lines.append(f"  - {e}")
            try:
                await bot.bot.send_message(chat_id=chat_id, text='\n'.join(lines), parse_mode='HTML')
            except Exception:
                pass

    logger.info(f"[CampaignUploader] Job {job_id} completado - {success_count}/{total_ads} ads")


def _meta_post(path: str, params: dict) -> dict:
    import requests
    token = os.environ['META_ACCESS_TOKEN']
    url   = f"https://graph.facebook.com/v21.0/{path}"
    resp  = requests.post(url, data={**params, 'access_token': token})
    data  = resp.json()
    if 'error' in data:
        raise Exception(data['error'].get('message', str(data['error'])))
    return data


def _upload_video(account_id: str, file_bytes: bytes, name: str) -> str:
    import tempfile, requests
    logger.info(f"  [Video upload] {name} - {len(file_bytes)} bytes")
    token = os.environ['META_ACCESS_TOKEN']
    suffix = '.mp4' if not name.lower().endswith('.mp4') else ''
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        with open(tmp_path, 'rb') as f:
            resp = requests.post(
                f'https://graph.facebook.com/v21.0/{account_id}/advideos',
                data={'access_token': token, 'name': name},
                files={'source': (name, f, 'video/mp4')},
                timeout=300,
            )
        data = resp.json()
        if 'error' in data:
            raise Exception(data['error'].get('message', str(data['error'])))
        if 'id' not in data:
            raise Exception(f"No video ID: {resp.text[:200]}")
        logger.info(f"  [Video upload] OK - id={data['id']}")
        return data['id']
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _upload_image(account_id: str, file_bytes: bytes) -> str:
    import base64
    data = _meta_post(f'{account_id}/adimages', {'bytes': base64.b64encode(file_bytes).decode()})
    images = list(data.get('images', {}).values())
    if not images:
        raise Exception('No image hash returned')
    return images[0]['hash']


def _build_video_story(page_id, video_id, headline, primary, url, cta, description, url_params, ig_id):
    import json
    final_url = f"{url}{'&' if '?' in url else '?'}{url_params}" if url_params else url
    # Get thumbnail URL from Meta
    token = os.environ['META_ACCESS_TOKEN']
    # Get thumbnail and upload as image to get hash
    import requests as req_lib, base64
    image_hash = None
    try:
        r = req_lib.get(
            f'https://graph.facebook.com/v21.0/{video_id}/thumbnails',
            params={'access_token': token}, timeout=30,
        )
        thumbs = r.json().get('data', [])
        if thumbs:
            thumb_url = thumbs[0]['uri']
            thumb_resp = req_lib.get(thumb_url, timeout=30)
            if thumb_resp.ok:
                img_b64 = base64.b64encode(thumb_resp.content).decode()
                upload = req_lib.post(
                    f'https://graph.facebook.com/v21.0/{account_id}/adimages',
                    data={'access_token': token, 'bytes': img_b64},
                    timeout=30,
                )
                images = list(upload.json().get('images', {}).values())
                if images:
                    image_hash = images[0]['hash']
    except Exception as e:
        logger.warning(f"  [Thumbnail] {e}")

    video_data = {
        'video_id': video_id,
        'message': primary,
        'title': headline,
        'link_description': description or headline,
        'call_to_action': {'type': cta or 'SHOP_NOW', 'value': {'link': final_url}},
    }
    if image_hash:
        video_data['image_hash'] = image_hash

    spec = {'page_id': page_id, 'video_data': video_data}
    return json.dumps(spec)


def _build_image_story(page_id, image_hash, headline, primary, url, cta, description, url_params, ig_id):
    import json
    final_url = f"{url}{'&' if '?' in url else '?'}{url_params}" if url_params else url
    spec = {
        'page_id': page_id,
        'link_data': {
            'message': primary,
            'link': final_url,
            'image_hash': image_hash,
            'name': headline,
            'description': description or '',
            'call_to_action': {'type': cta or 'SHOP_NOW', 'value': {'link': final_url}},
        },
    }
    return json.dumps(spec)


def _create_creative(account_id: str, name: str, story_spec: str) -> str:
    data = _meta_post(f'{account_id}/adcreatives', {
        'name': f'{name} - Creative',
        'object_story_spec': story_spec,
    })
    return data['id']


def _download_drive_file(file_id: str) -> bytes:
    import requests as req_lib
    token = os.environ['META_ACCESS_TOKEN']
    # Use Google Drive API directly with service account
    from meta.drive_client import _get_service
    from googleapiclient.http import MediaIoBaseDownload
    from io import BytesIO
    service = _get_service()
    request = service.files().get_media(fileId=file_id)
    buf = BytesIO()
    downloader = MediaIoBaseDownload(buf, request, chunksize=10*1024*1024)
    done = False
    while not done:
        status, done = downloader.next_chunk()
    data = buf.getvalue()
    if not data:
        raise Exception(f"Downloaded empty file for {file_id}")
    return data


def _create_ad(account_id: str, ad_set_id: str, name: str, creative_id: str) -> str:
    data = _meta_post(f'{account_id}/ads', {
        'name': name,
        'adset_id': ad_set_id,
        'creative': f'{{"creative_id":"{creative_id}"}}',
        'status': 'PAUSED',
    })
    return data['id']
