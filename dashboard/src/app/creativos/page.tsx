import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import RangeSelector from '@/components/dashboard/RangeSelector'
import { Suspense } from 'react'
import { getLatestDate, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import CreativosGrid from '@/components/creativos/CreativosGrid'

// ── Helpers ───────────────────────────────────────────────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#7A90AA'
const SURFACE = '#0C0F1A', BORDER = '#1A4080'

function healthScore(m: any): { label: string; color: string; bg: string; border: string; priority: number } {
  if (!m || m.spend < 1) return { label: '— Sin datos', color: M, bg: SURFACE, border: BORDER, priority: 0 }
  if (m.spend > 50 && m.purchases === 0)
    return { label: '⛔ Pausar', color: R, bg: '#EF444412', border: '#EF444435', priority: 1 }
  if (m.cpa !== null && m.cpa > CPA_BREAKEVEN * 1.5)
    return { label: '⛔ Pausar', color: R, bg: '#EF444412', border: '#EF444435', priority: 1 }
  if (m.cpa !== null && m.cpa > CPA_BREAKEVEN)
    return { label: '⬇ Bajar',  color: R, bg: '#EF444412', border: '#EF444435', priority: 2 }
  if (m.frequency !== null && m.frequency > 3.5 && (m.cpa === null || m.cpa > CPA_TARGET))
    return { label: '😴 Fatiga', color: Y, bg: '#F59E0B12', border: '#F59E0B35', priority: 2 }
  if (m.roas !== null && m.roas >= 3.5 && m.cpa !== null && m.cpa <= CPA_TARGET)
    return { label: '🚀 Escalar', color: G, bg: '#22C55E12', border: '#22C55E35', priority: 5 }
  if (m.cpa !== null && m.cpa <= CPA_TARGET)
    return { label: '✅ Bueno',  color: G, bg: '#22C55E12', border: '#22C55E35', priority: 4 }
  if (m.roas !== null && m.roas >= 1.5)
    return { label: '🟡 OK',    color: Y, bg: '#F59E0B12', border: '#F59E0B35', priority: 3 }
  if (m.spend > 20)
    return { label: '⚠ Monit.', color: Y, bg: '#F59E0B12', border: '#F59E0B35', priority: 2 }
  return { label: '— Sin datos', color: M, bg: SURFACE, border: BORDER, priority: 0 }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function CreativosPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await headers()
  const sp = await searchParams
  const today = await getLatestDate()
  const { rangeStart, rangeEnd, label } = resolveDateRange(sp, today, 7)

  const [adsRes, rangeM, accountRes] = await Promise.all([
    supabaseAdmin.from('ads').select(
      '*, ad_sets(id, name, status, daily_budget, campaign_id, campaigns(id, name, status, daily_budget, lifetime_budget))'
    ),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').gte('date', rangeStart).lte('date', rangeEnd),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'

  // ── Aggregate metrics ─────────────────────────────────────────────────────
  const ZERO = () => ({
    spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
    link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0,
    add_to_cart: 0, checkout_initiated: 0, video_3s_views: 0,
    freq_w: 0, hook_w: 0, hold_w: 0, thruplay_w: 0, ctr_pv_w: 0, video_avg_w: 0,
  })
  const rangeAgg = new Map<string, any>()
  for (const m of rangeM.data || []) {
    const e = rangeAgg.get(m.object_id) || ZERO()
    const imp = m.impressions || 0
    const v3s = m.video_3s_views || 0
    rangeAgg.set(m.object_id, {
      spend:              e.spend              + (m.spend || 0),
      purchases:          e.purchases          + (m.purchases || 0),
      purchase_value:     e.purchase_value     + (m.purchase_value || 0),
      impressions:        e.impressions        + imp,
      link_clicks:        e.link_clicks        + (m.link_clicks || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach:              e.reach              + (m.reach || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart:        e.add_to_cart        + (m.add_to_cart || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      video_3s_views:     e.video_3s_views     + v3s,
      freq_w:             e.freq_w             + (m.frequency || 0) * imp,
      hook_w:             e.hook_w             + (m.hook_rate || 0) * imp,
      hold_w:             e.hold_w             + (m.hold_rate || 0) * v3s,
      thruplay_w:         e.thruplay_w         + (m.thruplay_rate || 0) * imp,
      ctr_pv_w:           e.ctr_pv_w           + (m.ctr_post_view || 0) * v3s,
      video_avg_w:        e.video_avg_w        + (m.video_avg_time_watched || 0) * imp,
    })
  }

  function derive(raw: any) {
    if (!raw || raw.spend < 0.01) return null
    const imp = raw.impressions || 0
    const v3s = raw.video_3s_views || 0
    const lc  = raw.link_clicks || 0
    return {
      spend:              raw.spend,
      purchases:          raw.purchases,
      purchase_value:     raw.purchase_value,
      impressions:        imp,
      unique_link_clicks: raw.unique_link_clicks || 0,
      landing_page_views: raw.landing_page_views || 0,
      add_to_cart:        raw.add_to_cart || 0,
      checkout_initiated: raw.checkout_initiated || 0,
      roas:           raw.spend > 0     ? raw.purchase_value / raw.spend : null,
      cpa:            raw.purchases > 0 ? raw.spend / raw.purchases : null,
      cpm:            imp > 0           ? raw.spend / imp * 1000 : null,
      ctr:            raw.reach > 0 && raw.unique_link_clicks > 0 ? raw.unique_link_clicks / raw.reach * 100 : null,
      cpc:            lc > 0            ? raw.spend / lc : null,
      cost_per_atc:   raw.add_to_cart > 0 ? raw.spend / raw.add_to_cart : null,
      traf_ef:        lc > 0 && raw.landing_page_views > 0 ? raw.landing_page_views / lc * 100 : null,
      conv_web:       raw.landing_page_views > 0 && raw.purchases > 0 ? raw.purchases / raw.landing_page_views * 100 : null,
      frequency:      imp > 0           ? raw.freq_w / imp : null,
      hook_rate:      imp > 0           ? raw.hook_w / imp : null,
      video_avg:      imp > 0           ? raw.video_avg_w / imp : null,
      hold_rate:      v3s > 0           ? raw.hold_w / v3s : null,
      thruplay_rate:  imp > 0           ? raw.thruplay_w / imp : null,
      ctr_post_view:  v3s > 0           ? raw.ctr_pv_w / v3s : null,
    }
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows = (adsRes.data || []).map((ad: any) => {
    const campActive    = ad.ad_sets?.campaigns?.status === 'ACTIVE'
    const asActive      = ad.ad_sets?.status === 'ACTIVE'
    const adActive      = ad.status === 'ACTIVE'
    const effectiveActive = campActive && asActive && adActive

    const t = derive(rangeAgg.get(ad.id))
    const score = healthScore(t)

    // Budget: CBO = campaign has budget, non-CBO = ad_set has budget
    const campBudget  = ad.ad_sets?.campaigns?.daily_budget ?? null
    const adSetBudget = ad.ad_sets?.daily_budget ?? null
    const isCBO       = campBudget != null
    const budgetCents = isCBO ? campBudget : adSetBudget

    return {
      id:              ad.id,
      name:            ad.name,
      status:          ad.status,
      effectiveActive,
      thumbnail:       ad.thumbnail_url || ad.creative_thumbnail_url || null,
      score,
      campName:        ad.ad_sets?.campaigns?.name || '',
      asName:          ad.ad_sets?.name || '',
      adSetId:         ad.ad_sets?.id || '',
      campId:          ad.ad_sets?.campaign_id || '',
      budgetCents,
      budgetObjectId:  isCBO ? (ad.ad_sets?.campaign_id || '') : (ad.ad_sets?.id || ''),
      budgetObjectType: (isCBO ? 'campaign' : 'ad_set') as 'campaign' | 'ad_set',
      isCBO,
      t,
    }
  }).filter((r: any) => r.t || r.effectiveActive)
    .sort((a: any, b: any) => {
      // 1. Active before paused
      if (a.effectiveActive && !b.effectiveActive) return -1
      if (!a.effectiveActive && b.effectiveActive) return 1
      // 2. Within active: lowest budget first
      if (a.effectiveActive && b.effectiveActive) {
        const aBudget = a.budgetCents ?? Infinity
        const bBudget = b.budgetCents ?? Infinity
        return aBudget - bBudget
      }
      // 3. Within paused: highest spend first
      return (b.t?.spend || 0) - (a.t?.spend || 0)
    })

  // ── Score counts ──────────────────────────────────────────────────────────
  const scoreCount = {
    escalar: rows.filter((r: any) => r.score.priority === 5).length,
    bueno:   rows.filter((r: any) => r.score.priority === 4).length,
    ok:      rows.filter((r: any) => r.score.priority === 3).length,
    revisar: rows.filter((r: any) => r.score.priority <= 2 && r.score.priority > 0).length,
  }

  // ── Account totals ────────────────────────────────────────────────────────
  const withData = rows.filter((r: any) => r.t)
  const totalSpend     = withData.reduce((s: number, r: any) => s + (r.t.spend || 0), 0)
  const totalPurchases = withData.reduce((s: number, r: any) => s + (r.t.purchases || 0), 0)
  const totalValue     = withData.reduce((s: number, r: any) => s + (r.t.purchase_value || 0), 0)
  const totalRoas      = totalSpend > 0 ? totalValue / totalSpend : null
  const totalCpa       = totalPurchases > 0 ? totalSpend / totalPurchases : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Creativos" subtitle={`${rows.length} anuncios · ${label}`} />
        <main style={{ padding: '20px', maxWidth: '1800px' }}>

          {/* Range selector — server-rendered wrapper, client component inside */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <Suspense fallback={null}><RangeSelector /></Suspense>
          </div>

          {/* All interactive UI lives in the client component */}
          <CreativosGrid
            rows={rows}
            currency={currency}
            totalSpend={totalSpend}
            totalPurchases={totalPurchases}
            totalRoas={totalRoas}
            totalCpa={totalCpa}
            scoreCount={scoreCount}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            label={label}
          />

        </main>
      </div>
    </div>
  )
}
