import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFile } from '@/lib/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

function isVideoMime(mime: string) { return mime.startsWith('video/') }

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

async function uploadVideo(accountId: string, bytes: Buffer, name: string): Promise<string> {
  const boundary = 'mv_' + Math.random().toString(36).slice(2)
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${META_TOKEN}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${name}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${name}"\r\nContent-Type: video/mp4\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const res = await fetch(`${META_BASE}/${accountId}/advideos`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.id
}

async function uploadImage(accountId: string, bytes: Buffer): Promise<string> {
  const res = await fetch(`${META_BASE}/${accountId}/adimages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: META_TOKEN, bytes: bytes.toString('base64') }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const hashes = Object.values(data.images || {}) as any[]
  if (!hashes[0]?.hash) throw new Error('No image hash returned')
  return hashes[0].hash
}

async function createAd(
  accountId: string, adSetId: string, pageId: string,
  destinationUrl: string, adSpec: any, bytes: Buffer,
): Promise<{ adId: string; creativeId: string }> {
  const { mimeType, fileName, headline, primaryText, description } = adSpec

  let storySpec: object
  if (isVideoMime(mimeType)) {
    const videoId = await uploadVideo(accountId, bytes, fileName)
    storySpec = {
      page_id: pageId,
      video_data: {
        video_id: videoId,
        message: primaryText,
        title: headline,
        link_description: description || headline,
        call_to_action: { type: 'SHOP_NOW', value: { link: destinationUrl } },
      },
    }
  } else {
    const imageHash = await uploadImage(accountId, bytes)
    storySpec = {
      page_id: pageId,
      link_data: {
        message: primaryText,
        link: destinationUrl,
        image_hash: imageHash,
        name: headline,
        description: description || '',
        call_to_action: { type: 'SHOP_NOW', value: { link: destinationUrl } },
      },
    }
  }

  const creative = await metaPost(`${accountId}/adcreatives`, {
    name: `${fileName} — Creative`,
    object_story_spec: JSON.stringify(storySpec),
  })
  const ad = await metaPost(`${accountId}/ads`, {
    name: fileName,
    adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creative.id }),
    status: 'PAUSED',
  })
  return { adId: ad.id, creativeId: creative.id }
}

/**
 * POST body:
 * {
 *   campaignName, adSetName, campaignType ('CBO'|'ABO'),
 *   budgetCents, objective, accountId, pageId, destinationUrl,
 *   numAdSets (default 1), adsPerAdSet (default all),
 *   startDate?, targeting?, productId?,
 *   ads: [{ driveFileId, mimeType, fileName, headline, primaryText, angle }]
 * }
 */
export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const body = await req.json()
  const {
    campaignName, adSetName, campaignType = 'CBO',
    budgetCents, objective = 'ventas',
    accountId, pageId, destinationUrl,
    numAdSets = 1, adsPerAdSet,
    startDate, targeting, productId,
    ads = [],
  } = body

  if (!campaignName || !accountId || !pageId || !destinationUrl || !budgetCents || !ads.length) {
    return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
  }

  const metaObjective = OBJECTIVE_MAP[objective] || 'OUTCOME_SALES'
  const isCBO = campaignType === 'CBO'
  const setsCount = Math.max(1, parseInt(String(numAdSets)))
  const perSet    = adsPerAdSet ? Math.max(1, parseInt(String(adsPerAdSet))) : Math.ceil(ads.length / setsCount)

  // Chunk ads into groups for each ad set
  const adChunks: any[][] = []
  for (let i = 0; i < setsCount; i++) {
    adChunks.push(ads.slice(i * perSet, (i + 1) * perSet))
  }

  try {
    // ── 1. Campaign ──────────────────────────────────────────────────────────
    const campParams: Record<string, string> = {
      name: campaignName,
      objective: metaObjective,
      status: 'PAUSED',
      special_ad_categories: '[]',
    }
    if (isCBO) {
      campParams.daily_budget = String(budgetCents)
      campParams.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
    }
    const campData   = await metaPost(`${accountId}/campaigns`, campParams)
    const campaignId = campData.id
    console.log('[Campaign]', campaignId)

    const defaultTargeting = targeting || { geo_locations: { countries: ['AR'] }, age_min: 18, age_max: 65 }
    const createdAds: any[] = []
    let firstAdSetId = ''

    // ── 2. Ad Sets + Ads ─────────────────────────────────────────────────────
    for (let setIdx = 0; setIdx < setsCount; setIdx++) {
      const setName = setsCount === 1
        ? (adSetName || `${campaignName} — Conjunto`)
        : `${adSetName || campaignName} — Conjunto ${setIdx + 1}`

      const asParams: Record<string, string> = {
        name:              setName,
        campaign_id:       campaignId,
        billing_event:     BILLING_MAP[metaObjective],
        optimization_goal: OPTIMIZATION_MAP[metaObjective],
        targeting:         JSON.stringify(defaultTargeting),
        status:            'PAUSED',
        bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      }
      if (!isCBO) asParams.daily_budget = String(budgetCents)
      if (startDate) asParams.start_time = String(Math.floor(new Date(startDate).getTime() / 1000))

      const asData  = await metaPost(`${accountId}/adsets`, asParams)
      const adSetId = asData.id
      if (setIdx === 0) firstAdSetId = adSetId
      console.log(`[AdSet ${setIdx + 1}]`, adSetId)

      // ── 3. Ads for this set ─────────────────────────────────────────────
      for (const adSpec of adChunks[setIdx] || []) {
        let bytes: Buffer
        try {
          const dl = await downloadFile(adSpec.driveFileId)
          bytes = dl.bytes
        } catch (err: any) {
          createdAds.push({ ...adSpec, adSetIdx: setIdx, error: `Drive: ${err.message}` })
          continue
        }

        try {
          const { adId, creativeId } = await createAd(accountId, adSetId, pageId, destinationUrl, adSpec, bytes)
          // Move to "Nuevos subidos"
          try { const { moveFile } = await import('@/lib/drive'); await moveFile(adSpec.driveFileId, 'Nuevos subidos') } catch (_) {}
          createdAds.push({ ...adSpec, adSetIdx: setIdx, adSetId, adId, creativeId })
          console.log(`  [Ad]`, adId, adSpec.fileName)
        } catch (err: any) {
          createdAds.push({ ...adSpec, adSetIdx: setIdx, error: `Upload: ${err.message}` })
        }
      }
    }

    // ── 4. Save draft ────────────────────────────────────────────────────────
    const { data: draft } = await supabaseAdmin
      .from('campaign_drafts')
      .insert({
        campaign_id:   campaignId,
        ad_set_id:     firstAdSetId,
        campaign_name: campaignName,
        ad_set_name:   adSetName || campaignName,
        campaign_type: campaignType,
        budget_cents:  budgetCents,
        budget_level:  isCBO ? 'campaign' : 'adset',
        objective,
        status:        'PAUSED',
        ads:           createdAds,
        product_id:    productId || null,
        start_date:    startDate || null,
        notes:         `${setsCount} conjuntos × ${perSet} ads`,
      })
      .select()
      .single()

    return NextResponse.json({
      ok: true,
      campaignId,
      firstAdSetId,
      draftId:  draft?.id,
      ads:      createdAds,
      errors:   createdAds.filter(a => a.error).length,
      structure: `${setsCount} conjuntos × ${perSet} ads`,
    })

  } catch (err: any) {
    console.error('[Campaign create]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
