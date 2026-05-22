import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'

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

const qColor  = { good: '#22C55E', ok: '#F59E0B', bad: '#EF4444', empty: '#2D3244' }
const qBg     = { good: '#22C55E22', ok: '#F59E0B22', bad: '#EF444422', empty: '#1A1D27' }
const qBorder = { good: '#22C55E50', ok: '#F59E0B50', bad: '#EF444450', empty: '#2D3244' }

// ─── shared table styles ─────────────────────────────────────────────────────
const TH: any  = { padding: '7px 8px', color: '#64748B', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: '#13151F', textAlign: 'right' }
const THL: any = { ...TH, textAlign: 'left' }
const TD: any  = { padding: '7px 8px', fontSize: '11px', borderBottom: '1px solid #1A1D2780', textAlign: 'right', verticalAlign: 'middle' }
const TDL: any = { ...TD, textAlign: 'left' }
const SEP: any = { ...TD, borderLeft: '1px solid #2D3244' }
const THSEP: any = { ...TH, borderLeft: '1px solid #2D3244' }

const CARD = { backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }

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

  const calDays = Math.min(histDays, 365)
  const calDates = Array.from({ length: calDays }, (_, i) =>
    new Date(new Date(histEnd + 'T12:00:00Z').getTime() - (calDays - 1 - i) * 86400000).toISOString().split('T')[0]
  )

  const d7start   = new Date(todayMs - 6 * 86400000).toISOString().split('T')[0]
  const d14start  = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const d30start  = new Date(todayMs - 29 * 86400000).toISOString().split('T')[0]
  const prev7start  = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const prev7end    = new Date(todayMs - 7 * 86400000).toISOString().split('T')[0]
  const prev14start = new Date(todayMs - 27 * 86400000).toISOString().split('T')[0]
  const prev14end   = new Date(todayMs - 14 * 86400000).toISOString().split('T')[0]

  const fetchStart = histStart < d30start ? histStart : d30start

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

  // Calendar data
  const accountDays = calDates.map(d => {
    const rows = (mCamp30.data || []).filter((m: any) => m.date === d)
    if (rows.length === 0) return { date: d, quality: 'empty' as const, spend: 0, purchases: 0, cpa: null, roas: null }
    const a = derive(agg(rows))
    return { date: d, quality: dayQuality(a), spend: a.spend, purchases: a.purchases, cpa: a.cpa, roas: a.roas }
  })

  const goodDays = accountDays.filter(d => d.quality === 'good')
  const okDays   = accountDays.filter(d => d.quality === 'ok')
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
  }).sort((a: any, b: any) => {
    if (a.signal.priority !== b.signal.priority) return a.signal.priority - b.signal.priority
    return (b.d7?.spend || 0) - (a.d7?.spend || 0)
  })

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

  function DayCell({ m }: { m: any }) {
    if (!m || (m.spend || 0) < 1) return <td style={{ ...TD, color: '#2D3244', fontSize: '10px' }}>—</td>
    const q = dayQuality(m)
    return (
      <td style={{ ...TD, backgroundColor: qBg[q], borderLeft: `2px solid ${qColor[q]}30` }}>
        <div style={{ color: qColor[q], fontWeight: 700, fontSize: '12px', lineHeight: 1.2 }}>{m.purchases || 0}</div>
        <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '1px' }}>{m.roas ? `${m.roas.toFixed(1)}x` : '—'}</div>
        <div style={{ color: '#64748B', fontSize: '9px' }}>{formatCurrency(m.spend || 0, currency)}</div>
      </td>
    )
  }

  function PctCell({ curr, prev, invert = false }: { curr: number | null; prev: number | null; invert?: boolean }) {
    const f = fmtPct(pct(curr, prev), invert)
    return <td style={{ ...TD, color: f.color, fontSize: '11px', fontWeight: 500 }}>{f.text}</td>
  }

  function SignalBadge({ signal }: { signal: ReturnType<typeof actionSignal> }) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '3px',
        fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
        color: signal.color, backgroundColor: signal.bg,
        border: `1px solid ${signal.border}`,
        whiteSpace: 'nowrap', letterSpacing: '0.01em',
      }}>
        {signal.label}
      </span>
    )
  }

  function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub: string }) {
    return (
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #2D3244', display: 'flex', alignItems: 'center', gap: '12px' }}>
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

  // ── grid columns based on range ─────────────────────────────────────────
  const calCols = Math.min(calDays, calDays <= 7 ? calDays : calDays <= 14 ? 7 : calDays <= 30 ? 10 : 15)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
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

          {/* ── BLOQUE 2: Calendario heatmap ─────────────────────────────── */}
          <div style={CARD}>
            <SectionHeader icon="📅" title={`Calendario — ${histLabel}`} sub="Verde = CPA≤$7 · Amarillo = 1 venta o CPA≤$15 · Rojo = sin ventas · Hover para detalles" />
            <div style={{ padding: '16px 20px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${calCols}, 1fr)`, gap: '5px' }}>
                {accountDays.map(d => {
                  const label = new Date(d.date + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
                  return (
                    <div
                      key={d.date}
                      className="day-cell"
                      title={`${d.date}  |  Gasto: ${formatCurrency(d.spend, currency)}  |  Ventas: ${d.purchases}  |  CPA: ${d.cpa ? formatCurrency(d.cpa, currency) : '—'}  |  ROAS: ${d.roas ? `${d.roas.toFixed(2)}x` : '—'}`}
                      style={{
                        backgroundColor: qBg[d.quality],
                        border: `1px solid ${qBorder[d.quality]}`,
                        borderRadius: '7px',
                        padding: '7px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '9px', color: '#64748B', marginBottom: '3px', fontWeight: 500 }}>{label}</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: qColor[d.quality], lineHeight: 1 }}>{d.purchases}</div>
                      <div style={{ fontSize: '9px', color: qColor[d.quality], marginTop: '2px', opacity: 0.8 }}>
                        {d.roas ? `${d.roas.toFixed(1)}x` : d.spend > 0 ? '0x' : '·'}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '14px', fontSize: '11px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: qBg.good, border: `1px solid ${qBorder.good}`, display: 'inline-block' }} />
                  <span style={{ color: '#22C55E', fontWeight: 600 }}>{goodDays.length} buenos</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: qBg.ok, border: `1px solid ${qBorder.ok}`, display: 'inline-block' }} />
                  <span style={{ color: '#F59E0B', fontWeight: 600 }}>{okDays.length} regulares</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: qBg.bad, border: `1px solid ${qBorder.bad}`, display: 'inline-block' }} />
                  <span style={{ color: '#EF4444', fontWeight: 600 }}>{badDays.length} malos</span>
                </span>
                <span style={{ color: '#64748B', marginLeft: 'auto', fontSize: '10px' }}>Hover para ver detalle</span>
              </div>
            </div>
          </div>

          {/* ── BLOQUE 3: Buenos vs malos ─────────────────────────────────── */}
          {(goodDays.length > 0 || badDays.length > 0) && (
            <div style={CARD}>
              <SectionHeader icon="🔍" title="Días buenos vs malos — qué mueve la aguja" sub="Patrones detectados en tus creativos en el período seleccionado" />
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { title: `🟢 Días buenos — ${goodDays.length}`, color: '#22C55E', bg: '#22C55E12', border: '#22C55E25',
                    rows: [
                      ['ROAS promedio', goodAvg.roas > 0 ? `${goodAvg.roas.toFixed(2)}x` : '—'],
                      ['CPA promedio',  goodAvg.cpa > 0 ? formatCurrency(goodAvg.cpa, currency) : '—'],
                      ['Hook rate',     goodAvg.hook !== null ? `${goodAvg.hook.toFixed(1)}%` : '—'],
                      ['CTR único',     goodAvg.ctr  !== null ? `${goodAvg.ctr.toFixed(2)}%`  : '—'],
                      ['Frecuencia',    goodAvg.freq !== null ? goodAvg.freq.toFixed(1)        : '—'],
                    ]
                  },
                  { title: `🔴 Días malos — ${badDays.length}`, color: '#EF4444', bg: '#EF444412', border: '#EF444425',
                    rows: [
                      ['ROAS promedio', badAvg.roas > 0 ? `${badAvg.roas.toFixed(2)}x` : '—'],
                      ['CPA promedio',  badAvg.cpa > 0 ? formatCurrency(badAvg.cpa, currency) : '—'],
                      ['Hook rate',     badAvg.hook !== null ? `${badAvg.hook.toFixed(1)}%` : '—'],
                      ['CTR único',     badAvg.ctr  !== null ? `${badAvg.ctr.toFixed(2)}%`  : '—'],
                      ['Frecuencia',    badAvg.freq !== null ? badAvg.freq.toFixed(1)        : '—'],
                    ]
                  }
                ].map(panel => (
                  <div key={panel.title} style={{ backgroundColor: panel.bg, border: `1px solid ${panel.border}`, borderRadius: '10px', padding: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: panel.color, marginBottom: '14px' }}>{panel.title}</div>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {panel.rows.map(([label, val]) => (
                          <tr key={label}>
                            <td style={{ padding: '5px 0', color: '#94A3B8', borderBottom: '1px solid #ffffff08' }}>{label}</td>
                            <td style={{ padding: '5px 0', color: panel.color, fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #ffffff08' }}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <div style={{ padding: '0 20px 16px', fontSize: '11px', color: '#64748B', lineHeight: 1.6 }}>
                💡 Hook rate en días buenos: <strong style={{ color: '#F1F5F9' }}>
                  {goodAvg.hook && badAvg.hook ? `${goodAvg.hook.toFixed(1)}% vs ${badAvg.hook.toFixed(1)}%` : 'sin datos suficientes'}
                </strong>
                {' · '}
                Frecuencia en días buenos: <strong style={{ color: '#F1F5F9' }}>
                  {goodAvg.freq && badAvg.freq ? `${goodAvg.freq.toFixed(1)} vs ${badAvg.freq.toFixed(1)}` : 'sin datos'}
                </strong>
              </div>
            </div>
          )}

          {/* ── BLOQUE 4: ADS — tabla principal ──────────────────────────── */}
          <div style={CARD}>
            <SectionHeader icon="🎨" title="Anuncios — Decisión por creativo" sub="Últimos 4 días → señal · Comparación 7d / 14d / 30d vs período anterior" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '1900px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...THL, minWidth: '190px', position: 'sticky', left: 0, backgroundColor: '#13151F' }}>Anuncio</th>
                    <th style={{ ...THL, minWidth: '130px' }}>Ad Set</th>
                    <th style={{ ...TH, width: '30px' }}>●</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[0])}</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[1])}</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[2])}</th>
                    <th style={{ ...TH, minWidth: '95px', color: '#6366F1' }}>{formatDate(last4Dates[3])} ★</th>
                    <th style={{ ...THSEP, minWidth: '75px' }}>Gasto 7d</th>
                    <th style={TH}>ROAS 7d</th>
                    <th style={TH}>CPA 7d</th>
                    <th style={TH}>Ventas</th>
                    <th style={TH}>vs -7d</th>
                    <th style={{ ...THSEP, minWidth: '75px' }}>Gasto 14d</th>
                    <th style={TH}>ROAS 14d</th>
                    <th style={TH}>CPA 14d</th>
                    <th style={TH}>vs -14d</th>
                    <th style={{ ...THSEP, minWidth: '75px' }}>Gasto 30d</th>
                    <th style={TH}>ROAS 30d</th>
                    <th style={TH}>CPA 30d</th>
                    <th style={TH}>Ventas</th>
                    <th style={THSEP}>Hook</th>
                    <th style={TH}>CTR</th>
                    <th style={TH}>Frec.</th>
                    <th style={THSEP}>Señales</th>
                    <th style={THSEP}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {adRows.map(({ ad, days4, d7, d14, d30, prev7, prev14, signal, alerts, asObj }: any) => {
                    const todayM = days4[3]
                    return (
                      <tr key={ad.id} className="tr-hover" style={{ opacity: ad.status === 'ACTIVE' ? 1 : 0.45, borderLeft: `3px solid ${signal.color}30` }}>
                        <td style={{ ...TDL, minWidth: '190px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                          <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '185px', fontSize: '11px', fontWeight: 500 }}>{ad.name}</span>
                        </td>
                        <td style={TDL}>
                          <span style={{ color: '#6366F1', fontSize: '10px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{asObj?.name || '—'}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontSize: '8px' }}>
                          <span style={{ color: ad.status === 'ACTIVE' ? '#22C55E' : '#64748B' }}>●</span>
                        </td>
                        {days4.map((m: any, i: number) => <DayCell key={i} m={m} />)}
                        {/* 7d */}
                        <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d7 ? formatCurrency(d7.spend, currency) : <span style={{ color: '#64748B' }}>—</span>}</span></td>
                        <td style={{ ...TD, color: roasColor(d7?.roas) }}>{d7?.roas ? `${d7.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...TD, color: cpaColor(d7?.cpa), fontWeight: 500 }}>{d7?.cpa ? formatCurrency(d7.cpa, currency) : '—'}</td>
                        <td style={{ ...TD, color: (d7?.purchases || 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d7?.purchases || '—'}</td>
                        <PctCell curr={d7?.roas} prev={prev7?.roas} />
                        {/* 14d */}
                        <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d14 ? formatCurrency(d14.spend, currency) : <span style={{ color: '#64748B' }}>—</span>}</span></td>
                        <td style={{ ...TD, color: roasColor(d14?.roas) }}>{d14?.roas ? `${d14.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...TD, color: cpaColor(d14?.cpa), fontWeight: 500 }}>{d14?.cpa ? formatCurrency(d14.cpa, currency) : '—'}</td>
                        <PctCell curr={d14?.roas} prev={prev14?.roas} />
                        {/* 30d */}
                        <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d30 ? formatCurrency(d30.spend, currency) : <span style={{ color: '#64748B' }}>—</span>}</span></td>
                        <td style={{ ...TD, color: roasColor(d30?.roas) }}>{d30?.roas ? `${d30.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...TD, color: cpaColor(d30?.cpa), fontWeight: 500 }}>{d30?.cpa ? formatCurrency(d30.cpa, currency) : '—'}</td>
                        <td style={{ ...TD, color: (d30?.purchases || 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d30?.purchases || '—'}</td>
                        {/* Live */}
                        <td style={{ ...SEP, color: todayM?.hook_rate ? (todayM.hook_rate >= 30 ? '#22C55E' : todayM.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#64748B' }}>
                          {todayM?.hook_rate ? `${todayM.hook_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...TD, color: todayM?.ctr ? (todayM.ctr >= 2 ? '#22C55E' : todayM.ctr >= 0.8 ? '#F59E0B' : '#EF4444') : '#64748B' }}>
                          {todayM?.ctr ? `${todayM.ctr.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ ...TD, color: todayM?.frequency ? (todayM.frequency > 3.5 ? '#EF4444' : todayM.frequency > 2.5 ? '#F59E0B' : '#94A3B8') : '#64748B' }}>
                          {todayM?.frequency ? todayM.frequency.toFixed(1) : '—'}
                        </td>
                        {/* Signals */}
                        <td style={{ ...SEP, maxWidth: '160px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {alerts.length === 0
                              ? <span style={{ color: '#64748B', fontSize: '10px' }}>—</span>
                              : alerts.map((s: string, i: number) => (
                                <span key={i} style={{ fontSize: '9px', padding: '2px 6px', backgroundColor: '#2D3244', color: '#94A3B8', borderRadius: '4px', whiteSpace: 'nowrap' }}>{s}</span>
                              ))
                            }
                          </div>
                        </td>
                        {/* Action */}
                        <td style={SEP}>
                          <SignalBadge signal={signal} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── BLOQUE 5: Ad Sets ─────────────────────────────────────────── */}
          <div style={CARD}>
            <SectionHeader icon="🎯" title="Conjuntos de anuncios" sub="Tendencia 4 días + comparación por período" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '1400px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...THL, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#13151F' }}>Conjunto</th>
                    <th style={THL}>Campaña</th>
                    <th style={{ ...TH, width: '30px' }}>●</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[0])}</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[1])}</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[2])}</th>
                    <th style={{ ...TH, minWidth: '95px', color: '#6366F1' }}>{formatDate(last4Dates[3])} ★</th>
                    <th style={THSEP}>Gasto 7d</th>
                    <th style={TH}>ROAS 7d</th>
                    <th style={TH}>CPA 7d</th>
                    <th style={TH}>vs -7d</th>
                    <th style={THSEP}>Gasto 14d</th>
                    <th style={TH}>ROAS 14d</th>
                    <th style={TH}>vs -14d</th>
                    <th style={THSEP}>Gasto 30d</th>
                    <th style={TH}>ROAS 30d</th>
                    <th style={TH}>CPA 30d</th>
                    <th style={TH}>Ventas 30d</th>
                    <th style={THSEP}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {asRows.map(({ as, days4, d7, d14, d30, prev7, prev14, signal, campObj }: any) => (
                    <tr key={as.id} className="tr-hover" style={{ opacity: as.status === 'ACTIVE' ? 1 : 0.45, borderLeft: `3px solid ${signal.color}30` }}>
                      <td style={{ ...TDL, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                        <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '175px', fontSize: '11px', fontWeight: 500 }}>{as.name}</span>
                      </td>
                      <td style={TDL}>
                        <span style={{ color: '#94A3B8', fontSize: '10px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{campObj?.name || '—'}</span>
                      </td>
                      <td style={{ ...TD, textAlign: 'center', fontSize: '8px' }}>
                        <span style={{ color: as.status === 'ACTIVE' ? '#22C55E' : '#64748B' }}>●</span>
                      </td>
                      {days4.map((m: any, i: number) => <DayCell key={i} m={m} />)}
                      <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d7 ? formatCurrency(d7.spend, currency) : '—'}</span></td>
                      <td style={{ ...TD, color: roasColor(d7?.roas) }}>{d7?.roas ? `${d7.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...TD, color: cpaColor(d7?.cpa) }}>{d7?.cpa ? formatCurrency(d7.cpa, currency) : '—'}</td>
                      <PctCell curr={d7?.roas} prev={prev7?.roas} />
                      <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d14 ? formatCurrency(d14.spend, currency) : '—'}</span></td>
                      <td style={{ ...TD, color: roasColor(d14?.roas) }}>{d14?.roas ? `${d14.roas.toFixed(2)}x` : '—'}</td>
                      <PctCell curr={d14?.roas} prev={prev14?.roas} />
                      <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d30 ? formatCurrency(d30.spend, currency) : '—'}</span></td>
                      <td style={{ ...TD, color: roasColor(d30?.roas) }}>{d30?.roas ? `${d30.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...TD, color: cpaColor(d30?.cpa) }}>{d30?.cpa ? formatCurrency(d30.cpa, currency) : '—'}</td>
                      <td style={{ ...TD, color: (d30?.purchases || 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d30?.purchases || '—'}</td>
                      <td style={SEP}><SignalBadge signal={signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── BLOQUE 6: Campañas ────────────────────────────────────────── */}
          <div style={CARD}>
            <SectionHeader icon="📣" title="Campañas" sub="Vista general — los detalles están en los anuncios y conjuntos" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '1200px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...THL, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#13151F' }}>Campaña</th>
                    <th style={{ ...TH, width: '30px' }}>●</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[0])}</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[1])}</th>
                    <th style={{ ...TH, minWidth: '95px' }}>{formatDate(last4Dates[2])}</th>
                    <th style={{ ...TH, minWidth: '95px', color: '#6366F1' }}>{formatDate(last4Dates[3])} ★</th>
                    <th style={THSEP}>Gasto 7d</th>
                    <th style={TH}>ROAS 7d</th>
                    <th style={TH}>CPA 7d</th>
                    <th style={TH}>Ventas 7d</th>
                    <th style={TH}>vs -7d</th>
                    <th style={THSEP}>Gasto 14d</th>
                    <th style={TH}>ROAS 14d</th>
                    <th style={TH}>vs -14d</th>
                    <th style={THSEP}>Gasto 30d</th>
                    <th style={TH}>ROAS 30d</th>
                    <th style={TH}>CPA 30d</th>
                    <th style={TH}>Ventas 30d</th>
                    <th style={THSEP}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {campRows.map(({ camp, days4, d7, d14, d30, prev7, prev14, signal }: any) => (
                    <tr key={camp.id} className="tr-hover" style={{ opacity: camp.status === 'ACTIVE' ? 1 : 0.45, borderLeft: `3px solid ${signal.color}30` }}>
                      <td style={{ ...TDL, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                        <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '175px', fontSize: '11px', fontWeight: 500 }}>{camp.name}</span>
                      </td>
                      <td style={{ ...TD, textAlign: 'center', fontSize: '8px' }}>
                        <span style={{ color: camp.status === 'ACTIVE' ? '#22C55E' : '#64748B' }}>●</span>
                      </td>
                      {days4.map((m: any, i: number) => <DayCell key={i} m={m} />)}
                      <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d7 ? formatCurrency(d7.spend, currency) : '—'}</span></td>
                      <td style={{ ...TD, color: roasColor(d7?.roas) }}>{d7?.roas ? `${d7.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...TD, color: cpaColor(d7?.cpa) }}>{d7?.cpa ? formatCurrency(d7.cpa, currency) : '—'}</td>
                      <td style={{ ...TD, color: (d7?.purchases || 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d7?.purchases || '—'}</td>
                      <PctCell curr={d7?.roas} prev={prev7?.roas} />
                      <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d14 ? formatCurrency(d14.spend, currency) : '—'}</span></td>
                      <td style={{ ...TD, color: roasColor(d14?.roas) }}>{d14?.roas ? `${d14.roas.toFixed(2)}x` : '—'}</td>
                      <PctCell curr={d14?.roas} prev={prev14?.roas} />
                      <td style={SEP}><span style={{ color: '#F1F5F9' }}>{d30 ? formatCurrency(d30.spend, currency) : '—'}</span></td>
                      <td style={{ ...TD, color: roasColor(d30?.roas) }}>{d30?.roas ? `${d30.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...TD, color: cpaColor(d30?.cpa) }}>{d30?.cpa ? formatCurrency(d30.cpa, currency) : '—'}</td>
                      <td style={{ ...TD, color: (d30?.purchases || 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d30?.purchases || '—'}</td>
                      <td style={SEP}><SignalBadge signal={signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
