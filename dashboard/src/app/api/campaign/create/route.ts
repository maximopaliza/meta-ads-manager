import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { downloadFile, moveFile } from '@/lib/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BASE  = 'https://graph.facebook.com/v21.0'

const OBJECTIVE_MAP: Record<string, string> = {
  ventas:      'OUTCOME_SALES',
  trafico:     'OUTCOME_TRAFFIC',
  alcance:     'OUTCOME_AWARENESS',
  engagement:  'OUTCOME_ENGAGEMENT',
  leads:       'OUTCOME_LEADS',
  app:         'OUTCOME_APP_PROMOTION',
}

// Default optimization goal per objective if not specified
const DEFAULT_OPTIMIZATION: Record<string, string> = {
  OUTCOME_SALES:         'OFFSITE_CONVERSIONS',
  OUTCOME_TRAFFIC:       'LINK_CLICKS',
  OUTCOME_AWARENESS:     'REACH',
  OUTCOME_ENGAGEMENT:    'POST_ENGAGEMENT',
  OUTCOME_LEADS:         'LEAD_GENERATION',
  OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
}

const DEFAULT_BILLING: Record<string, string> = {
  OFFSITE_CONVERSIONS: 'IMPRESSIONS',
  LINK_CLICKS:         'LINK_CLICKS',
  LANDING_PAGE_VIEWS:  'IMPRESSIONS',
  REACH:               'IMPRESSIONS',
  IMPRESSIONS:         'IMPRESSIONS',
  VIDEO_VIEWS:         'IMPRESSIONS',
  THRUPLAY:            'IMPRESSIONS',
  POST_ENGAGEMENT:     'IMPRESSIONS',
  LEAD_GENERATION:     'IMPRESSIONS',
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
  if (data.error) throw new Error(`${data.error.message} [code:${data.error.code} type:${data.error.type} path:${path}]`)
  return data
}

async function uploadVideoFromUrl(accountId: string, fileUrl: string, name: string): Promise<string> {
  const data = await metaPost(`${accountId}/advideos`, {
    name,
    file_url: fileUrl,
  })
  return data.id
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
  destinationUrl: string, adSpec: any, bytes: Buffer | null,
  cta: string, description: string, urlParams: string, igAccountId?: string, multiAdvertiser = true,
): Promise<{ adId: string; creativeId: string }> {
  const { mimeType, fileName, headline, primaryText, driveFileId } = adSpec
  const finalUrl = urlParams ? `${destinationUrl}${destinationUrl.includes('?') ? '&' : '?'}${urlParams}` : destinationUrl

  let storySpec: object
  if (isVideoMime(mimeType)) {
    const videoId = await uploadVideo(accountId, bytes!, fileName)
    const videoData: any = {
      video_id: videoId,
      message: primaryText,
      title: headline,
      link_description: description || headline,
      call_to_action: { type: cta || 'SHOP_NOW', value: { link: finalUrl } },
    }
    storySpec = {
      page_id: pageId,
      ...(igAccountId ? { instagram_actor_id: igAccountId } : {}),
      video_data: videoData,
    }
  } else {
    const imageHash = await uploadImage(accountId, bytes!)
    const linkData: any = {
      message: primaryText,
      link: finalUrl,
      image_hash: imageHash,
      name: headline,
      description: description || '',
      call_to_action: { type: cta || 'SHOP_NOW', value: { link: finalUrl } },
    }
    storySpec = {
      page_id: pageId,
      ...(igAccountId ? { instagram_actor_id: igAccountId } : {}),
      link_data: linkData,
    }
  }

  const creativeParams: Record<string, string> = {
    name: `${fileName} — Creative`,
    object_story_spec: JSON.stringify(storySpec),
  }
  if (!multiAdvertiser) creativeParams.multi_share_end_card = 'false'

  const creative = await metaPost(`${accountId}/adcreatives`, creativeParams)
  const ad = await metaPost(`${accountId}/ads`, {
    name: fileName,
    adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creative.id }),
    status: 'PAUSED',
  })
  return { adId: ad.id, creativeId: creative.id }
}

export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const body = await req.json()
  const {
    campaignName, campaignType = 'CBO',
    budgetCents, budgetType = 'daily',
    objective = 'ventas', specialAdCategory = 'NONE',
    optimizationGoal, pixelEvent, pixelId,
    bidStrategy = 'LOWEST_COST_WITHOUT_CAP', bidAmount,
    billingEvent, attributionWindow = '7d_click_1d_view',
    placements, platforms,
    accountId, pageId, igAccountId, destinationUrl,
    startDateTime, endDateTime, targeting, productId,
    cta = 'SHOP_NOW', urlParams = '', adDescription = '',
    dynamicCreative = false, multiAdvertiser = true,
    adSets = [],
  } = body

  if (!campaignName || !accountId || !pageId || !destinationUrl || !budgetCents || !adSets.length) {
    return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
  }

  const metaObjective = OBJECTIVE_MAP[objective] || 'OUTCOME_SALES'
  const isCBO = campaignType === 'CBO'
  const optGoal = optimizationGoal || DEFAULT_OPTIMIZATION[metaObjective] || 'OFFSITE_CONVERSIONS'
  const billEvent = billingEvent || DEFAULT_BILLING[optGoal] || 'IMPRESSIONS'

  try {
    // ── 1. Campaign ──────────────────────────────────────────────────────────
    const campParams: Record<string, string> = {
      name:                  campaignName,
      objective:             metaObjective,
      status:                'PAUSED',
      special_ad_categories: specialAdCategory === 'NONE' ? '[]' : JSON.stringify([specialAdCategory]),
    }
    if (isCBO) {
      campParams[budgetType === 'lifetime' ? 'lifetime_budget' : 'daily_budget'] = String(budgetCents)
      campParams.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
    }
    const campData   = await metaPost(`${accountId}/campaigns`, campParams)
    const campaignId = campData.id
    console.log('[Campaign]', campaignId)

    // ── 2. Build targeting ────────────────────────────────────────────────────
    const baseTargeting = targeting || { geo_locations: { countries: ['AR'] }, age_min: 35, age_max: 65 }
    const defaultTargeting = {
      ...baseTargeting,
      targeting_automation: { advantage_audience: 0 },
    }

    const allCreatedAds: any[] = []
    const createdAdSets: any[] = []
    let firstAdSetId = ''

    // ── 3. Ad Sets + Ads ─────────────────────────────────────────────────────
    for (let setIdx = 0; setIdx < adSets.length; setIdx++) {
      const setSpec = adSets[setIdx]
      const setName = setSpec.name || `${campaignName} — Conjunto ${setIdx + 1}`

      const asParams: Record<string, string> = {
        name:              setName,
        campaign_id:       campaignId,
        billing_event:     billEvent,
        optimization_goal: optGoal,
        targeting:         JSON.stringify(defaultTargeting),
        status:            'PAUSED',
        destination_type:  'WEBSITE',
      }

      if (!isCBO) {
        asParams[budgetType === 'lifetime' ? 'lifetime_budget' : 'daily_budget'] = String(budgetCents)
        asParams.bid_strategy = bidStrategy
        if (bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && bidAmount) {
          asParams.bid_amount = String(bidAmount)
        }
      }
      if (startDateTime) {
        const startTs = Math.floor(new Date(startDateTime).getTime() / 1000)
        const nowTs = Math.floor(Date.now() / 1000)
        if (startTs > nowTs + 300) {  // solo si es más de 5 min en el futuro
          asParams.start_time = String(startTs)
        }
      }
      if (endDateTime) {
        asParams.end_time = String(Math.floor(new Date(endDateTime).getTime() / 1000))
      }
      if (optGoal === 'OFFSITE_CONVERSIONS' && pixelId && pixelEvent) {
        asParams.promoted_object = JSON.stringify({ pixel_id: pixelId, custom_event_type: pixelEvent.toUpperCase() })
      }

      console.log('[AdSet params]', JSON.stringify(asParams, null, 2))
      const asData  = await metaPost(`${accountId}/adsets`, asParams)
      const adSetId = asData.id
      if (setIdx === 0) firstAdSetId = adSetId
      console.log(`[AdSet ${setIdx + 1}] ${setName}`, adSetId)

      const setAdIds: string[] = []
      for (const adSpec of setSpec.ads || []) {
        let bytes: Buffer | null = null
        try {
          const dl = await downloadFile(adSpec.driveFileId)
          bytes = dl.bytes
        } catch (err: any) {
          allCreatedAds.push({ ...adSpec, adSetIdx: setIdx, adSetId, error: `Drive: ${err.message}` })
          continue
        }
        try {
          const { adId, creativeId } = await createAd(
            accountId, adSetId, pageId, destinationUrl, adSpec, bytes,
            cta, adDescription, urlParams, igAccountId, multiAdvertiser,
          )
          try { await moveFile(adSpec.driveFileId, 'Nuevos subidos') } catch (_) {}
          allCreatedAds.push({ ...adSpec, adSetIdx: setIdx, adSetId, adId, creativeId })
          setAdIds.push(adId)
          console.log(`  [Ad]`, adId, adSpec.fileName)
        } catch (err: any) {
          allCreatedAds.push({ ...adSpec, adSetIdx: setIdx, adSetId, error: `Upload: ${err.message}` })
        }
      }
      createdAdSets.push({ name: setName, adSetId, adIds: setAdIds })
    }

    // ── 4. Save draft ────────────────────────────────────────────────────────
    const { data: draft } = await supabaseAdmin
      .from('campaign_drafts')
      .insert({
        campaign_id:   campaignId,
        ad_set_id:     firstAdSetId,
        campaign_name: campaignName,
        ad_set_name:   adSets[0]?.name || campaignName,
        campaign_type: campaignType,
        budget_cents:  budgetCents,
        budget_level:  isCBO ? 'campaign' : 'adset',
        objective,
        status:        'PAUSED',
        ads:           allCreatedAds,
        product_id:    productId || null,
        start_date:    startDateTime ? startDateTime.split('T')[0] : null,
        notes:         `${adSets.length} conjuntos — ${allCreatedAds.filter(a => !a.error).length} ads`,
      })
      .select()
      .single()

    return NextResponse.json({
      ok: true,
      campaignId,
      firstAdSetId,
      draftId:  draft?.id,
      adSets:   createdAdSets,
      ads:      allCreatedAds,
      errors:   allCreatedAds.filter(a => a.error).length,
    })

  } catch (err: any) {
    console.error('[Campaign create]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
