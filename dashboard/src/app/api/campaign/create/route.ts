import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFile } from '@/lib/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — uploading many videos to Meta

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BASE  = 'https://graph.facebook.com/v21.0'

const OBJECTIVE_MAP: Record<string, string> = {
  ventas:  'OUTCOME_SALES',
  trafico: 'OUTCOME_TRAFFIC',
  alcance: 'OUTCOME_AWARENESS',
}
const OPTIMIZATION_MAP: Record<string, string> = {
  OUTCOME_SALES:     'OFFSITE_CONVERSIONS',
  OUTCOME_TRAFFIC:   'LINK_CLICKS',
  OUTCOME_AWARENESS: 'REACH',
}
const BILLING_MAP: Record<string, string> = {
  OUTCOME_SALES:     'IMPRESSIONS',
  OUTCOME_TRAFFIC:   'LINK_CLICKS',
  OUTCOME_AWARENESS: 'IMPRESSIONS',
}
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm'])

function isVideoMime(mime: string) {
  return mime.startsWith('video/')
}

// ── Meta API helpers ──────────────────────────────────────────────────────────

async function metaPost(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ access_token: META_TOKEN, ...params })
  const res = await fetch(`${META_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data
}

/** Upload video bytes to Meta ad library. Returns video_id. */
async function uploadVideo(accountId: string, bytes: Buffer, name: string): Promise<string> {
  const boundary = 'meta_video_' + Math.random().toString(36).slice(2)
  const metaParts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${META_TOKEN}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${name}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${name}"\r\nContent-Type: video/mp4\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]
  const body = Buffer.concat(metaParts)
  const res = await fetch(`${META_BASE}/${accountId}/advideos`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.id
}

/** Upload image bytes to Meta ad library. Returns image_hash. */
async function uploadImage(accountId: string, bytes: Buffer): Promise<string> {
  const b64 = bytes.toString('base64')
  const res = await fetch(`${META_BASE}/${accountId}/adimages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: META_TOKEN, bytes: b64 }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  // Response: { images: { filename: { hash } } }
  const hashes = Object.values(data.images || {}) as any[]
  if (!hashes[0]?.hash) throw new Error('No image hash returned')
  return hashes[0].hash
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * POST body:
 * {
 *   campaignName: string
 *   adSetName: string
 *   campaignType: 'CBO' | 'ABO'
 *   budgetCents: number
 *   budgetLevel: 'campaign' | 'adset'
 *   objective: 'ventas' | 'trafico' | 'alcance'
 *   accountId: string          // act_xxx
 *   pageId: string
 *   destinationUrl: string
 *   startDate?: string         // YYYY-MM-DD
 *   targeting?: object
 *   productId?: string
 *   ads: Array<{
 *     driveFileId: string
 *     mimeType: string
 *     fileName: string
 *     headline: string
 *     primaryText: string
 *     description?: string
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const body = await req.json()
  const {
    campaignName,
    adSetName,
    campaignType = 'CBO',
    budgetCents,
    objective = 'ventas',
    accountId,
    pageId,
    destinationUrl,
    startDate,
    targeting,
    productId,
    ads = [],
  } = body

  if (!campaignName || !accountId || !pageId || !destinationUrl || !budgetCents || !ads.length) {
    return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
  }

  const metaObjective = OBJECTIVE_MAP[objective] || 'OUTCOME_SALES'
  const isCBO = campaignType === 'CBO'

  try {
    // ── 1. Create Meta Campaign ──────────────────────────────────────────────
    const campParams: Record<string, string> = {
      name:                 campaignName,
      objective:            metaObjective,
      status:               'PAUSED',
      special_ad_categories: '[]',
    }
    if (isCBO) {
      campParams.daily_budget = String(budgetCents)
      campParams.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
    }
    const campData = await metaPost(`${accountId}/campaigns`, campParams)
    const campaignId = campData.id
    console.log('[Campaign] created:', campaignId)

    // ── 2. Create Ad Set ─────────────────────────────────────────────────────
    const defaultTargeting = targeting || { geo_locations: { countries: ['AR'] }, age_min: 18, age_max: 65 }
    const asParams: Record<string, string> = {
      name:              adSetName || `${campaignName} — Conjunto`,
      campaign_id:       campaignId,
      billing_event:     BILLING_MAP[metaObjective],
      optimization_goal: OPTIMIZATION_MAP[metaObjective],
      targeting:         JSON.stringify(defaultTargeting),
      status:            'PAUSED',
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
    }
    if (!isCBO) {
      asParams.daily_budget = String(budgetCents)
    }
    if (startDate) {
      const ts = Math.floor(new Date(startDate).getTime() / 1000)
      asParams.start_time = String(ts)
    }
    const asData = await metaPost(`${accountId}/adsets`, asParams)
    const adSetId = asData.id
    console.log('[AdSet] created:', adSetId)

    // ── 3. Create Ads ────────────────────────────────────────────────────────
    const createdAds: any[] = []
    for (const adSpec of ads) {
      const { driveFileId, mimeType, fileName, headline, primaryText, description } = adSpec

      // Download from Drive
      let bytes: Buffer
      try {
        const dl = await downloadFile(driveFileId)
        bytes = dl.bytes
      } catch (err: any) {
        console.error(`[Ad] Drive download failed for ${driveFileId}:`, err)
        createdAds.push({ driveFileId, fileName, error: err.message })
        continue
      }

      // Upload media to Meta
      let storySpec: object
      try {
        if (isVideoMime(mimeType)) {
          const videoId = await uploadVideo(accountId, bytes, fileName)
          storySpec = {
            page_id: pageId,
            video_data: {
              video_id: videoId,
              message:          primaryText,
              title:            headline,
              link_description: description || headline,
              call_to_action: {
                type: 'SHOP_NOW',
                value: { link: destinationUrl },
              },
            },
          }
        } else {
          const imageHash = await uploadImage(accountId, bytes)
          storySpec = {
            page_id: pageId,
            link_data: {
              message:     primaryText,
              link:        destinationUrl,
              image_hash:  imageHash,
              name:        headline,
              description: description || '',
              call_to_action: {
                type: 'SHOP_NOW',
                value: { link: destinationUrl },
              },
            },
          }
        }
      } catch (err: any) {
        console.error(`[Ad] Media upload failed for ${fileName}:`, err)
        createdAds.push({ driveFileId, fileName, error: err.message })
        continue
      }

      // Create creative
      const creativeData = await metaPost(`${accountId}/adcreatives`, {
        name:               `${fileName} — Creative`,
        object_story_spec: JSON.stringify(storySpec),
      })
      const creativeId = creativeData.id

      // Create ad
      const adData = await metaPost(`${accountId}/ads`, {
        name:      fileName,
        adset_id:  adSetId,
        creative:  JSON.stringify({ creative_id: creativeId }),
        status:    'PAUSED',
      })
      const adId = adData.id

      // Move file to "Nuevos subidos" in Drive
      try {
        const { moveFile } = await import('@/lib/drive')
        await moveFile(driveFileId, 'Nuevos subidos')
      } catch (_) { /* non-fatal */ }

      createdAds.push({
        driveFileId,
        fileName,
        adId,
        creativeId,
        headline,
        primaryText,
        angle: adSpec.angle || '',
      })
      console.log('[Ad] created:', adId, fileName)
    }

    // ── 4. Save to Supabase campaign_drafts ──────────────────────────────────
    const { data: draft, error: dbErr } = await supabaseAdmin
      .from('campaign_drafts')
      .insert({
        campaign_id:   campaignId,
        ad_set_id:     adSetId,
        campaign_name: campaignName,
        ad_set_name:   adSetName || `${campaignName} — Conjunto`,
        campaign_type: campaignType,
        budget_cents:  budgetCents,
        budget_level:  isCBO ? 'campaign' : 'adset',
        objective,
        status:        'PAUSED',
        ads:           createdAds,
        product_id:    productId || null,
        start_date:    startDate || null,
      })
      .select()
      .single()

    if (dbErr) console.error('[Campaign] Supabase insert error:', dbErr)

    return NextResponse.json({
      ok:         true,
      campaignId,
      adSetId,
      draftId:    draft?.id,
      ads:        createdAds,
      errors:     createdAds.filter(a => a.error).length,
    })

  } catch (err: any) {
    console.error('[Campaign create]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
