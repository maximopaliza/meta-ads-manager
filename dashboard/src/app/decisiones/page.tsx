import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'

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

// Action signal based on 4-day trend
function actionSignal(days4: any[]): { label: string; color: string; bg: string; priority: number } {
  if (days4.length === 0) return { label: '— Sin datos', color: '#64748B', bg: '#64748B15', priority: 99 }

  const recent = days4.slice(-3) // last 3 days
  const totalSpend = recent.reduce((s, d) => s + (d?.spend || 0), 0)
  const totalPurchases = recent.reduce((s, d) => s + (d?.purchases || 0), 0)
  const totalPV = recent.reduce((s, d) => s + (d?.purchase_value || 0), 0)
  const avgCPA = totalPurchases > 0 ? totalSpend / totalPurchases : null
  const avgROAS = totalSpend > 0 ? totalPV / totalSpend : null

  // Trend: compare last 2 days vs first 2 days
  const half = Math.floor(days4.length / 2)
  const older = days4.slice(0, half)
  const newer = days4.slice(half)
  const olderROAS = older.reduce((s, d) => s + (d?.roas || d?.purchase_value / (d?.spend || 1) || 0), 0) / (older.length || 1)
  const newerROAS = newer.reduce((s, d) => s + (d?.roas || d?.purchase_value / (d?.spend || 1) || 0), 0) / (newer.length || 1)
  const roasTrend = olderROAS > 0 ? (newerROAS - olderROAS) / olderROAS : 0

  // Consecutive days without sales
  let consecutiveZero = 0
  for (let i = days4.length - 1; i >= 0; i--) {
    if ((days4[i]?.purchases || 0) === 0 && (days4[i]?.spend || 0) > 0) consecutiveZero++
    else break
  }

  if (consecutiveZero >= 3 || (avgCPA !== null && avgCPA > CPA_BREAKEVEN * 1.5)) {
    return { label: '⛔ Pausar', color: '#EF4444', bg: '#EF444415', priority: 1 }
  }
  if (avgCPA !== null && avgCPA > CPA_BREAKEVEN) {
    return { label: '⬇️ Bajar presupuesto', color: '#F59E0B', bg: '#F59E0B15', priority: 2 }
  }
  if (totalSpend > 50 && totalPurchases === 0) {
    return { label: '⛔ Pausar', color: '#EF4444', bg: '#EF444415', priority: 1 }
  }
  if (avgROAS !== null && avgROAS >= 2.5 && roasTrend > 0.1) {
    return { label: '🚀 Escalar', color: '#22C55E', bg: '#22C55E15', priority: 3 }
  }
  if (avgCPA !== null && avgCPA <= CPA_TARGET && roasTrend > 0) {
    return { label: '🚀 Escalar', color: '#22C55E', bg: '#22C55E15', priority: 3 }
  }
  if (avgCPA !== null && avgCPA <= CPA_TARGET) {
    return { label: '✅ Mantener', color: '#6366F1', bg: '#6366F115', priority: 4 }
  }
  if (roasTrend < -0.2) {
    return { label: '⬇️ Bajar presupuesto', color: '#F59E0B', bg: '#F59E0B15', priority: 2 }
  }
  return { label: '✅ Mantener', color: '#6366F1', bg: '#6366F115', priority: 4 }
}

// Detect specific problems in 4-day trend for an ad
function detectSignals(days4: any[], adName: string): string[] {
  const signals: string[] = []
  if (days4.length < 2) return signals

  const recent = days4.slice(-3)
  const totalSpend = recent.reduce((s, d) => s + (d?.spend || 0), 0)
  const totalPurchases = recent.reduce((s, d) => s + (d?.purchases || 0), 0)

  // CTR dropping 3 days in a row
  const ctrs = days4.map(d => d?.ctr).filter(Boolean)
  if (ctrs.length >= 3) {
    const dropping = ctrs.every((v, i) => i === 0 || v <= ctrs[i - 1])
    if (dropping) signals.push('CTR cayendo')
  }

  // Hook rate low
  const hooks = recent.map(d => d?.hook_rate).filter(Boolean)
  const avgHook = hooks.length ? hooks.reduce((s, v) => s + v, 0) / hooks.length : null
  if (avgHook !== null && avgHook < 15) signals.push(`Hook bajo (${avgHook.toFixed(0)}%)`)

  // Frequency high
  const freqs = recent.map(d => d?.frequency).filter(Boolean)
  const avgFreq = freqs.length ? freqs.reduce((s, v) => s + v, 0) / freqs.length : null
  if (avgFreq !== null && avgFreq > 3.5) signals.push(`Fatiga frec. ${avgFreq.toFixed(1)}`)

  // Spend without purchases
  if (totalSpend > 30 && totalPurchases === 0) signals.push('Gasto sin ventas')

  // ROAS improving
  if (days4.length >= 2) {
    const roasArr = days4.map(d => d?.roas || (d?.spend > 0 && d?.purchase_value > 0 ? d.purchase_value / d.spend : null)).filter(Boolean)
    if (roasArr.length >= 2) {
      const improving = roasArr[roasArr.length - 1] > roasArr[0] * 1.2
      if (improving) signals.push('ROAS mejorando')
    }
  }

  return signals
}

function dayQuality(d: any): 'good' | 'ok' | 'bad' | 'empty' {
  if (!d || (d.spend || 0) < 5) return 'empty'
  if ((d.purchases || 0) >= 2 && d.cpa !== null && d.cpa <= CPA_TARGET) return 'good'
  if ((d.purchases || 0) >= 1 || ((d.cpa !== null) && d.cpa <= CPA_BREAKEVEN)) return 'ok'
  return 'bad'
}

const qualityColor = { good: '#22C55E', ok: '#F59E0B', bad: '#EF4444', empty: '#2D3244' }
const qualityBg = { good: '#22C55E20', ok: '#F59E0B20', bad: '#EF444420', empty: '#1A1D27' }

// ─── styles ─────────────────────────────────────────────────────────────────

const th: any = {
  padding: '6px 8px', color: '#64748B', fontSize: '10px', fontWeight: 600,
  borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap', textTransform: 'uppercase',
  letterSpacing: '0.03em', backgroundColor: '#13151F', textAlign: 'right',
}
const thL: any = { ...th, textAlign: 'left' }
const td: any = { padding: '6px 8px', fontSize: '11px', borderBottom: '1px solid #1A1D27', textAlign: 'right', verticalAlign: 'middle' }
const tdL: any = { ...td, textAlign: 'left' }
const sep: any = { ...td, borderLeft: '1px solid #2D3244' }
const thSep: any = { ...th, borderLeft: '1px solid #2D3244' }

// ─── page ────────────────────────────────────────────────────────────────────

export default async function DecisionesPage() {
  await headers()

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()

  // Build date arrays
  const last4Dates = Array.from({ length: 4 }, (_, i) =>
    new Date(todayMs - (3 - i) * 86400000).toISOString().split('T')[0]
  )
  const last30Dates = Array.from({ length: 30 }, (_, i) =>
    new Date(todayMs - (29 - i) * 86400000).toISOString().split('T')[0]
  )

  const d7start = new Date(todayMs - 6 * 86400000).toISOString().split('T')[0]
  const d14start = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const d30start = new Date(todayMs - 29 * 86400000).toISOString().split('T')[0]
  const prev7start = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const prev7end = new Date(todayMs - 7 * 86400000).toISOString().split('T')[0]
  const prev14start = new Date(todayMs - 27 * 86400000).toISOString().split('T')[0]
  const prev14end = new Date(todayMs - 14 * 86400000).toISOString().split('T')[0]

  // Fetch all data in parallel
  const [
    mCamp30, mAS30, mAd30,
    campaignsRes, adSetsRes, adsRes,
    accountRes,
  ] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', d30start).lte('date', today).order('date'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').gte('date', d30start).lte('date', today).order('date'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').gte('date', d30start).lte('date', today).order('date'),
    supabaseAdmin.from('campaigns').select('id,name,status,daily_budget'),
    supabaseAdmin.from('ad_sets').select('id,name,status,campaign_id'),
    supabaseAdmin.from('ads').select('id,name,status,ad_set_id'),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'ARS'
  const campaigns = campaignsRes.data || []
  const adSets = adSetsRes.data || []
  const ads = adsRes.data || []

  const campMap = new Map(campaigns.map((c: any) => [c.id, c]))
  const asMap = new Map(adSets.map((a: any) => [a.id, a]))
  const adMap = new Map(ads.map((a: any) => [a.id, a]))

  // Index metrics by object_id + date
  function buildDayIndex(rows: any[]) {
    const idx = new Map<string, Map<string, any>>()
    for (const m of rows) {
      if (!idx.has(m.object_id)) idx.set(m.object_id, new Map())
      idx.get(m.object_id)!.set(m.date, m)
    }
    return idx
  }

  const campIdx = buildDayIndex(mCamp30.data || [])
  const asIdx = buildDayIndex(mAS30.data || [])
  const adIdx = buildDayIndex(mAd30.data || [])

  // Aggregate a date range for an entity
  function aggRange(idx: Map<string, Map<string, any>>, id: string, start: string, end: string) {
    const dayMap = idx.get(id)
    if (!dayMap) return null
    const rows = [...dayMap.entries()].filter(([d]) => d >= start && d <= end).map(([, m]) => m)
    if (rows.length === 0) return null
    return derive(agg(rows))
  }

  // Get 4-day slice per entity
  function get4Days(idx: Map<string, Map<string, any>>, id: string) {
    const dayMap = idx.get(id)
    if (!dayMap) return last4Dates.map(() => null)
    return last4Dates.map(d => {
      const m = dayMap.get(d)
      if (!m) return null
      return { ...m, cpa: m.purchases > 0 ? m.spend / m.purchases : null, roas: m.spend > 0 && m.purchase_value > 0 ? m.purchase_value / m.spend : null }
    })
  }

  // ── Account-level day calendar (30 days) ──────────────────────────────────
  const accountDays = last30Dates.map(d => {
    const rows = (mCamp30.data || []).filter((m: any) => m.date === d)
    if (rows.length === 0) return { date: d, quality: 'empty' as const, spend: 0, purchases: 0, cpa: null, roas: null }
    const a = derive(agg(rows))
    return { date: d, quality: dayQuality(a), spend: a.spend, purchases: a.purchases, cpa: a.cpa, roas: a.roas }
  })

  const goodDays = accountDays.filter(d => d.quality === 'good')
  const badDays = accountDays.filter(d => d.quality === 'bad')

  // Avg metrics on good vs bad days across ALL ads
  function avgOnDays(dates: string[], metricFn: (m: any) => number | null) {
    const vals: number[] = []
    for (const d of dates) {
      for (const [, dayMap] of adIdx) {
        const m = dayMap.get(d)
        if (m) {
          const v = metricFn(m)
          if (v !== null && v !== undefined) vals.push(v)
        }
      }
    }
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }

  const goodDayDates = goodDays.map(d => d.date)
  const badDayDates = badDays.map(d => d.date)

  const goodAvg = {
    hook: avgOnDays(goodDayDates, m => m.hook_rate),
    ctr: avgOnDays(goodDayDates, m => m.ctr),
    freq: avgOnDays(goodDayDates, m => m.frequency),
    cpa: goodDays.filter(d => d.cpa).reduce((s, d) => s + (d.cpa || 0), 0) / (goodDays.filter(d => d.cpa).length || 1),
    roas: goodDays.filter(d => d.roas).reduce((s, d) => s + (d.roas || 0), 0) / (goodDays.filter(d => d.roas).length || 1),
  }
  const badAvg = {
    hook: avgOnDays(badDayDates, m => m.hook_rate),
    ctr: avgOnDays(badDayDates, m => m.ctr),
    freq: avgOnDays(badDayDates, m => m.frequency),
    cpa: badDays.filter(d => d.cpa).reduce((s, d) => s + (d.cpa || 0), 0) / (badDays.filter(d => d.cpa).length || 1),
    roas: badDays.filter(d => d.roas).reduce((s, d) => s + (d.roas || 0), 0) / (badDays.filter(d => d.roas).length || 1),
  }

  // ── Build ad rows (main table) ────────────────────────────────────────────
  const adRows = ads.map((ad: any) => {
    const days4 = get4Days(adIdx, ad.id)
    const d7 = aggRange(adIdx, ad.id, d7start, today)
    const d14 = aggRange(adIdx, ad.id, d14start, today)
    const d30 = aggRange(adIdx, ad.id, d30start, today)
    const prev7 = aggRange(adIdx, ad.id, prev7start, prev7end)
    const prev14 = aggRange(adIdx, ad.id, prev14start, prev14end)
    const signal = actionSignal(days4.filter(Boolean))
    const alerts = detectSignals(days4.filter(Boolean), ad.name)
    const asObj = asMap.get(ad.ad_set_id) as any
    const campObj = asObj ? campMap.get(asObj.campaign_id) as any : null

    return { ad, days4, d7, d14, d30, prev7, prev14, signal, alerts, asObj, campObj }
  }).sort((a: any, b: any) => {
    if (a.signal.priority !== b.signal.priority) return a.signal.priority - b.signal.priority
    const as7 = a.d7?.spend || 0
    const bs7 = b.d7?.spend || 0
    return bs7 - as7
  })

  // ── Build campaign rows ───────────────────────────────────────────────────
  const campRows = campaigns.map((camp: any) => {
    const days4 = get4Days(campIdx, camp.id)
    const d7 = aggRange(campIdx, camp.id, d7start, today)
    const d14 = aggRange(campIdx, camp.id, d14start, today)
    const d30 = aggRange(campIdx, camp.id, d30start, today)
    const prev7 = aggRange(campIdx, camp.id, prev7start, prev7end)
    const prev14 = aggRange(campIdx, camp.id, prev14start, prev14end)
    const signal = actionSignal(days4.filter(Boolean))
    return { camp, days4, d7, d14, d30, prev7, prev14, signal }
  }).sort((a: any, b: any) => a.signal.priority - b.signal.priority)

  // ── Build ad set rows ─────────────────────────────────────────────────────
  const asRows = adSets.map((as: any) => {
    const days4 = get4Days(asIdx, as.id)
    const d7 = aggRange(asIdx, as.id, d7start, today)
    const d14 = aggRange(asIdx, as.id, d14start, today)
    const d30 = aggRange(asIdx, as.id, d30start, today)
    const prev7 = aggRange(asIdx, as.id, prev7start, prev7end)
    const prev14 = aggRange(asIdx, as.id, prev14start, prev14end)
    const signal = actionSignal(days4.filter(Boolean))
    const campObj = campMap.get(as.campaign_id) as any
    return { as, days4, d7, d14, d30, prev7, prev14, signal, campObj }
  }).sort((a: any, b: any) => a.signal.priority - b.signal.priority)

  // Mini day cell
  function DayCell({ m }: { m: any }) {
    if (!m || (m.spend || 0) < 1) return <td style={{ ...td, color: '#2D3244' }}>—</td>
    const q = dayQuality(m)
    return (
      <td style={{ ...td, backgroundColor: qualityBg[q] }}>
        <div style={{ color: qualityColor[q], fontWeight: 600, fontSize: '11px' }}>{m.purchases || 0}🛍</div>
        <div style={{ color: '#94A3B8', fontSize: '10px' }}>{m.roas ? `${m.roas.toFixed(1)}x` : '—'}</div>
        <div style={{ color: '#64748B', fontSize: '10px' }}>{formatCurrency(m.spend || 0, currency)}</div>
      </td>
    )
  }

  function PctCell({ curr, prev, invert = false }: { curr: number | null; prev: number | null; invert?: boolean }) {
    const v = pct(curr, prev)
    const f = fmtPct(v, invert)
    return <td style={{ ...td, color: f.color, fontSize: '11px' }}>{f.text}</td>
  }

  function MetricCell({ value, fmt, color }: { value: any; fmt: (v: any) => string; color?: string }) {
    if (value === null || value === undefined) return <td style={{ ...td, color: '#64748B' }}>—</td>
    return <td style={{ ...td, color: color || '#F1F5F9' }}>{fmt(value)}</td>
  }

  const sectionTitle = (title: string, sub: string) => (
    <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #2D3244' }}>
      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#F1F5F9' }}>{title}</h2>
      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>{sub}</p>
    </div>
  )

  const card = { backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1, minWidth: 0 }}>
        <Header title="Decisiones" subtitle="Tendencias · Señales · Acción" />
        <main style={{ padding: '20px 16px', maxWidth: '1600px' }}>

          {/* ── BLOQUE 1: Calendario 30 días ─────────────────────────────── */}
          <div style={card}>
            {sectionTitle('📅 Calendario de performance — últimos 30 días', 'Verde = CPA ≤ $7 y 2+ ventas · Amarillo = 1 venta o CPA ≤ $15 · Rojo = sin ventas o CPA alto')}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
                {accountDays.map(d => (
                  <div key={d.date} title={`${d.date} · Gasto: ${formatCurrency(d.spend, currency)} · Ventas: ${d.purchases} · CPA: ${d.cpa ? formatCurrency(d.cpa, currency) : '—'}`}
                    style={{ backgroundColor: qualityBg[d.quality], border: `1px solid ${qualityColor[d.quality]}40`, borderRadius: '6px', padding: '6px', textAlign: 'center', cursor: 'default' }}>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>{formatDate(d.date)}</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: qualityColor[d.quality] }}>{d.purchases}</div>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>{d.roas ? `${d.roas.toFixed(1)}x` : '—'}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '11px', color: '#64748B' }}>
                <span>🟢 {goodDays.length} días buenos</span>
                <span>🟡 {accountDays.filter(d => d.quality === 'ok').length} regulares</span>
                <span>🔴 {badDays.length} malos</span>
                <span style={{ marginLeft: 'auto' }}>Hover para ver detalle</span>
              </div>
            </div>
          </div>

          {/* ── BLOQUE 2: Días buenos vs malos ───────────────────────────── */}
          {(goodDays.length > 0 || badDays.length > 0) && (
            <div style={card}>
              {sectionTitle('🔍 ¿Qué pasa en los días buenos vs malos?', 'Patrones detectados en tus creativos — esto es lo que mueve la aguja')}
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ backgroundColor: '#22C55E10', border: '1px solid #22C55E30', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#22C55E', marginBottom: '12px' }}>
                    🟢 Días buenos ({goodDays.length})
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['ROAS promedio', goodAvg.roas > 0 ? `${goodAvg.roas.toFixed(2)}x` : '—'],
                        ['CPA promedio', goodAvg.cpa > 0 ? formatCurrency(goodAvg.cpa, currency) : '—'],
                        ['Hook rate', goodAvg.hook !== null ? `${goodAvg.hook.toFixed(1)}%` : '—'],
                        ['CTR', goodAvg.ctr !== null ? `${goodAvg.ctr.toFixed(2)}%` : '—'],
                        ['Frecuencia', goodAvg.freq !== null ? goodAvg.freq.toFixed(1) : '—'],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td style={{ padding: '4px 0', color: '#94A3B8' }}>{label}</td>
                          <td style={{ padding: '4px 0', color: '#22C55E', fontWeight: 600, textAlign: 'right' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ backgroundColor: '#EF444410', border: '1px solid #EF444430', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#EF4444', marginBottom: '12px' }}>
                    🔴 Días malos ({badDays.length})
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['ROAS promedio', badAvg.roas > 0 ? `${badAvg.roas.toFixed(2)}x` : '—'],
                        ['CPA promedio', badAvg.cpa > 0 ? formatCurrency(badAvg.cpa, currency) : '—'],
                        ['Hook rate', badAvg.hook !== null ? `${badAvg.hook.toFixed(1)}%` : '—'],
                        ['CTR', badAvg.ctr !== null ? `${badAvg.ctr.toFixed(2)}%` : '—'],
                        ['Frecuencia', badAvg.freq !== null ? badAvg.freq.toFixed(1) : '—'],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td style={{ padding: '4px 0', color: '#94A3B8' }}>{label}</td>
                          <td style={{ padding: '4px 0', color: '#EF4444', fontWeight: 600, textAlign: 'right' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ padding: '0 20px 16px', fontSize: '12px', color: '#64748B' }}>
                💡 En tus días buenos el hook rate es {goodAvg.hook && badAvg.hook ? `${((goodAvg.hook - badAvg.hook) / (badAvg.hook || 1) * 100).toFixed(0)}% más alto` : 'diferente'} y la frecuencia es {goodAvg.freq && badAvg.freq ? (goodAvg.freq < badAvg.freq ? 'más baja' : 'más alta') : 'diferente'}. Usá esto para decidir qué rotar y qué escalar.
              </div>
            </div>
          )}

          {/* ── BLOQUE 3: ADS — tabla principal ──────────────────────────── */}
          <div style={card}>
            {sectionTitle('🎨 Anuncios — Decisión por creativo', 'Los últimos 4 días determinan la señal · Comparación 7d / 14d / 30d vs período anterior')}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '1800px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: '200px', position: 'sticky', left: 0 }}>Anuncio</th>
                    <th style={thL}>Ad Set</th>
                    <th style={{ ...th, width: '36px' }}>Est.</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[0])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[1])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[2])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[3])} (hoy)</th>
                    <th style={thSep}>Gasto 7d</th>
                    <th style={th}>ROAS 7d</th>
                    <th style={th}>CPA 7d</th>
                    <th style={th}>Ventas 7d</th>
                    <th style={th}>vs prev 7d</th>
                    <th style={thSep}>Gasto 14d</th>
                    <th style={th}>ROAS 14d</th>
                    <th style={th}>CPA 14d</th>
                    <th style={th}>vs prev 14d</th>
                    <th style={thSep}>Gasto 30d</th>
                    <th style={th}>ROAS 30d</th>
                    <th style={th}>CPA 30d</th>
                    <th style={th}>Ventas 30d</th>
                    <th style={thSep}>Hook (hoy)</th>
                    <th style={th}>CTR (hoy)</th>
                    <th style={th}>Frec. (hoy)</th>
                    <th style={thSep}>Señales</th>
                    <th style={thSep}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {adRows.map(({ ad, days4, d7, d14, d30, prev7, prev14, signal, alerts, asObj }: any) => {
                    const todayM = days4[3]
                    return (
                      <tr key={ad.id} style={{ opacity: ad.status === 'ACTIVE' ? 1 : 0.45 }}>
                        <td style={{ ...tdL, minWidth: '200px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                          <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', fontSize: '11px' }}>{ad.name}</span>
                        </td>
                        <td style={{ ...tdL }}>
                          <span style={{ color: '#6366F1', fontSize: '10px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{asObj?.name || '—'}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          {ad.status === 'ACTIVE' ? '🟢' : '🟡'}
                        </td>
                        {days4.map((m: any, i: number) => (
                          <DayCell key={i} m={m} />
                        ))}
                        {/* 7d */}
                        <td style={sep}>{d7 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d7.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                        <td style={{ ...td, color: roasColor(d7?.roas) }}>{d7?.roas ? `${d7.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: cpaColor(d7?.cpa) }}>{d7?.cpa ? formatCurrency(d7.cpa, currency) : '—'}</td>
                        <td style={{ ...td, color: d7?.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d7?.purchases || '—'}</td>
                        <PctCell curr={d7?.roas} prev={prev7?.roas} />
                        {/* 14d */}
                        <td style={sep}>{d14 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d14.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                        <td style={{ ...td, color: roasColor(d14?.roas) }}>{d14?.roas ? `${d14.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: cpaColor(d14?.cpa) }}>{d14?.cpa ? formatCurrency(d14.cpa, currency) : '—'}</td>
                        <PctCell curr={d14?.roas} prev={prev14?.roas} />
                        {/* 30d */}
                        <td style={sep}>{d30 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d30.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                        <td style={{ ...td, color: roasColor(d30?.roas) }}>{d30?.roas ? `${d30.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: cpaColor(d30?.cpa) }}>{d30?.cpa ? formatCurrency(d30.cpa, currency) : '—'}</td>
                        <td style={{ ...td, color: d30?.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d30?.purchases || '—'}</td>
                        {/* Live metrics */}
                        <td style={{ ...sep, color: todayM?.hook_rate ? (todayM.hook_rate >= 30 ? '#22C55E' : todayM.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#64748B' }}>
                          {todayM?.hook_rate ? `${todayM.hook_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...td, color: todayM?.ctr ? (todayM.ctr >= 2 ? '#22C55E' : todayM.ctr >= 0.8 ? '#F59E0B' : '#EF4444') : '#64748B' }}>
                          {todayM?.ctr ? `${todayM.ctr.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ ...td, color: todayM?.frequency ? (todayM.frequency > 3.5 ? '#EF4444' : todayM.frequency > 2.5 ? '#F59E0B' : '#94A3B8') : '#64748B' }}>
                          {todayM?.frequency ? todayM.frequency.toFixed(1) : '—'}
                        </td>
                        {/* Signals */}
                        <td style={{ ...sep, maxWidth: '180px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {alerts.length === 0 ? <span style={{ color: '#64748B', fontSize: '10px' }}>—</span> : alerts.map((s: string, i: number) => (
                              <span key={i} style={{ fontSize: '9px', padding: '1px 5px', backgroundColor: '#2D3244', color: '#94A3B8', borderRadius: '3px', whiteSpace: 'nowrap' }}>{s}</span>
                            ))}
                          </div>
                        </td>
                        {/* Action */}
                        <td style={sep}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: signal.color, backgroundColor: signal.bg, padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                            {signal.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── BLOQUE 4: Ad Sets ─────────────────────────────────────────── */}
          <div style={card}>
            {sectionTitle('🎯 Conjuntos de anuncios', 'Tendencia 4 días + comparación por período')}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '1400px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: '180px', position: 'sticky', left: 0 }}>Conjunto</th>
                    <th style={thL}>Campaña</th>
                    <th style={{ ...th, width: '36px' }}>Est.</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[0])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[1])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[2])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[3])}</th>
                    <th style={thSep}>Gasto 7d</th>
                    <th style={th}>ROAS 7d</th>
                    <th style={th}>CPA 7d</th>
                    <th style={th}>vs prev 7d</th>
                    <th style={thSep}>Gasto 14d</th>
                    <th style={th}>ROAS 14d</th>
                    <th style={th}>vs prev 14d</th>
                    <th style={thSep}>Gasto 30d</th>
                    <th style={th}>ROAS 30d</th>
                    <th style={th}>CPA 30d</th>
                    <th style={th}>Ventas 30d</th>
                    <th style={thSep}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {asRows.map(({ as, days4, d7, d14, d30, prev7, prev14, signal, campObj }: any) => (
                    <tr key={as.id} style={{ opacity: as.status === 'ACTIVE' ? 1 : 0.45 }}>
                      <td style={{ ...tdL, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                        <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px', fontSize: '11px' }}>{as.name}</span>
                      </td>
                      <td style={tdL}>
                        <span style={{ color: '#94A3B8', fontSize: '10px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{campObj?.name || '—'}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{as.status === 'ACTIVE' ? '🟢' : '🟡'}</td>
                      {days4.map((m: any, i: number) => <DayCell key={i} m={m} />)}
                      <td style={sep}>{d7 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d7.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                      <td style={{ ...td, color: roasColor(d7?.roas) }}>{d7?.roas ? `${d7.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...td, color: cpaColor(d7?.cpa) }}>{d7?.cpa ? formatCurrency(d7.cpa, currency) : '—'}</td>
                      <PctCell curr={d7?.roas} prev={prev7?.roas} />
                      <td style={sep}>{d14 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d14.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                      <td style={{ ...td, color: roasColor(d14?.roas) }}>{d14?.roas ? `${d14.roas.toFixed(2)}x` : '—'}</td>
                      <PctCell curr={d14?.roas} prev={prev14?.roas} />
                      <td style={sep}>{d30 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d30.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                      <td style={{ ...td, color: roasColor(d30?.roas) }}>{d30?.roas ? `${d30.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...td, color: cpaColor(d30?.cpa) }}>{d30?.cpa ? formatCurrency(d30.cpa, currency) : '—'}</td>
                      <td style={{ ...td, color: d30?.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d30?.purchases || '—'}</td>
                      <td style={sep}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: signal.color, backgroundColor: signal.bg, padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          {signal.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── BLOQUE 5: Campañas ────────────────────────────────────────── */}
          <div style={card}>
            {sectionTitle('📣 Campañas', 'Vista general — los detalles están en los anuncios')}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '1200px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: '180px', position: 'sticky', left: 0 }}>Campaña</th>
                    <th style={{ ...th, width: '36px' }}>Est.</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[0])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[1])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[2])}</th>
                    <th style={{ ...th, minWidth: '110px' }}>{formatDate(last4Dates[3])}</th>
                    <th style={thSep}>Gasto 7d</th>
                    <th style={th}>ROAS 7d</th>
                    <th style={th}>CPA 7d</th>
                    <th style={th}>Ventas 7d</th>
                    <th style={th}>vs prev 7d ROAS</th>
                    <th style={thSep}>Gasto 14d</th>
                    <th style={th}>ROAS 14d</th>
                    <th style={th}>vs prev 14d</th>
                    <th style={thSep}>Gasto 30d</th>
                    <th style={th}>ROAS 30d</th>
                    <th style={th}>CPA 30d</th>
                    <th style={th}>Ventas 30d</th>
                    <th style={thSep}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {campRows.map(({ camp, days4, d7, d14, d30, prev7, prev14, signal }: any) => (
                    <tr key={camp.id} style={{ opacity: camp.status === 'ACTIVE' ? 1 : 0.45 }}>
                      <td style={{ ...tdL, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                        <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px', fontSize: '11px' }}>{camp.name}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{camp.status === 'ACTIVE' ? '🟢' : '🟡'}</td>
                      {days4.map((m: any, i: number) => <DayCell key={i} m={m} />)}
                      <td style={sep}>{d7 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d7.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                      <td style={{ ...td, color: roasColor(d7?.roas) }}>{d7?.roas ? `${d7.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...td, color: cpaColor(d7?.cpa) }}>{d7?.cpa ? formatCurrency(d7.cpa, currency) : '—'}</td>
                      <td style={{ ...td, color: d7?.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d7?.purchases || '—'}</td>
                      <PctCell curr={d7?.roas} prev={prev7?.roas} />
                      <td style={sep}>{d14 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d14.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                      <td style={{ ...td, color: roasColor(d14?.roas) }}>{d14?.roas ? `${d14.roas.toFixed(2)}x` : '—'}</td>
                      <PctCell curr={d14?.roas} prev={prev14?.roas} />
                      <td style={sep}>{d30 ? <span style={{ color: '#F1F5F9' }}>{formatCurrency(d30.spend, currency)}</span> : <span style={{ color: '#64748B' }}>—</span>}</td>
                      <td style={{ ...td, color: roasColor(d30?.roas) }}>{d30?.roas ? `${d30.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...td, color: cpaColor(d30?.cpa) }}>{d30?.cpa ? formatCurrency(d30.cpa, currency) : '—'}</td>
                      <td style={{ ...td, color: d30?.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d30?.purchases || '—'}</td>
                      <td style={sep}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: signal.color, backgroundColor: signal.bg, padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          {signal.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── BLOQUE 6: Leyenda ────────────────────────────────────────── */}
          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', fontSize: '11px', color: '#64748B' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#94A3B8', marginBottom: '6px' }}>Señales de acción</div>
                {[
                  ['🚀 Escalar', 'ROAS subiendo + CPA ≤ $7'],
                  ['✅ Mantener', 'CPA ≤ $7, estable'],
                  ['⬇️ Bajar presupuesto', 'CPA $7-$15 o ROAS cayendo'],
                  ['⛔ Pausar', '3 días sin ventas o CPA > $22'],
                ].map(([label, desc]) => (
                  <div key={label} style={{ marginBottom: '4px' }}><span style={{ color: '#F1F5F9' }}>{label}</span> — {desc}</div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#94A3B8', marginBottom: '6px' }}>Métricas clave</div>
                {[
                  ['Hook rate', '≥30% excelente · ≥15% ok · <15% cambiar creativo'],
                  ['CTR', '≥2% excelente · ≥0.8% ok · <0.8% problema de copy'],
                  ['Frecuencia', '<2.5 ok · 2.5-3.5 atención · >3.5 fatiga'],
                  ['ROAS', '≥3.5x excelente · ≥1.5x ok · <1.5x pérdida'],
                ].map(([label, desc]) => (
                  <div key={label} style={{ marginBottom: '4px' }}><span style={{ color: '#F1F5F9' }}>{label}</span> — {desc}</div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#94A3B8', marginBottom: '6px' }}>Celdas de días</div>
                <div style={{ marginBottom: '4px' }}>Número grande = ventas del día</div>
                <div style={{ marginBottom: '4px' }}>Segunda línea = ROAS del día</div>
                <div style={{ marginBottom: '4px' }}>Tercera línea = gasto del día</div>
                <div style={{ marginBottom: '4px' }}>🟢 CPA≤$7 + 2 ventas · 🟡 1 venta · 🔴 sin ventas</div>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
