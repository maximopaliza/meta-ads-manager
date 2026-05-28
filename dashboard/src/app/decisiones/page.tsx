import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'
import DecisionCalendar from '@/components/dashboard/DecisionCalendar'
import DecisionTree from '@/components/dashboard/DecisionTree'
import type { CampNode, AsNode, AdNode } from '@/components/dashboard/DecisionTree'

// ─── helpers ────────────────────────────────────────────────────────────────

function agg(rows: any[]) {
  return rows.reduce(
    (acc, m) => ({
      spend: acc.spend + (m.spend || 0),
      purchases: acc.purchases + (m.purchases || 0),
      purchase_value: acc.purchase_value + (m.purchase_value || 0),
      impressions: acc.impressions + (m.impressions || 0),
      link_clicks: acc.link_clicks + (m.link_clicks || 0),
      landing_page_views: acc.landing_page_views + (m.landing_page_views || 0),
      add_to_cart: acc.add_to_cart + (m.add_to_cart || 0),
      checkout_initiated: acc.checkout_initiated + (m.checkout_initiated || 0),
      hook_rate_sum: acc.hook_rate_sum + (m.hook_rate || 0),
      hook_rate_n: acc.hook_rate_n + (m.hook_rate != null ? 1 : 0),
      ctr_sum: acc.ctr_sum + (m.ctr || 0),
      ctr_n: acc.ctr_n + (m.ctr != null ? 1 : 0),
      frequency_sum: acc.frequency_sum + (m.frequency || 0),
      frequency_n: acc.frequency_n + (m.frequency != null ? 1 : 0),
    }),
    {
      spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
      link_clicks: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0,
      hook_rate_sum: 0, hook_rate_n: 0, ctr_sum: 0, ctr_n: 0,
      frequency_sum: 0, frequency_n: 0,
    }
  )
}

function derive(d: any) {
  return {
    ...d,
    cpa: d.purchases > 0 ? d.spend / d.purchases : null,
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    hook_rate: d.hook_rate_n > 0 ? d.hook_rate_sum / d.hook_rate_n : null,
    ctr: d.ctr_n > 0 ? d.ctr_sum / d.ctr_n : null,
    frequency: d.frequency_n > 0 ? d.frequency_sum / d.frequency_n : null,
  }
}

function pct(a: number | null, b: number | null): number | null {
  if (!b || !a) return null
  return ((a - b) / b) * 100
}

function fmtPct(v: number | null, invert = false) {
  if (v === null) return { text: '—', color: '#64748B' }
  const good = invert ? v < 0 : v > 0
  return {
    text: `${v > 0 ? '+' : ''}${v.toFixed(0)}%`,
    color: good ? '#22C55E' : '#EF4444',
  }
}

function actionSignal(days4: any[]): { label: string; color: string; bg: string; priority: number; border: string } {
  if (days4.length === 0) return { label: '— Sin datos', color: '#64748B', bg: '#64748B10', border: '#64748B20', priority: 99 }

  const recent = days4.slice(-3)
  const totalSpend = recent.reduce((s, d) => s + (d?.spend || 0), 0)
  const totalPurchases = recent.reduce((s, d) => s + (d?.purchases || 0), 0)
  const totalPV = recent.reduce((s, d) => s + (d?.purchase_value || 0), 0)
  const avgCPA = totalPurchases > 0 ? totalSpend / totalPurchases : null
  const avgROAS = totalSpend > 0 ? totalPV / totalSpend : null

  const half = Math.floor(days4.length / 2)
  const older = days4.slice(0, half)
  const newer = days4.slice(half)
  const olderROAS = older.reduce((s, d) => s + (d?.roas || (d?.purchase_value / (d?.spend || 1)) || 0), 0) / (older.length || 1)
  const newerROAS = newer.reduce((s, d) => s + (d?.roas || (d?.purchase_value / (d?.spend || 1)) || 0), 0) / (newer.length || 1)
  const roasTrend = olderROAS > 0 ? (newerROAS - olderROAS) / olderROAS : 0

  let consecutiveZero = 0
  for (let i = days4.length - 1; i >= 0; i--) {
    if ((days4[i]?.purchases || 0) === 0 && (days4[i]?.spend || 0) > 0) consecutiveZero++
    else break
  }

  if (consecutiveZero >= 3 || (avgCPA !== null && avgCPA > CPA_BREAKEVEN * 1.5)) {
    return { label: '⛔ Pausar', color: '#EF4444', bg: '#EF444418', border: '#EF444440', priority: 1 }
  }
  if (totalSpend > 50 && totalPurchases === 0) {
    return { label: '⛔ Pausar', color: '#EF4444', bg: '#EF444418', border: '#EF444440', priority: 1 }
  }
  if (avgCPA !== null && avgCPA > CPA_BREAKEVEN) {
    return { label: '⬇️ Bajar', color: '#F59E0B', bg: '#F59E0B18', border: '#F59E0B40', priority: 2 }
  }
  if (avgROAS !== null && avgROAS >= 2.5 && roasTrend > 0.1) {
    return { label: '🚀 Escalar', color: '#22C55E', bg: '#22C55E18', border: '#22C55E40', priority: 3 }
  }
  if (avgCPA !== null && avgCPA <= CPA_TARGET && roasTrend > 0) {
    return { label: '🚀 Escalar', color: '#22C55E', bg: '#22C55E18', border: '#22C55E40', priority: 3 }
  }
  if (avgCPA !== null && avgCPA <= CPA_TARGET) {
    return { label: '✅ Mantener', color: '#6366F1', bg: '#6366F118', border: '#6366F140', priority: 4 }
  }
  if (roasTrend < -0.2) {
    return { label: '⬇️ Bajar', color: '#F59E0B', bg: '#F59E0B18', border: '#F59E0B40', priority: 2 }
  }
  return { label: '✅ Mantener', color: '#6366F1', bg: '#6366F118', border: '#6366F140', priority: 4 }
}

function detectSignals(days4: any[]): string[] {
  const signals: string[] = []
  if (days4.length < 2) return signals

  const recent = days4.slice(-3)
  const totalSpend = recent.reduce((s, d) => s + (d?.spend || 0), 0)
  const totalPurchases = recent.reduce((s, d) => s + (d?.purchases || 0), 0)

  const ctrs = days4.map(d => d?.ctr).filter(Boolean)
  if (ctrs.length >= 3) {
    const dropping = ctrs.every((v, i) => i === 0 || v <= ctrs[i - 1])
    if (dropping) signals.push('CTR cayendo')
  }

  const hooks = recent.map(d => d?.hook_rate).filter(Boolean)
  const avgHook = hooks.length ? hooks.reduce((s, v) => s + v, 0) / hooks.length : null
  if (avgHook !== null && avgHook < 15) signals.push(`Hook bajo ${avgHook.toFixed(0)}%`)

  const freqs = recent.map(d => d?.frequency).filter(Boolean)
  const avgFreq = freqs.length ? freqs.reduce((s, v) => s + v, 0) / freqs.length : null
  if (avgFreq !== null && avgFreq > 3.5) signals.push(`Fatiga ${avgFreq.toFixed(1)}`)

  if (totalSpend > 30 && totalPurchases === 0) signals.push('Sin ventas')

  if (days4.length >= 2) {
    const roasArr = days4.map(d => d?.roas || (d?.spend > 0 && d?.purchase_value > 0 ? d.purchase_value / d.spend : null)).filter(Boolean)
    if (roasArr.length >= 2 && roasArr[roasArr.length - 1] > roasArr[0] * 1.2) {
      signals.push('ROAS ↑')
    }
  }
  return signals
}

function dayQuality(d: any): 'good' | 'ok' | 'bad' | 'empty' {
  if (!d || (d.spend || 0) < 5) return 'empty'
  if ((d.purchases || 0) >= 2 && d.cpa !== null && d.cpa <= CPA_TARGET) return 'good'
  if ((d.purchases || 0) >= 1 || (d.cpa !== null && d.cpa <= CPA_BREAKEVEN)) return 'ok'
  return 'bad'
}

const qColor  = { good: '#22C55E', ok: '#F59E0B', bad: '#EF4444', empty: '#1A3050' }
const qBg     = { good: '#22C55E22', ok: '#F59E0B22', bad: '#EF444422', empty: '#0E1B30' }
const qBorder = { good: '#22C55E50', ok: '#F59E0B50', bad: '#EF444450', empty: '#1A3050' }

// ─── shared table styles ─────────────────────────────────────────────────────
const TH: any  = { padding: '7px 8px', color: '#64748B', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #1A3050', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: '#0A1422', textAlign: 'right' }
const THL: any = { ...TH, textAlign: 'left' }
const TD: any  = { padding: '7px 8px', fontSize: '11px', borderBottom: '1px solid #0E1B3080', textAlign: 'right', verticalAlign: 'middle' }
const TDL: any = { ...TD, textAlign: 'left' }
const SEP: any = { ...TD, borderLeft: '1px solid #1A3050' }
const THSEP: any = { ...TH, borderLeft: '1px solid #1A3050' }

const CARD = { backgroundColor: '#0E1B30', border: '1px solid #1A3050', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }

// ─── page ────────────────────────────────────────────────────────────────────
export default async function DecisionesPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await headers()
  const sp = await searchParams

  const today = await getLatestDate()
  const { rangeStart: histStart, rangeEnd: histEnd, days: histDays, label: histLabel } = resolveDateRange(sp, today, 30)
  const todayMs = new Date(today + 'T12:00:00Z').getTime()

  const last4Dates = Array.from({ length: 4 }, (_, i) =>
    new Date(todayMs - (3 - i) * 86400000).toISOString().split('T')[0]
  )

  // Calendar always shows 180 days regardless of range selector
  const calDates = Array.from({ length: 180 }, (_, i) =>
    new Date(todayMs - (179 - i) * 86400000).toISOString().split('T')[0]
  )

  const d7start   = new Date(todayMs - 6 * 86400000).toISOString().split('T')[0]
  const d14start  = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const d30start  = new Date(todayMs - 29 * 86400000).toISOString().split('T')[0]
  const prev7start  = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const prev7end    = new Date(todayMs - 7 * 86400000).toISOString().split('T')[0]
  const prev14start = new Date(todayMs - 27 * 86400000).toISOString().split('T')[0]
  const prev14end   = new Date(todayMs - 14 * 86400000).toISOString().split('T')[0]

  const cal180start = new Date(todayMs - 179 * 86400000).toISOString().split('T')[0]
  const fetchStart = [histStart, d30start, cal180start].sort()[0]

  const [mCampAll, mASAll, mAdAll, campaignsRes, adSetsRes, adsRes, accountRes] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', fetchStart).lte('date', today).order('date'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').gte('date', fetchStart).lte('date', today).order('date'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').gte('date', fetchStart).lte('date', today).order('date'),
    supabaseAdmin.from('campaigns').select('id,name,status,daily_budget'),
    supabaseAdmin.from('ad_sets').select('id,name,status,campaign_id'),
    supabaseAdmin.from('ads').select('id,name,status,ad_set_id'),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const mCamp30 = { data: (mCampAll.data || []).filter((m: any) => m.date >= histStart && m.date <= histEnd) }
  const mAS30   = { data: (mASAll.data  || []).filter((m: any) => m.date >= histStart && m.date <= histEnd) }
  const mAd30   = { data: (mAdAll.data  || []).filter((m: any) => m.date >= histStart && m.date <= histEnd) }

  const currency  = accountRes.data?.[0]?.currency || 'ARS'
  const campaigns = campaignsRes.data || []
  const adSets    = adSetsRes.data   || []
  const ads       = adsRes.data      || []

  const campMap = new Map(campaigns.map((c: any) => [c.id, c]))
  const asMap   = new Map(adSets.map((a: any) => [a.id, a]))

  function buildDayIndex(rows: any[]) {
    const idx = new Map<string, Map<string, any>>()
    for (const m of rows) {
      if (!idx.has(m.object_id)) idx.set(m.object_id, new Map())
      idx.get(m.object_id)!.set(m.date, m)
    }
    return idx
  }

  const campIdx = buildDayIndex(mCamp30.data || [])
  const asIdx   = buildDayIndex(mAS30.data   || [])
  const adIdx   = buildDayIndex(mAd30.data   || [])

  function aggRange(idx: Map<string, Map<string, any>>, id: string, start: string, end: string) {
    const dayMap = idx.get(id)
    if (!dayMap) return null
    const rows = [...dayMap.entries()].filter(([d]) => d >= start && d <= end).map(([, m]) => m)
    if (rows.length === 0) return null
    return derive(agg(rows))
  }

  function get4Days(idx: Map<string, Map<string, any>>, id: string) {
    const dayMap = idx.get(id)
    if (!dayMap) return last4Dates.map(() => null)
    return last4Dates.map(d => {
      const m = dayMap.get(d)
      if (!m) return null
      return { ...m, cpa: m.purchases > 0 ? m.spend / m.purchases : null, roas: m.spend > 0 && m.purchase_value > 0 ? m.purchase_value / m.spend : null }
    })
  }

  // Calendar data — use full mCampAll (180d fetch)
  const accountDays = calDates.map(d => {
    const rows = (mCampAll.data || []).filter((m: any) => m.date === d)
    if (rows.length === 0) return { date: d, quality: 'empty' as const, spend: 0, purchases: 0, cpa: null, roas: null }
    const a = derive(agg(rows))
    return { date: d, quality: dayQuality(a), spend: a.spend, purchases: a.purchases, cpa: a.cpa, roas: a.roas }
  })

  const goodDays = accountDays.filter(d => d.quality === 'good')
  const badDays  = accountDays.filter(d => d.quality === 'bad')

  function avgOnDays(dates: string[], metricFn: (m: any) => number | null) {
    const vals: number[] = []
    for (const d of dates) {
      for (const [, dayMap] of adIdx) {
        const m = dayMap.get(d)
        if (m) { const v = metricFn(m); if (v !== null && v !== undefined) vals.push(v) }
      }
    }
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }

  const goodDayDates = goodDays.map(d => d.date)
  const badDayDates  = badDays.map(d => d.date)

  const goodAvg = {
    hook: avgOnDays(goodDayDates, m => m.hook_rate),
    ctr:  avgOnDays(goodDayDates, m => m.ctr),
    freq: avgOnDays(goodDayDates, m => m.frequency),
    cpa:  goodDays.filter(d => d.cpa).reduce((s, d) => s + (d.cpa || 0), 0) / (goodDays.filter(d => d.cpa).length || 1),
    roas: goodDays.filter(d => d.roas).reduce((s, d) => s + (d.roas || 0), 0) / (goodDays.filter(d => d.roas).length || 1),
  }
  const badAvg = {
    hook: avgOnDays(badDayDates, m => m.hook_rate),
    ctr:  avgOnDays(badDayDates, m => m.ctr),
    freq: avgOnDays(badDayDates, m => m.frequency),
    cpa:  badDays.filter(d => d.cpa).reduce((s, d) => s + (d.cpa || 0), 0) / (badDays.filter(d => d.cpa).length || 1),
    roas: badDays.filter(d => d.roas).reduce((s, d) => s + (d.roas || 0), 0) / (badDays.filter(d => d.roas).length || 1),
  }

  // ── Good vs bad days breakdown by level ─────────────────────────────────────
  function metricsByObjectOnDays(metrics: any[], dates: string[]) {
    const byId = new Map<string, any[]>()
    const dateSet = new Set(dates)
    for (const m of metrics) {
      if (dateSet.has(m.date)) {
        if (!byId.has(m.object_id)) byId.set(m.object_id, [])
        byId.get(m.object_id)!.push(m)
      }
    }
    return byId
  }

  const campGood = metricsByObjectOnDays(mCamp30.data || [], goodDayDates)
  const campBad  = metricsByObjectOnDays(mCamp30.data || [], badDayDates)
  const asGood   = metricsByObjectOnDays(mAS30.data   || [], goodDayDates)
  const asBad    = metricsByObjectOnDays(mAS30.data   || [], badDayDates)
  const adGood   = metricsByObjectOnDays(mAd30.data   || [], goodDayDates)
  const adBad    = metricsByObjectOnDays(mAd30.data   || [], badDayDates)

  const campComparison = campaigns
    .map((camp: any) => {
      const g = campGood.get(camp.id)
      const b = campBad.get(camp.id)
      return {
        id: camp.id, name: camp.name || camp.id, status: camp.status,
        good: g ? derive(agg(g)) : null,
        bad:  b ? derive(agg(b)) : null,
      }
    })
    .filter((r: any) => r.good || r.bad)
    .sort((a: any, b: any) => (b.good?.spend || 0) - (a.good?.spend || 0))

  const asComparison = adSets
    .map((as: any) => {
      const g = asGood.get(as.id)
      const b = asBad.get(as.id)
      const campObj = campMap.get(as.campaign_id) as any
      return {
        id: as.id, name: as.name || as.id, campName: campObj?.name || '',
        good: g ? derive(agg(g)) : null,
        bad:  b ? derive(agg(b)) : null,
      }
    })
    .filter((r: any) => r.good || r.bad)
    .sort((a: any, b: any) => (b.good?.spend || 0) - (a.good?.spend || 0))
    .slice(0, 15)

  const adComparison = ads
    .map((ad: any) => {
      const g = adGood.get(ad.id)
      const b = adBad.get(ad.id)
      const asObj = asMap.get(ad.ad_set_id) as any
      return {
        id: ad.id, name: ad.name || ad.id, asName: asObj?.name || '',
        good: g ? derive(agg(g)) : null,
        bad:  b ? derive(agg(b)) : null,
      }
    })
    .filter((r: any) => r.good || r.bad)
    .sort((a: any, b: any) => (b.good?.spend || 0) - (a.good?.spend || 0))
    .slice(0, 15)

  // Ad rows
  const adRows = ads.map((ad: any) => {
    const days4  = get4Days(adIdx, ad.id)
    const d7     = aggRange(adIdx, ad.id, d7start, today)
    const d14    = aggRange(adIdx, ad.id, d14start, today)
    const d30    = aggRange(adIdx, ad.id, d30start, today)
    const prev7  = aggRange(adIdx, ad.id, prev7start, prev7end)
    const prev14 = aggRange(adIdx, ad.id, prev14start, prev14end)
    const signal = actionSignal(days4.filter(Boolean))
    const alerts = detectSignals(days4.filter(Boolean))
    const asObj  = asMap.get(ad.ad_set_id) as any
    const campObj = asObj ? campMap.get(asObj.campaign_id) as any : null
    return { ad, days4, d7, d14, d30, prev7, prev14, signal, alerts, asObj, campObj }
  }).sort((a: any, b: any) => (b.d7?.spend || 0) - (a.d7?.spend || 0))

  const campRows = campaigns.map((camp: any) => {
    const days4  = get4Days(campIdx, camp.id)
    const d7     = aggRange(campIdx, camp.id, d7start, today)
    const d14    = aggRange(campIdx, camp.id, d14start, today)
    const d30    = aggRange(campIdx, camp.id, d30start, today)
    const prev7  = aggRange(campIdx, camp.id, prev7start, prev7end)
    const prev14 = aggRange(campIdx, camp.id, prev14start, prev14end)
    const signal = actionSignal(days4.filter(Boolean))
    return { camp, days4, d7, d14, d30, prev7, prev14, signal }
  }).sort((a: any, b: any) => a.signal.priority - b.signal.priority)

  const asRows = adSets.map((as: any) => {
    const days4  = get4Days(asIdx, as.id)
    const d7     = aggRange(asIdx, as.id, d7start, today)
    const d14    = aggRange(asIdx, as.id, d14start, today)
    const d30    = aggRange(asIdx, as.id, d30start, today)
    const prev7  = aggRange(asIdx, as.id, prev7start, prev7end)
    const prev14 = aggRange(asIdx, as.id, prev14start, prev14end)
    const signal = actionSignal(days4.filter(Boolean))
    const campObj = campMap.get(as.campaign_id) as any
    return { as, days4, d7, d14, d30, prev7, prev14, signal, campObj }
  }).sort((a: any, b: any) => a.signal.priority - b.signal.priority)

  // ── components ───────────────────────────────────────────────────────────

  function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub: string }) {
    return (
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #1A3050', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366F130 0%, #6366F118 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.01em' }}>{title}</h2>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B' }}>{sub}</p>
        </div>
      </div>
    )
  }

  // ── Build campaign tree for DecisionTree ────────────────────────────────
  const last4Labels = last4Dates.map(d => formatDate(d))

  const campTree: CampNode[] = campaigns.map((camp: any) => {
    const cr = campRows.find((r: any) => r.camp.id === camp.id)
    const asForCamp = adSets.filter((as: any) => as.campaign_id === camp.id)
    const asNodes: AsNode[] = asForCamp.map((as: any) => {
      const ar = asRows.find((r: any) => r.as.id === as.id)
      const adsForAs = ads.filter((ad: any) => ad.ad_set_id === as.id)
      const adNodes: AdNode[] = adsForAs.map((ad: any) => {
        const dr = adRows.find((r: any) => r.ad.id === ad.id)
        return {
          id: ad.id, name: ad.name || ad.id, status: ad.status,
          signal: dr?.signal || { label: '— Sin datos', color: '#64748B', bg: '#64748B10', border: '#64748B20', priority: 99 },
          alerts: dr?.alerts || [],
          days4: (dr?.days4 || [null, null, null, null]).map((m: any) => m ? { purchases: m.purchases || 0, spend: m.spend || 0, roas: m.roas, cpa: m.cpa } : null),
          d7: dr?.d7 ? { spend: dr.d7.spend, purchases: dr.d7.purchases, roas: dr.d7.roas, cpa: dr.d7.cpa } : null,
          prev7: dr?.prev7 ? { spend: dr.prev7.spend, purchases: dr.prev7.purchases, roas: dr.prev7.roas, cpa: dr.prev7.cpa } : null,
        }
      }).sort((a: any, b: any) => (b.d7?.spend || 0) - (a.d7?.spend || 0))
      return {
        id: as.id, name: as.name || as.id, status: as.status,
        signal: ar?.signal || { label: '— Sin datos', color: '#64748B', bg: '#64748B10', border: '#64748B20', priority: 99 },
        days4: (ar?.days4 || [null, null, null, null]).map((m: any) => m ? { purchases: m.purchases || 0, spend: m.spend || 0, roas: m.roas, cpa: m.cpa } : null),
        d7: ar?.d7 ? { spend: ar.d7.spend, purchases: ar.d7.purchases, roas: ar.d7.roas, cpa: ar.d7.cpa } : null,
        prev7: ar?.prev7 ? { spend: ar.prev7.spend, purchases: ar.prev7.purchases, roas: ar.prev7.roas, cpa: ar.prev7.cpa } : null,
        ads: adNodes,
      }
    }).sort((a: any, b: any) => (b.d7?.spend || 0) - (a.d7?.spend || 0))
    return {
      id: camp.id, name: camp.name || camp.id, status: camp.status,
      signal: cr?.signal || { label: '— Sin datos', color: '#64748B', bg: '#64748B10', border: '#64748B20', priority: 99 },
      days4: (cr?.days4 || [null, null, null, null]).map((m: any) => m ? { purchases: m.purchases || 0, spend: m.spend || 0, roas: m.roas, cpa: m.cpa } : null),
      d7: cr?.d7 ? { spend: cr.d7.spend, purchases: cr.d7.purchases, roas: cr.d7.roas, cpa: cr.d7.cpa } : null,
      prev7: cr?.prev7 ? { spend: cr.prev7.spend, purchases: cr.prev7.purchases, roas: cr.prev7.roas, cpa: cr.prev7.cpa } : null,
      adSets: asNodes,
    }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    return (b.d7?.spend || 0) - (a.d7?.spend || 0)
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Decisiones" subtitle="Tendencias · Señales · Acción inmediata" />
        <main style={{ padding: '20px', maxWidth: '1700px' }}>

          {/* Range selector */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <RangeSelector />
          </div>

          {/* ── BLOQUE 1: Resumen de señales ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '⛔ Pausar',      count: [...adRows].filter(r => r.signal.priority === 1).length, color: '#EF4444', bg: '#EF444415' },
              { label: '⬇️ Bajar',       count: [...adRows].filter(r => r.signal.priority === 2).length, color: '#F59E0B', bg: '#F59E0B15' },
              { label: '🚀 Escalar',     count: [...adRows].filter(r => r.signal.priority === 3).length, color: '#22C55E', bg: '#22C55E15' },
              { label: '✅ Mantener',    count: [...adRows].filter(r => r.signal.priority === 4).length, color: '#6366F1', bg: '#6366F115' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: s.bg, border: `1px solid ${s.color}30`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', color: s.color, fontWeight: 700, letterSpacing: '0.01em', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.count}</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>anuncios</div>
              </div>
            ))}
          </div>

          {/* ── BLOQUE 2: Calendario mensual — 6 meses completos ─────────── */}
          <div style={CARD}>
            <SectionHeader icon="📅" title="Calendario — 6 meses" sub="Clic en día inicio → clic en día fin → analiza ese período abajo · 🟢 CPA≤$7 · 🟡 ≤$15 · 🔴 sin ventas con gasto" />
            <div style={{ padding: '16px 20px 16px' }}>
              <DecisionCalendar days={accountDays} currency={currency} />
            </div>
          </div>

          {/* ── BLOQUE 3: Buenos vs malos — desglose 4 niveles ──────────── */}
          {(goodDays.length > 0 || badDays.length > 0) && (
            <div style={CARD}>
              <SectionHeader icon="🔍" title="Días buenos vs malos — desglose completo" sub="Qué ocurrió en cada nivel cuando el día fue bueno o malo" />

              {/* Nivel 1: cuenta */}
              <div style={{ padding: '16px 20px 0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  Nivel 1 — Cuenta global
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { title: `🟢 Días buenos — ${goodDays.length}`, color: '#22C55E', bg: '#22C55E10', border: '#22C55E25',
                      rows: [
                        ['ROAS promedio', goodAvg.roas > 0 ? `${goodAvg.roas.toFixed(2)}x` : '—'],
                        ['CPA promedio',  goodAvg.cpa > 0 ? formatCurrency(goodAvg.cpa, currency) : '—'],
                        ['Hook rate avg', goodAvg.hook !== null ? `${goodAvg.hook.toFixed(1)}%` : '—'],
                        ['CTR único avg', goodAvg.ctr  !== null ? `${goodAvg.ctr.toFixed(2)}%`  : '—'],
                        ['Frecuencia avg',goodAvg.freq !== null ? goodAvg.freq.toFixed(1)        : '—'],
                      ]
                    },
                    { title: `🔴 Días malos — ${badDays.length}`, color: '#EF4444', bg: '#EF444410', border: '#EF444425',
                      rows: [
                        ['ROAS promedio', badAvg.roas > 0 ? `${badAvg.roas.toFixed(2)}x` : '—'],
                        ['CPA promedio',  badAvg.cpa > 0 ? formatCurrency(badAvg.cpa, currency) : '—'],
                        ['Hook rate avg', badAvg.hook !== null ? `${badAvg.hook.toFixed(1)}%` : '—'],
                        ['CTR único avg', badAvg.ctr  !== null ? `${badAvg.ctr.toFixed(2)}%`  : '—'],
                        ['Frecuencia avg',badAvg.freq !== null ? badAvg.freq.toFixed(1)        : '—'],
                      ]
                    },
                  ].map(panel => (
                    <div key={panel.title} style={{ backgroundColor: panel.bg, border: `1px solid ${panel.border}`, borderRadius: '8px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: panel.color, marginBottom: '10px' }}>{panel.title}</div>
                      <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <tbody>
                          {panel.rows.map(([label, val]) => (
                            <tr key={label}>
                              <td style={{ padding: '3px 0', color: '#94A3B8', borderBottom: '1px solid #ffffff06' }}>{label}</td>
                              <td style={{ padding: '3px 0', color: panel.color, fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #ffffff06' }}>{val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nivel 2: por campaña */}
              {campComparison.length > 0 && (
                <div style={{ padding: '0 20px 0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingTop: '12px', borderTop: '1px solid #1A3050' }}>
                    Nivel 2 — Por campaña
                  </div>
                  <div style={{ overflowX: 'auto', marginBottom: '4px' }}>
                    <table style={{ borderCollapse: 'collapse', minWidth: '700px', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ ...THL }}>Campaña</th>
                          <th style={{ ...TH, color: '#22C55E' }}>ROAS buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>CPA buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>Ventas buenos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>ROAS malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>CPA malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>Ventas malos</th>
                          <th style={TH}>Diferencia ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campComparison.map((r: any) => {
                          const roasDiff = r.good?.roas && r.bad?.roas ? r.good.roas - r.bad.roas : null
                          return (
                            <tr key={r.id} className="tr-hover">
                              <td style={{ ...TDL, maxWidth: '180px' }}>
                                <span style={{ color: r.status === 'ACTIVE' ? '#F1F5F9' : '#64748B', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.status === 'ACTIVE' ? '🟢 ' : '⏸ '}{r.name}
                                </span>
                              </td>
                              <td style={{ ...TD, color: roasColor(r.good?.roas) }}>{r.good?.roas ? `${r.good.roas.toFixed(2)}x` : '—'}</td>
                              <td style={{ ...TD, color: cpaColor(r.good?.cpa) }}>{r.good?.cpa ? formatCurrency(r.good.cpa, currency) : '—'}</td>
                              <td style={{ ...TD, color: '#22C55E', fontWeight: 600 }}>{r.good?.purchases || '—'}</td>
                              <td style={{ ...TD, color: roasColor(r.bad?.roas) }}>{r.bad?.roas ? `${r.bad.roas.toFixed(2)}x` : '—'}</td>
                              <td style={{ ...TD, color: cpaColor(r.bad?.cpa) }}>{r.bad?.cpa ? formatCurrency(r.bad.cpa, currency) : '—'}</td>
                              <td style={{ ...TD, color: '#EF4444', fontWeight: 600 }}>{r.bad?.purchases || '—'}</td>
                              <td style={{ ...TD, color: roasDiff !== null ? (roasDiff > 0 ? '#22C55E' : '#EF4444') : '#64748B', fontWeight: 700 }}>
                                {roasDiff !== null ? `${roasDiff > 0 ? '+' : ''}${roasDiff.toFixed(2)}x` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Nivel 3: por Ad Set */}
              {asComparison.length > 0 && (
                <div style={{ padding: '0 20px 0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingTop: '12px', borderTop: '1px solid #1A3050' }}>
                    Nivel 3 — Por conjunto de anuncios
                  </div>
                  <div style={{ overflowX: 'auto', marginBottom: '4px' }}>
                    <table style={{ borderCollapse: 'collapse', minWidth: '800px', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ ...THL }}>Ad Set</th>
                          <th style={{ ...THL }}>Campaña</th>
                          <th style={{ ...TH, color: '#22C55E' }}>ROAS buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>CPA buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>Ventas buenos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>ROAS malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>CPA malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>Ventas malos</th>
                          <th style={TH}>Δ ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asComparison.map((r: any) => {
                          const roasDiff = r.good?.roas && r.bad?.roas ? r.good.roas - r.bad.roas : null
                          return (
                            <tr key={r.id} className="tr-hover">
                              <td style={{ ...TDL, maxWidth: '160px' }}><span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span></td>
                              <td style={{ ...TDL, maxWidth: '130px' }}><span style={{ color: '#6366F1', fontSize: '10px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campName}</span></td>
                              <td style={{ ...TD, color: roasColor(r.good?.roas) }}>{r.good?.roas ? `${r.good.roas.toFixed(2)}x` : '—'}</td>
                              <td style={{ ...TD, color: cpaColor(r.good?.cpa) }}>{r.good?.cpa ? formatCurrency(r.good.cpa, currency) : '—'}</td>
                              <td style={{ ...TD, color: '#22C55E', fontWeight: 600 }}>{r.good?.purchases || '—'}</td>
                              <td style={{ ...TD, color: roasColor(r.bad?.roas) }}>{r.bad?.roas ? `${r.bad.roas.toFixed(2)}x` : '—'}</td>
                              <td style={{ ...TD, color: cpaColor(r.bad?.cpa) }}>{r.bad?.cpa ? formatCurrency(r.bad.cpa, currency) : '—'}</td>
                              <td style={{ ...TD, color: '#EF4444', fontWeight: 600 }}>{r.bad?.purchases || '—'}</td>
                              <td style={{ ...TD, color: roasDiff !== null ? (roasDiff > 0 ? '#22C55E' : '#EF4444') : '#64748B', fontWeight: 700 }}>
                                {roasDiff !== null ? `${roasDiff > 0 ? '+' : ''}${roasDiff.toFixed(2)}x` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Nivel 4: por Anuncio */}
              {adComparison.length > 0 && (
                <div style={{ padding: '0 20px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingTop: '12px', borderTop: '1px solid #1A3050' }}>
                    Nivel 4 — Por anuncio (top {adComparison.length})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', minWidth: '900px', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ ...THL }}>Anuncio</th>
                          <th style={{ ...THL }}>Ad Set</th>
                          <th style={{ ...TH, color: '#22C55E' }}>ROAS buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>CPA buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>Ventas buenos</th>
                          <th style={{ ...TH, color: '#22C55E' }}>Hook buenos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>ROAS malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>CPA malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>Ventas malos</th>
                          <th style={{ ...TH, color: '#EF4444' }}>Hook malos</th>
                          <th style={TH}>Δ ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adComparison.map((r: any) => {
                          const roasDiff = r.good?.roas && r.bad?.roas ? r.good.roas - r.bad.roas : null
                          return (
                            <tr key={r.id} className="tr-hover">
                              <td style={{ ...TDL, maxWidth: '180px' }}><span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span></td>
                              <td style={{ ...TDL, maxWidth: '120px' }}><span style={{ color: '#6366F1', fontSize: '10px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.asName}</span></td>
                              <td style={{ ...TD, color: roasColor(r.good?.roas) }}>{r.good?.roas ? `${r.good.roas.toFixed(2)}x` : '—'}</td>
                              <td style={{ ...TD, color: cpaColor(r.good?.cpa) }}>{r.good?.cpa ? formatCurrency(r.good.cpa, currency) : '—'}</td>
                              <td style={{ ...TD, color: '#22C55E', fontWeight: 600 }}>{r.good?.purchases || '—'}</td>
                              <td style={{ ...TD, color: '#22C55E' }}>{r.good?.hook_rate ? `${r.good.hook_rate.toFixed(1)}%` : '—'}</td>
                              <td style={{ ...TD, color: roasColor(r.bad?.roas) }}>{r.bad?.roas ? `${r.bad.roas.toFixed(2)}x` : '—'}</td>
                              <td style={{ ...TD, color: cpaColor(r.bad?.cpa) }}>{r.bad?.cpa ? formatCurrency(r.bad.cpa, currency) : '—'}</td>
                              <td style={{ ...TD, color: '#EF4444', fontWeight: 600 }}>{r.bad?.purchases || '—'}</td>
                              <td style={{ ...TD, color: '#EF4444' }}>{r.bad?.hook_rate ? `${r.bad.hook_rate.toFixed(1)}%` : '—'}</td>
                              <td style={{ ...TD, color: roasDiff !== null ? (roasDiff > 0 ? '#22C55E' : '#EF4444') : '#64748B', fontWeight: 700 }}>
                                {roasDiff !== null ? `${roasDiff > 0 ? '+' : ''}${roasDiff.toFixed(2)}x` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', marginTop: '10px', lineHeight: 1.6 }}>
                    💡 <strong style={{ color: '#94A3B8' }}>Cómo leer esto:</strong> Cada fila muestra cómo se comportó ese anuncio en los días buenos vs malos.
                    Un anuncio con ROAS alto en días buenos y bajo en días malos fue el <em style={{ color: '#F1F5F9' }}>driver</em> de la diferencia.
                    Si todos los anuncios cayeron igual, el problema fue externo (audiencia, CPM, estacionalidad).
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BLOQUE 4: Árbol colapsable Campaña → Conjunto → Anuncio ──── */}
          <div style={CARD}>
            <SectionHeader icon="🎯" title="Campaña → Conjunto → Anuncio" sub="Clic en campaña para ver conjuntos · clic en conjunto para ver anuncios · últimos 4 días + 7d" />
            <DecisionTree campaigns={campTree} last4Labels={last4Labels} currency={currency} />
          </div>

          {/* ── BLOQUE 7: Leyenda ────────────────────────────────────────── */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px', fontSize: '11px', color: '#64748B' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#94A3B8', marginBottom: '10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Señales de acción</div>
                {[
                  { s: '🚀 Escalar', d: 'ROAS subiendo + CPA ≤ $7', c: '#22C55E' },
                  { s: '✅ Mantener', d: 'CPA ≤ $7, estable', c: '#6366F1' },
                  { s: '⬇️ Bajar', d: 'CPA $7–$15 o ROAS cayendo', c: '#F59E0B' },
                  { s: '⛔ Pausar', d: '3 días sin ventas o CPA > $22', c: '#EF4444' },
                ].map(({ s, d, c }) => (
                  <div key={s} style={{ marginBottom: '5px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ color: c, fontWeight: 600, whiteSpace: 'nowrap' }}>{s}</span>
                    <span style={{ color: '#4A5268' }}>— {d}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#94A3B8', marginBottom: '10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Métricas clave</div>
                {[
                  { m: 'Hook rate', d: '≥30% excelente · ≥15% ok · <15% cambiar' },
                  { m: 'CTR',       d: '≥2% excelente · ≥0.8% ok · <0.8% problema' },
                  { m: 'Frecuencia',d: '<2.5 ok · 2.5-3.5 atención · >3.5 fatiga' },
                  { m: 'ROAS',      d: '≥3.5x excelente · ≥1.5x ok · <1.5x pérdida' },
                ].map(({ m, d }) => (
                  <div key={m} style={{ marginBottom: '5px' }}>
                    <span style={{ color: '#F1F5F9', fontWeight: 500 }}>{m}</span>
                    <span style={{ color: '#4A5268' }}> — {d}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#94A3B8', marginBottom: '10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Celdas de días</div>
                <div style={{ marginBottom: '5px', color: '#94A3B8' }}>Número grande = <span style={{ color: '#F1F5F9' }}>ventas del día</span></div>
                <div style={{ marginBottom: '5px', color: '#94A3B8' }}>Segunda línea = <span style={{ color: '#F1F5F9' }}>ROAS</span></div>
                <div style={{ marginBottom: '5px', color: '#94A3B8' }}>Tercera línea = <span style={{ color: '#F1F5F9' }}>gasto</span></div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[{ l: 'Bueno', c: '#22C55E', b: '#22C55E22' }, { l: 'Regular', c: '#F59E0B', b: '#F59E0B22' }, { l: 'Malo', c: '#EF4444', b: '#EF444422' }].map(({ l, c, b }) => (
                    <span key={l} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '4px', backgroundColor: b, color: c, fontWeight: 600 }}>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
