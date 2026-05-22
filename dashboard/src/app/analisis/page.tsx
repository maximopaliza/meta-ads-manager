import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, cpmColor, cpcColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'
import TrendCharts from '@/components/dashboard/TrendCharts'

// ─── Color helpers ───────────────────────────────────────────────────────────
const C_GREEN  = '#22C55E'
const C_RED    = '#EF4444'
const C_YELLOW = '#F59E0B'
const C_MUTED  = '#64748B'
const C_TEXT   = '#F1F5F9'
const BG_GREEN = '#22c55e0d'
const BG_RED   = '#ef44440d'

function vsDay(curr: number | null, prev: number | null | undefined, invert = false) {
  if (prev == null || prev === 0 || curr == null) return { color: C_TEXT, bg: '' }
  const pct = (curr - prev) / Math.abs(prev)
  if (Math.abs(pct) < 0.01) return { color: C_TEXT, bg: '' }
  const good = invert ? pct < 0 : pct > 0
  return { color: good ? C_GREEN : C_RED, bg: good ? BG_GREEN : BG_RED }
}

function totalDelta(rows: any[], key: string, invert = false) {
  const vals = rows.map(r => r[key] as number | null).filter(v => v != null && v > 0) as number[]
  if (vals.length < 2) return null
  const first = vals[0], last = vals[vals.length - 1]
  const pct = ((last - first) / first) * 100
  const good = invert ? pct < 0 : pct > 0
  return { pct, abs: last - first, good, last, first }
}

function hookColor(v: number | null) {
  if (!v) return C_MUTED
  if (v >= 30) return C_GREEN
  if (v >= 15) return C_YELLOW
  return C_RED
}

function freqColor(v: number | null) {
  if (!v) return C_MUTED
  if (v > 3) return C_YELLOW
  return '#94A3B8'
}

function pctFmt(p: number) {
  return `${p > 0 ? '+' : ''}${p.toFixed(0)}%`
}

// ─── Aggregation ─────────────────────────────────────────────────────────────
function agg(rows: any[]) {
  const base = rows.reduce((acc, m) => ({
    spend:              acc.spend              + (m.spend              || 0),
    purchases:          acc.purchases          + (m.purchases          || 0),
    purchase_value:     acc.purchase_value     + (m.purchase_value     || 0),
    impressions:        acc.impressions        + (m.impressions        || 0),
    link_clicks:        acc.link_clicks        + (m.link_clicks        || 0),
    unique_link_clicks: acc.unique_link_clicks + (m.unique_link_clicks || 0),
    reach:              acc.reach              + (m.reach              || 0),
    landing_page_views: acc.landing_page_views + (m.landing_page_views || 0),
    add_to_cart:        acc.add_to_cart        + (m.add_to_cart        || 0),
    checkout_initiated: acc.checkout_initiated + (m.checkout_initiated || 0),
    // weighted averages
    hook_rate_w:        acc.hook_rate_w        + ((m.hook_rate   || 0) * (m.impressions || 0)),
    frequency_w:        acc.frequency_w        + ((m.frequency   || 0) * (m.impressions || 0)),
  }), {
    spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
    link_clicks: 0, unique_link_clicks: 0, reach: 0,
    landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0,
    hook_rate_w: 0, frequency_w: 0,
  })
  return {
    ...base,
    hook_rate: base.impressions > 0 ? base.hook_rate_w / base.impressions : null,
    frequency: base.impressions > 0 ? base.frequency_w / base.impressions : null,
  }
}

function derive(d: any) {
  const lc = d.link_clicks || 0
  return {
    ...d,
    cpa:     d.purchases > 0   ? d.spend / d.purchases : null,
    roas:    d.spend > 0       ? d.purchase_value / d.spend : null,
    ctr:     d.reach > 0 && d.unique_link_clicks > 0 ? d.unique_link_clicks / d.reach * 100 : null,
    cpm:     d.impressions > 0 ? d.spend / d.impressions * 1000 : null,
    cpc:     lc > 0            ? d.spend / lc : null,
    trafEf:  lc > 0 && d.landing_page_views > 0 ? d.landing_page_views / lc * 100 : null,
    convWeb: d.landing_page_views > 0 && d.purchases > 0 ? d.purchases / d.landing_page_views * 100 : null,
  }
}

function pct(a: number, b: number) {
  if (!b) return null
  return ((a - b) / b) * 100
}

function wkArrow(v: number | null, invert = false) {
  if (v === null) return { sym: '—', color: C_MUTED }
  const good = invert ? v < 0 : v > 0
  return { sym: v > 0 ? '▲' : '▼', color: good ? C_GREEN : C_RED }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function AnalisisPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; view?: string }> }) {
  await headers()
  const sp = await searchParams
  const view = sp?.view || 'summary'

  const today = await getLatestDate()
  const { rangeStart, rangeEnd, days } = resolveDateRange(sp, today, 7)
  const todayMs  = new Date(today + 'T12:00:00Z').getTime()
  const week1Start = new Date(todayMs - 6 * 86400000).toISOString().split('T')[0]
  const week2Start = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const week2End   = new Date(todayMs - 7  * 86400000).toISOString().split('T')[0]

  const [mToday, mWeek1, mWeek2, mRange, campaignsRes, accountRes, dayAnalysisRes, alertsRes] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', week1Start).lte('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', week2Start).lte('date', week2End),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', rangeStart).lte('date', rangeEnd).order('date', { ascending: false }),
    supabaseAdmin.from('campaigns').select('id,name,status'),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
    supabaseAdmin.from('alerts').select('*').eq('type', 'day_analysis').order('created_at', { ascending: false }).limit(3),
    supabaseAdmin.from('alerts').select('*').neq('type', 'day_analysis').order('created_at', { ascending: false }).limit(10),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const campaignMeta = new Map((campaignsRes.data || []).map((c: any) => [c.id, c]))

  const todayData = derive(agg(mToday.data || []))
  const week1Data = derive(agg(mWeek1.data || []))
  const week2Data = derive(agg(mWeek2.data || []))

  // ── Day-by-day rows (account level) ──────────────────────────────────────
  const dayMapAcc = new Map<string, any>()
  for (const m of mRange.data || []) {
    const e = dayMapAcc.get(m.date) || {
      spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
      link_clicks: 0, unique_link_clicks: 0, reach: 0,
      landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0,
      hook_rate_w: 0, frequency_w: 0,
    }
    dayMapAcc.set(m.date, {
      spend:              e.spend              + (m.spend              || 0),
      purchases:          e.purchases          + (m.purchases          || 0),
      purchase_value:     e.purchase_value     + (m.purchase_value     || 0),
      impressions:        e.impressions        + (m.impressions        || 0),
      link_clicks:        e.link_clicks        + (m.link_clicks        || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach:              e.reach              + (m.reach              || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart:        e.add_to_cart        + (m.add_to_cart        || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      hook_rate_w:        e.hook_rate_w        + ((m.hook_rate   || 0) * (m.impressions || 0)),
      frequency_w:        e.frequency_w        + ((m.frequency   || 0) * (m.impressions || 0)),
    })
  }

  const dailyRows = Array.from(dayMapAcc.entries())
    .map(([date, d]) => derive({
      date,
      ...d,
      hook_rate: d.impressions > 0 ? d.hook_rate_w / d.impressions : null,
      frequency: d.impressions > 0 ? d.frequency_w / d.impressions : null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date)) // newest first (for TrendCharts)

  // last 4 days ascending = oldest→newest (for prev-day comparison)
  const last4Asc = dailyRows.slice(0, 4).reverse()

  // ── Per-campaign per-day data ─────────────────────────────────────────────
  const campDayMap = new Map<string, Map<string, any>>()
  for (const m of mRange.data || []) {
    if (!campDayMap.has(m.object_id)) campDayMap.set(m.object_id, new Map())
    const dm = campDayMap.get(m.object_id)!
    const e = dm.get(m.date) || {
      spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
      link_clicks: 0, unique_link_clicks: 0, reach: 0,
      landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0,
      hook_rate_w: 0, frequency_w: 0,
    }
    dm.set(m.date, {
      spend:              e.spend              + (m.spend              || 0),
      purchases:          e.purchases          + (m.purchases          || 0),
      purchase_value:     e.purchase_value     + (m.purchase_value     || 0),
      impressions:        e.impressions        + (m.impressions        || 0),
      link_clicks:        e.link_clicks        + (m.link_clicks        || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach:              e.reach              + (m.reach              || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart:        e.add_to_cart        + (m.add_to_cart        || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      hook_rate_w:        e.hook_rate_w        + ((m.hook_rate   || 0) * (m.impressions || 0)),
      frequency_w:        e.frequency_w        + ((m.frequency   || 0) * (m.impressions || 0)),
    })
  }

  const campaignCards = Array.from(campDayMap.entries())
    .map(([id, dm]) => {
      const meta = campaignMeta.get(id) as any
      const campDays = Array.from(dm.entries())
        .map(([date, d]) => derive({
          date,
          ...d,
          hook_rate: d.impressions > 0 ? d.hook_rate_w / d.impressions : null,
          frequency: d.impressions > 0 ? d.frequency_w / d.impressions : null,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)) // ascending for comparison
        .slice(-4) // last 4 days
      const totalSpend = campDays.reduce((s, d) => s + d.spend, 0)
      return { id, name: meta?.name || id, status: meta?.status || 'UNKNOWN', days: campDays, totalSpend }
    })
    .filter(c => c.totalSpend > 0)
    .sort((a, b) => {
      if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
      if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
      return b.totalSpend - a.totalSpend
    })

  // ── Semaphore ─────────────────────────────────────────────────────────────
  const tp = todayData.purchases
  const tc = todayData.cpa
  const ts = todayData.spend
  let sem: 'green' | 'yellow' | 'red' = 'yellow'
  let semText = ''
  if (tp >= 2 && tc !== null && tc <= CPA_TARGET) { sem = 'green'; semText = `${tp} ventas a ${formatCurrency(tc, currency)} CPA — bajo objetivo. Escalar presupuesto.` }
  else if (tp >= 2 && tc !== null && tc <= CPA_BREAKEVEN) { sem = 'green'; semText = `${tp} ventas a ${formatCurrency(tc, currency)} CPA — dentro del breakeven. Mantener.` }
  else if (tp === 1) { sem = 'yellow'; semText = `1 venta a ${tc ? formatCurrency(tc, currency) : '?'} CPA. Insuficiente para evaluar.` }
  else if (tp === 0 && ts < 50) { sem = 'yellow'; semText = `Sin ventas. Gasto bajo (${formatCurrency(ts, currency)}). Esperar más datos.` }
  else if (tp === 0 && ts >= 50) { sem = 'red'; semText = `Sin ventas con ${formatCurrency(ts, currency)} gastado. Revisar creativos urgente.` }
  else if (tc !== null && tc > CPA_BREAKEVEN) { sem = 'red'; semText = `CPA ${formatCurrency(tc, currency)} supera breakeven (${formatCurrency(CPA_BREAKEVEN, currency)}). Pausar o ajustar.` }
  else { semText = `Datos insuficientes. Monitorear.` }

  const semColor  = { green: C_GREEN, yellow: C_YELLOW, red: C_RED }
  const semBg     = { green: '#22C55E0D', yellow: '#F59E0B0D', red: '#EF44440D' }
  const semBorder = { green: '#22C55E30', yellow: '#F59E0B30', red: '#EF444430' }
  const semEmoji  = { green: '🟢', yellow: '🟡', red: '🔴' }

  // ── Funnel (7d) ──────────────────────────────────────────────────────────
  const funnelSteps = [
    { label: 'Impresiones',  value: week1Data.impressions,        fmt: (v: number) => new Intl.NumberFormat('es-AR').format(Math.round(v)), rate: null },
    { label: 'Clics únicos', value: week1Data.unique_link_clicks, fmt: (v: number) => formatNumber(v), rate: week1Data.ctr ? `CTR ${week1Data.ctr.toFixed(2)}%` : null },
    { label: 'Visitas LP',   value: week1Data.landing_page_views, fmt: (v: number) => formatNumber(v), rate: week1Data.trafEf ? `Tráf.ef. ${week1Data.trafEf.toFixed(1)}%` : null },
    { label: 'ATC',          value: week1Data.add_to_cart,        fmt: (v: number) => String(Math.round(v)), rate: week1Data.landing_page_views > 0 && week1Data.add_to_cart > 0 ? `${(week1Data.add_to_cart / week1Data.landing_page_views * 100).toFixed(1)}% LP` : null },
    { label: 'Pagos inic.',  value: week1Data.checkout_initiated, fmt: (v: number) => String(Math.round(v)), rate: week1Data.add_to_cart > 0 && week1Data.checkout_initiated > 0 ? `${(week1Data.checkout_initiated / week1Data.add_to_cart * 100).toFixed(1)}% ATC` : null },
    { label: 'Ventas',       value: week1Data.purchases,          fmt: (v: number) => String(Math.round(v)), rate: week1Data.convWeb ? `Conv. ${week1Data.convWeb.toFixed(1)}%` : null },
  ]
  const funnelMax = funnelSteps[0].value || 1

  // ── Week comparison ───────────────────────────────────────────────────────
  const wkItems = [
    { label: 'Ventas',     w1: week1Data.purchases,       w2: week2Data.purchases,       fmt: (v: number) => String(Math.round(v)),           p: pct(week1Data.purchases, week2Data.purchases), inv: false },
    { label: 'CPA',        w1: week1Data.cpa ?? 0,        w2: week2Data.cpa ?? 0,        fmt: (v: number) => v ? formatCurrency(v, currency) : '—', p: pct(week1Data.cpa ?? 0, week2Data.cpa ?? 0), inv: true },
    { label: 'ROAS',       w1: week1Data.roas ?? 0,       w2: week2Data.roas ?? 0,       fmt: (v: number) => v ? `${v.toFixed(2)}x` : '—',    p: pct(week1Data.roas ?? 0, week2Data.roas ?? 0), inv: false },
    { label: 'Gasto',      w1: week1Data.spend,           w2: week2Data.spend,           fmt: (v: number) => formatCurrency(v, currency),      p: pct(week1Data.spend, week2Data.spend), inv: false },
    { label: 'ATC',        w1: week1Data.add_to_cart,     w2: week2Data.add_to_cart,     fmt: (v: number) => String(Math.round(v)),           p: pct(week1Data.add_to_cart, week2Data.add_to_cart), inv: false },
    { label: 'Valor conv.',w1: week1Data.purchase_value,  w2: week2Data.purchase_value,  fmt: (v: number) => v ? formatCurrency(v, currency) : '—', p: pct(week1Data.purchase_value, week2Data.purchase_value), inv: false },
  ]

  // ── Shared styles ─────────────────────────────────────────────────────────
  const th: any  = { padding: '7px 8px', textAlign: 'right' as const, color: C_MUTED, fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#151820' }
  const td: any  = { padding: '7px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }
  const thG: any = { ...th, borderLeft: '1px solid #2D3244' }
  const tdG: any = { ...td, borderLeft: '1px solid #2D3244' }

  // Group header style
  const thGrp = (color: string): any => ({
    padding: '5px 8px 4px',
    textAlign: 'center' as const,
    fontSize: '9px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    backgroundColor: '#0e1015',
    borderBottom: '1px solid #2D3244',
    borderLeft: '1px solid #2D3244',
    whiteSpace: 'nowrap' as const,
  })

  const dayAnalyses  = dayAnalysisRes.data || []
  const recentAlerts = alertsRes.data || []

  // ─── Render helpers ───────────────────────────────────────────────────────
  // Render a 4-day analysis table row
  function renderDayRow(d: any, prev: any | undefined, isToday: boolean, isFirst: boolean, showDelta: boolean, days4: any[]) {
    const bg = isToday ? '#6366F108' : 'transparent'
    const dateLabel = formatDate(d.date)

    // delta cells
    const dVentas = isFirst ? null : vsDay(d.purchases, prev?.purchases)
    const dValor  = isFirst ? null : vsDay(d.purchase_value, prev?.purchase_value)
    const dRoas   = isFirst ? null : vsDay(d.roas, prev?.roas)
    const dCpa    = isFirst ? null : vsDay(d.cpa, prev?.cpa, true)   // inverted
    const dSpend  = null // spend = neutral
    const dImpr   = isFirst ? null : vsDay(d.impressions, prev?.impressions)
    const dCpm    = isFirst ? null : vsDay(d.cpm, prev?.cpm, true)   // inverted
    const dCtr    = isFirst ? null : vsDay(d.ctr, prev?.ctr)
    const dClics  = isFirst ? null : vsDay(d.unique_link_clicks, prev?.unique_link_clicks)
    const dLpv    = isFirst ? null : vsDay(d.landing_page_views, prev?.landing_page_views)
    const dTraf   = isFirst ? null : vsDay(d.trafEf, prev?.trafEf)
    const dConvW  = isFirst ? null : vsDay(d.convWeb, prev?.convWeb)
    const dHook   = isFirst ? null : vsDay(d.hook_rate, prev?.hook_rate)
    const dFreq   = isFirst ? null : vsDay(d.frequency, prev?.frequency, true) // inverted
    const dAtc    = isFirst ? null : vsDay(d.add_to_cart, prev?.add_to_cart)
    const dPagos  = isFirst ? null : vsDay(d.checkout_initiated, prev?.checkout_initiated)

    // Totals for delta column (day1 → this day)
    const td4V = totalDelta(days4, 'purchases')
    const td4R = totalDelta(days4, 'roas')
    const td4C = totalDelta(days4, 'cpa', true)

    const cellStyle = (base: any, vs: { color: string; bg: string } | null, overrideColor?: string): any => ({
      ...base,
      color: overrideColor || vs?.color || C_TEXT,
      backgroundColor: vs?.bg || base.backgroundColor || undefined,
    })

    return (
      <tr key={d.date} style={{ backgroundColor: bg }}>
        {/* Date */}
        <td style={{ ...td, textAlign: 'left' as const, color: isToday ? '#6366F1' : C_MUTED, fontWeight: isToday ? 700 : 600, position: 'sticky' as const, left: 0, backgroundColor: isToday ? '#1e2035' : '#1A1D27', zIndex: 1, paddingLeft: '14px' }}>
          {dateLabel}
          {isToday && <span style={{ fontSize: '8px', color: '#6366F1', marginLeft: '5px', padding: '1px 4px', backgroundColor: '#6366F125', borderRadius: '3px' }}>HOY</span>}
        </td>
        {/* 💰 Conversiones */}
        <td style={cellStyle(td, dVentas, dVentas ? undefined : (d.purchases > 0 ? C_GREEN : C_MUTED))}>{d.purchases || '—'}</td>
        <td style={cellStyle(td, dValor)}>{d.purchase_value > 0 ? formatCurrency(d.purchase_value, currency) : '—'}</td>
        <td style={cellStyle(td, dRoas, dRoas ? undefined : roasColor(d.roas))}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
        <td style={cellStyle(td, dCpa, dCpa ? undefined : cpaColor(d.cpa))}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
        {/* 💸 Costos */}
        <td style={{ ...tdG, color: C_TEXT }}>{d.spend > 0 ? formatCurrency(d.spend, currency) : '—'}</td>
        <td style={{ ...td, color: dImpr?.color || '#94A3B8', backgroundColor: dImpr?.bg }}>{d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—'}</td>
        <td style={cellStyle(td, dCpm, dCpm ? undefined : cpmColor(d.cpm))}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
        {/* 🌐 Tráfico */}
        <td style={cellStyle({ ...tdG }, dCtr, dCtr ? undefined : ctrColor(d.ctr))}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
        <td style={{ ...td, color: dClics?.color || '#94A3B8', backgroundColor: dClics?.bg }}>{d.unique_link_clicks > 0 ? formatNumber(d.unique_link_clicks) : '—'}</td>
        <td style={{ ...td, color: dLpv?.color || '#94A3B8', backgroundColor: dLpv?.bg }}>{d.landing_page_views > 0 ? formatNumber(d.landing_page_views) : '—'}</td>
        <td style={{ ...td, color: dTraf?.color || C_TEXT, backgroundColor: dTraf?.bg }}>{d.trafEf ? `${d.trafEf.toFixed(1)}%` : '—'}</td>
        <td style={{ ...td, color: dConvW?.color || C_TEXT, backgroundColor: dConvW?.bg }}>{d.convWeb ? `${d.convWeb.toFixed(1)}%` : '—'}</td>
        {/* 🎬 Video */}
        <td style={cellStyle({ ...tdG }, dHook, dHook ? undefined : hookColor(d.hook_rate))}>{d.hook_rate ? `${d.hook_rate.toFixed(1)}%` : '—'}</td>
        <td style={{ ...td, color: dFreq?.color || freqColor(d.frequency), backgroundColor: dFreq?.bg }}>{d.frequency ? d.frequency.toFixed(1) : '—'}</td>
        {/* 🔁 Embudo */}
        <td style={{ ...tdG, color: dAtc?.color || C_TEXT, backgroundColor: dAtc?.bg }}>{d.add_to_cart || '—'}</td>
        <td style={{ ...td, color: dPagos?.color || C_TEXT, backgroundColor: dPagos?.bg }}>{d.checkout_initiated || '—'}</td>
        {/* Δ */}
        {showDelta && (
          <td style={{ ...tdG, textAlign: 'left' as const, minWidth: '100px' }}>
            {td4V ? (
              <>
                <span style={{ fontSize: '11px', fontWeight: 700, color: td4V.good ? C_GREEN : C_RED }}>
                  {td4V.abs > 0 ? '+' : ''}{td4V.abs.toFixed(0)} ventas
                </span>
                <br />
                {td4R && <span style={{ fontSize: '9px', color: td4R.good ? C_GREEN : C_RED }}>ROAS {pctFmt(td4R.pct)}</span>}
                {td4C && <span style={{ fontSize: '9px', color: td4C.good ? C_GREEN : C_RED, marginLeft: '4px' }}>CPA {pctFmt(td4C.pct)}</span>}
              </>
            ) : <span style={{ color: C_MUTED, fontSize: '10px' }}>Base</span>}
          </td>
        )}
      </tr>
    )
  }

  // Table header (account + campaign share the same columns)
  function TableHead({ compact = false }: { compact?: boolean }) {
    const fnt: any = { fontSize: compact ? '8px' : '9px' }
    return (
      <thead>
        {/* Group row */}
        <tr>
          <th style={{ ...th, textAlign: 'left' as const, position: 'sticky' as const, left: 0, zIndex: 3, ...fnt, backgroundColor: '#0e1015' }}></th>
          <th colSpan={4} style={{ ...thGrp('#22c55e80'), ...fnt }}>💰 Conversiones</th>
          <th colSpan={3} style={{ ...thGrp('#ef444480'), ...fnt }}>💸 Costos</th>
          <th colSpan={5} style={{ ...thGrp('#38bdf880'), ...fnt }}>🌐 Tráfico</th>
          <th colSpan={2} style={{ ...thGrp('#a78bfa80'), ...fnt }}>🎬 Video</th>
          <th colSpan={2} style={{ ...thGrp('#f59e0b80'), ...fnt }}>🔁 Embudo</th>
          <th style={{ ...thGrp(C_MUTED), ...fnt }}>Δ 1→4</th>
        </tr>
        {/* Metric names row */}
        <tr>
          <th style={{ ...th, textAlign: 'left' as const, position: 'sticky' as const, left: 0, zIndex: 3, ...fnt }}>Día</th>
          <th style={{ ...th, ...fnt }}>Ventas</th>
          <th style={{ ...th, ...fnt }}>Valor</th>
          <th style={{ ...th, ...fnt }}>ROAS</th>
          <th style={{ ...th, ...fnt }}>CPA</th>
          <th style={{ ...thG, ...fnt }}>Gasto</th>
          <th style={{ ...th, ...fnt }}>Impr.</th>
          <th style={{ ...th, ...fnt }}>CPM</th>
          <th style={{ ...thG, ...fnt }}>CTR único</th>
          <th style={{ ...th, ...fnt }}>Clics</th>
          <th style={{ ...th, ...fnt }}>Visit. LP</th>
          <th style={{ ...th, ...fnt }}>Tráf. ef.</th>
          <th style={{ ...th, ...fnt }}>Conv.web</th>
          <th style={{ ...thG, ...fnt }}>Hook Rate</th>
          <th style={{ ...th, ...fnt }}>Freq.</th>
          <th style={{ ...thG, ...fnt }}>ATC</th>
          <th style={{ ...th, ...fnt }}>Pagos</th>
          <th style={{ ...thG, textAlign: 'left' as const, ...fnt }}>Δ día 1→4</th>
        </tr>
      </thead>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Análisis" subtitle={`Tendencias · ${today}`} />
        <main style={{ padding: '20px 16px', maxWidth: '100%' }}>

          {/* ── View + Range controls ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' as const, gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['summary', 'table'] as const).map(v => (
                <a key={v} href={`?view=${v}&days=${days}`} style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', backgroundColor: view === v ? '#6366F1' : 'transparent', color: view === v ? '#fff' : C_MUTED, border: `1px solid ${view === v ? '#6366F1' : '#2D3244'}` }}>
                  {v === 'summary' ? 'Resumen' : 'Tabla completa'}
                </a>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[4, 7, 14].map(d => (
                <a key={d} href={`?view=${view}&days=${d}`} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', textDecoration: 'none', backgroundColor: days === d ? '#6366F110' : 'transparent', color: days === d ? '#6366F1' : C_MUTED, border: `1px solid ${days === d ? '#6366F1' : '#2D3244'}` }}>
                  {d}d
                </a>
              ))}
            </div>
          </div>

          {view === 'summary' ? (
            <>
              {/* ══════════════════════════════════════════
                  1. ESTADO DE HOY
              ══════════════════════════════════════════ */}
              <div style={{ marginBottom: '20px', backgroundColor: semBg[sem], border: `1px solid ${semBorder[sem]}`, borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '11px', color: semColor[sem], fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '6px' }}>
                  {semEmoji[sem]} Estado de hoy — {today}
                </div>
                <div style={{ fontSize: '15px', color: C_TEXT, marginBottom: '16px', lineHeight: 1.5 }}>{semText}</div>
                <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' as const }}>
                  {[
                    { label: 'Ventas',      value: tp > 0 ? String(tp) : '—',                               color: tp > 0 ? C_GREEN : C_MUTED },
                    { label: 'CPA',         value: tc ? formatCurrency(tc, currency) : '—',                  color: cpaColor(tc) },
                    { label: 'ROAS',        value: todayData.roas ? `${todayData.roas.toFixed(2)}x` : '—',   color: roasColor(todayData.roas) },
                    { label: 'Gasto',       value: ts > 0 ? formatCurrency(ts, currency) : '—',              color: C_TEXT },
                    { label: 'ATC',         value: todayData.add_to_cart > 0 ? String(todayData.add_to_cart) : '—', color: todayData.add_to_cart > 0 ? C_TEXT : C_MUTED },
                    { label: 'Pagos inic.', value: todayData.checkout_initiated > 0 ? String(todayData.checkout_initiated) : '—', color: todayData.checkout_initiated > 0 ? C_TEXT : C_MUTED },
                    { label: 'Valor conv.', value: todayData.purchase_value > 0 ? formatCurrency(todayData.purchase_value, currency) : '—', color: '#94A3B8' },
                  ].map(kpi => (
                    <div key={kpi.label}>
                      <div style={{ fontSize: '9px', color: C_MUTED, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '2px' }}>{kpi.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ══════════════════════════════════════════
                  2. TREND CHARTS (8 mini charts)
              ══════════════════════════════════════════ */}
              {dailyRows.length > 1 && (
                <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', padding: '16px 16px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: C_TEXT }}>📈 Tendencia — últimos {days} días</span>
                    <span style={{ fontSize: '10px', color: C_MUTED }}>Líneas de ref.: CPA objetivo · ROAS mínimo · Hook Rate ≥30%</span>
                  </div>
                  <TrendCharts data={dailyRows} currency={currency} cpaTarget={CPA_TARGET} cpaBreakeven={CPA_BREAKEVEN} />
                </div>
              )}

              {/* ══════════════════════════════════════════
                  3. ANÁLISIS 4 DÍAS — CUENTA
              ══════════════════════════════════════════ */}
              {last4Asc.length > 0 && (
                <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden', borderTop: '2px solid #6366F1' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: C_TEXT }}>Análisis 4 días — Cuenta</span>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: C_MUTED }}>
                        <span style={{ color: C_GREEN }}>●</span> mejor vs día ant.
                        <span style={{ color: C_RED, marginLeft: '8px' }}>●</span> peor vs día ant.
                        <span style={{ color: C_MUTED, marginLeft: '8px' }}>Δ = cambio día 1→4</span>
                      </span>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1500px' }}>
                      <TableHead />
                      <tbody>
                        {last4Asc.map((d, i) => renderDayRow(
                          d,
                          i > 0 ? last4Asc[i - 1] : undefined,
                          d.date === today,
                          i === 0,
                          i === last4Asc.length - 1, // show delta only on last row
                          last4Asc,
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════
                  4. POR CAMPAÑA — cards 4 días
              ══════════════════════════════════════════ */}
              {campaignCards.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: C_MUTED, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Por campaña
                    <span style={{ flex: 1, height: '1px', backgroundColor: '#2D3244' }} />
                    <span style={{ fontWeight: 400, fontSize: '10px', textTransform: 'none' as const }}>últimas 4 fechas con datos</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                    {campaignCards.map(camp => {
                      const totalV  = camp.days.reduce((s: number, d: any) => s + (d.purchases || 0), 0)
                      const totalS  = camp.days.reduce((s: number, d: any) => s + (d.spend || 0), 0)
                      const lastRoas = camp.days[camp.days.length - 1]?.roas
                      const statusColor = camp.status === 'ACTIVE' ? C_GREEN : camp.status === 'PAUSED' ? C_YELLOW : C_MUTED
                      return (
                        <div key={camp.id} style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden', opacity: camp.status === 'ACTIVE' ? 1 : 0.65 }}>
                          {/* Card header */}
                          <div style={{ padding: '9px 14px', borderBottom: '1px solid #2D3244', backgroundColor: '#151820', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0, display: 'inline-block' }} />
                            <Link href={`/campaigns/${camp.id}`} style={{ fontSize: '12px', fontWeight: 600, color: C_TEXT, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {camp.name || camp.id}
                            </Link>
                            <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                              <span style={{ fontSize: '10px', color: totalV > 0 ? C_GREEN : C_MUTED }}>{totalV > 0 ? `${totalV} ventas` : '0 ventas'}</span>
                              <span style={{ fontSize: '10px', color: '#94A3B8' }}>{formatCurrency(totalS, currency)} gasto</span>
                              {lastRoas && <span style={{ fontSize: '10px', color: roasColor(lastRoas) }}>ROAS {lastRoas.toFixed(2)}x hoy</span>}
                            </div>
                          </div>
                          {/* 4-day table */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1500px' }}>
                              <TableHead compact />
                              <tbody>
                                {camp.days.map((d: any, i: number) => renderDayRow(
                                  d,
                                  i > 0 ? camp.days[i - 1] : undefined,
                                  d.date === today,
                                  i === 0,
                                  i === camp.days.length - 1,
                                  camp.days,
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════
                  5. SEMANA VS SEMANA
              ══════════════════════════════════════════ */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: C_TEXT }}>Esta semana vs semana pasada</span>
                  <span style={{ fontSize: '10px', color: C_MUTED, marginLeft: '8px' }}>últimos 7d vs 7d anteriores</span>
                </div>
                <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                  {wkItems.map(item => {
                    const a = wkArrow(item.p, item.inv)
                    return (
                      <div key={item.label} style={{ backgroundColor: '#0F1117', borderRadius: '8px', padding: '12px', border: '1px solid #2D3244' }}>
                        <div style={{ fontSize: '9px', color: C_MUTED, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '5px' }}>{item.label}</div>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: C_TEXT, marginBottom: '5px' }}>{item.fmt(item.w1)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: '11px', color: a.color, fontWeight: 600 }}>{a.sym} {item.p !== null ? `${Math.abs(item.p).toFixed(1)}%` : '—'}</span>
                          <span style={{ fontSize: '10px', color: C_MUTED }}>ant. {item.fmt(item.w2)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ══════════════════════════════════════════
                  6. EMBUDO
              ══════════════════════════════════════════ */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: C_TEXT }}>Embudo de conversión — últimos 7d</span>
                </div>
                <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'flex-end', gap: '4px', overflowX: 'auto' }}>
                  {funnelSteps.map((step, i) => {
                    const barH = Math.max(20, Math.round((step.value / funnelMax) * 110))
                    const isLast = i === funnelSteps.length - 1
                    return (
                      <div key={step.label} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1, minWidth: '90px' }}>
                        <div style={{ fontSize: '9px', color: '#6366F1', marginBottom: '4px', fontWeight: 600, height: '14px', textAlign: 'center' as const }}>{step.rate || ''}</div>
                        <div style={{ width: '64%', height: `${barH}px`, backgroundColor: isLast ? C_GREEN : '#6366F1', borderRadius: '4px 4px 0 0', opacity: isLast ? 0.9 : 0.5 + i * 0.07 }} />
                        <div style={{ fontSize: '13px', fontWeight: 700, color: isLast ? C_GREEN : C_TEXT, marginTop: '6px' }}>
                          {step.value > 0 ? step.fmt(step.value) : '—'}
                        </div>
                        <div style={{ fontSize: '9px', color: C_MUTED, textAlign: 'center' as const, marginTop: '2px' }}>{step.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ══════════════════════════════════════════
                  7. SEÑALES IA
              ══════════════════════════════════════════ */}
              {dayAnalyses.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: '#6366F1', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '10px' }}>Señales IA</div>
                  {dayAnalyses.map((a: any) => (
                    <div key={a.id} style={{ backgroundColor: '#1A1D27', border: '1px solid #6366F130', borderRadius: '12px', padding: '18px 20px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: C_TEXT }}>{a.title}</div>
                        <div style={{ fontSize: '10px', color: C_MUTED, whiteSpace: 'nowrap' as const, marginLeft: '12px' }}>{formatDate(a.created_at?.split('T')[0] || '')}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: 1.8, whiteSpace: 'pre-line' as const }}>{a.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ══════════════════════════════════════════
                  8. ALERTAS RECIENTES
              ══════════════════════════════════════════ */}
              {recentAlerts.length > 0 && (
                <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: C_TEXT }}>Alertas recientes</span>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    {recentAlerts.slice(0, 5).map((a: any) => (
                      <div key={a.id} style={{ padding: '10px 12px', backgroundColor: '#0F1117', borderRadius: '8px', border: `1px solid ${a.severity === 'critical' ? '#EF444440' : a.severity === 'warning' ? '#F59E0B40' : '#6366F140'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: a.severity === 'critical' ? '#EF444420' : a.severity === 'warning' ? '#F59E0B20' : '#6366F120', color: a.severity === 'critical' ? C_RED : a.severity === 'warning' ? C_YELLOW : '#6366F1' }}>
                            {a.severity?.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '10px', color: C_MUTED, whiteSpace: 'nowrap' as const }}>{formatDate(a.created_at?.split('T')[0] || '')}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: C_TEXT, lineHeight: 1.6 }}>{a.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ══════════════════════════════════════════
               TABLA COMPLETA (view=table)
            ══════════════════════════════════════════ */
            <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: C_TEXT }}>Tabla día por día — últimos {days}d</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1600px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' as const, position: 'sticky' as const, left: 0 }}>Fecha</th>
                      <th style={th}>Ventas</th>
                      <th style={th}>CPA</th>
                      <th style={th}>ROAS</th>
                      <th style={th}>Gasto</th>
                      <th style={th}>Valor conv.</th>
                      <th style={th}>Impresiones</th>
                      <th style={th}>CPM</th>
                      <th style={th}>CTR único</th>
                      <th style={th}>CPC</th>
                      <th style={th}>Clics únicos</th>
                      <th style={th}>Visitas LP</th>
                      <th style={th}>Tráf. ef.</th>
                      <th style={th}>Conv. WEB</th>
                      <th style={th}>Hook Rate</th>
                      <th style={th}>Frecuencia</th>
                      <th style={th}>ATC</th>
                      <th style={th}>Pagos inic.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((d: any) => {
                      const isToday = d.date === today
                      return (
                        <tr key={d.date} style={{ backgroundColor: isToday ? '#6366F108' : 'transparent' }}>
                          <td style={{ ...td, textAlign: 'left' as const, color: C_TEXT, fontWeight: isToday ? 700 : 400, position: 'sticky' as const, left: 0, backgroundColor: isToday ? '#1e2030' : '#1A1D27' }}>
                            {formatDate(d.date)}{isToday && <span style={{ fontSize: '9px', color: '#6366F1', marginLeft: '6px' }}>HOY</span>}
                          </td>
                          <td style={{ ...td, color: d.purchases > 0 ? C_GREEN : C_MUTED, fontWeight: 600 }}>{d.purchases || '—'}</td>
                          <td style={{ ...td, color: cpaColor(d.cpa), fontWeight: 600 }}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
                          <td style={{ ...td, color: roasColor(d.roas) }}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ ...td, color: C_TEXT }}>{d.spend > 0 ? formatCurrency(d.spend, currency) : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.purchase_value > 0 ? formatCurrency(d.purchase_value, currency) : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—'}</td>
                          <td style={{ ...td, color: cpmColor(d.cpm) }}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
                          <td style={{ ...td, color: ctrColor(d.ctr) }}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
                          <td style={{ ...td, color: cpcColor(d.cpc) }}>{d.cpc ? formatCurrency(d.cpc, currency) : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.unique_link_clicks > 0 ? d.unique_link_clicks : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.landing_page_views > 0 ? d.landing_page_views : '—'}</td>
                          <td style={{ ...td, color: C_TEXT }}>{d.trafEf ? `${d.trafEf.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: d.convWeb ? C_GREEN : C_MUTED }}>{d.convWeb ? `${d.convWeb.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: hookColor(d.hook_rate) }}>{d.hook_rate ? `${d.hook_rate.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: freqColor(d.frequency) }}>{d.frequency ? d.frequency.toFixed(1) : '—'}</td>
                          <td style={{ ...td, color: C_TEXT }}>{d.add_to_cart || '—'}</td>
                          <td style={{ ...td, color: C_TEXT }}>{d.checkout_initiated || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
