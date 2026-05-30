import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    // ── 1. Crear campaña y conjuntos en Meta (sin ads — los ads los sube el bot) ──
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

    const baseTargeting = targeting || { geo_locations: { countries: ['AR'] }, age_min: 35, age_max: 65 }
    const defaultTargeting = { ...baseTargeting, targeting_automation: { advantage_audience: 0 } }

    const createdAdSets: any[] = []
    let firstAdSetId = ''

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
        if (bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && bidAmount) asParams.bid_amount = String(bidAmount)
      }
      if (startDateTime) {
        const startTs = Math.floor(new Date(startDateTime).getTime() / 1000)
        if (startTs > Math.floor(Date.now() / 1000) + 300) asParams.start_time = String(startTs)
      }
      if (endDateTime) asParams.end_time = String(Math.floor(new Date(endDateTime).getTime() / 1000))
      if (optGoal === 'OFFSITE_CONVERSIONS' && pixelId && pixelEvent) {
        asParams.promoted_object = JSON.stringify({ pixel_id: pixelId, custom_event_type: pixelEvent.toUpperCase() })
      }

      const asData  = await metaPost(`${accountId}/adsets`, asParams)
      const adSetId = asData.id
      if (setIdx === 0) firstAdSetId = adSetId
      console.log(`[AdSet ${setIdx + 1}] ${setName}`, adSetId)
      createdAdSets.push({ name: setName, adSetId, ads: setSpec.ads || [] })
    }

    // ── 2. Guardar job en Supabase para que el bot suba los ads ──────────────
    const jobSpec = {
      campaignId,
      campaignName,
      accountId,
      pageId,
      igAccountId: igAccountId || null,
      destinationUrl,
      cta,
      urlParams,
      adDescription,
      multiAdvertiser,
      adSets: createdAdSets,
    }

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
        status:        'pending_bot',
        ads:           jobSpec,
        product_id:    productId || null,
        start_date:    startDateTime ? startDateTime.split('T')[0] : null,
        notes:         `${adSets.length} conjuntos — pendiente de subida por bot`,
      })
      .select()
      .single()

    console.log('[Job saved]', draft?.id, 'campaign', campaignId)

    return NextResponse.json({
      ok:         true,
      queued:     true,
      campaignId,
      firstAdSetId,
      draftId:    draft?.id,
      adSets:     createdAdSets.map(s => ({ name: s.name, adSetId: s.adSetId, adCount: s.ads.length })),
      message:    'Campaña y conjuntos creados. El bot va a subir los videos ahora y te avisa por Telegram.',
    })

  } catch (err: any) {
    console.error('[Campaign create]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
