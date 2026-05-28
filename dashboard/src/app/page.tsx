import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import SpendChart from '@/components/dashboard/SpendChart'
import AlertsFeed from '@/components/dashboard/AlertsFeed'
import { formatCurrency, formatROAS, formatNumber, statusEmoji } from '@/lib/utils'
import AutoRefresh from './AutoRefresh'
import Link from 'next/link'
import RangeSelector from '@/components/dashboard/RangeSelector'
import { Suspense } from 'react'


const CPA_BREAKEVEN = 15
const CPA_TARGET = 7

function cpaColor(v: number | null) {
  if (!v) return '#7A90AA'
  if (v <= CPA_TARGET) return '#22C55E'
  if (v <= CPA_BREAKEVEN) return '#F59E0B'
  return '#EF4444'
}

function roasColor(v: number | null) {
  if (!v) return '#7A90AA'
  if (v >= 3.5) return '#22C55E'
  if (v >= 1.5) return '#F59E0B'
  return '#EF4444'
}

function ctrColor(v: number | null) {
  if (!v) return '#7A90AA'
  if (v >= 2.0) return '#22C55E'
  if (v >= 0.6) return '#F1F5F9'
  return '#EF4444'
}

function cpmColor(v: number | null) {
  if (!v) return '#7A90AA'
  if (v <= 8)  return '#22C55E'
  if (v <= 20) return '#F59E0B'
  return '#EF4444'
}

function cpcColor(v: number | null) {
  if (!v) return '#7A90AA'
  if (v <= 0.6)  return '#22C55E'
  if (v <= 1.8) return '#F59E0B'
  return '#EF4444'
}

// lowerIsBetter=true → CPM, CPC, CPA, Costo ATC (bajar es bueno)
// lowerIsBetter=false → CTR, Clics, ATC, Ventas, ROAS, Tráfico efectivo (subir es bueno)
function deltaLabel(delta: number | null, lowerIsBetter = false) {
  if (delta === null || delta === undefined) return null
  const isUp = delta >= 0
  const isGood = lowerIsBetter ? !isUp : isUp
  return {
    text: `${isUp ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`,
    color: isGood ? '#22C55E' : '#EF4444',
  }
}

// Professional KPI card with accent top border
function KPI({ label, value, delta, color, sub }: {
  label: string; value: string
  delta?: { text: string; color: string } | null
  color?: string; sub?: string
}) {
  const accentColor = color && color !== '#F1F5F9' && color !== '#7A90AA' ? color : '#1A4080'
  return (
    <div
      className="kpi-card"
      style={{ '--kpi-color': accentColor } as React.CSSProperties}
    >
      <div style={{
        fontSize: '10px', color: '#7A90AA', marginBottom: '8px',
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{
        fontSize: '24px', fontWeight: 700, color: color || '#F1F5F9',
        lineHeight: 1.1, letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#7A90AA', marginTop: '4px' }}>{sub}</div>}
      {delta && (
        <div style={{
          fontSize: '11px', color: delta.color, marginTop: '6px',
          display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 500,
        }}>
          {delta.text}
          <span style={{ color: '#7A90AA', fontSize: '10px', fontWeight: 400 }}>vs ayer</span>
        </div>
      )}
    </div>
  )
}

async function getOverviewData(days: number, customFrom: string | null, customTo: string | null) {
  await headers()

  const latestDateRes = await supabaseAdmin
    .from('metrics').select('date').eq('object_type', 'campaign')
    .order('date', { ascending: false }).limit(1)

  const today = customTo || latestDateRes.data?.[0]?.date || new Date().toISOString().split('T')[0]
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = customFrom || new Date(todayMs - days * 86400000).toISOString().split('T')[0]

  const [todayM, yesterdayM, weekM, campaigns, alerts, accountRes] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', sevenDaysAgo).order('date'),
    supabaseAdmin.from('campaigns').select('*').order('updated_at', { ascending: false }),
    supabaseAdmin.from('alerts').select('*').order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'

  const agg = (rows: any[]) => rows.reduce((a, m) => ({
    spend: a.spend + (m.spend || 0),
    purchases: a.purchases + (m.purchases || 0),
    purchase_value: a.purchase_value + (m.purchase_value || 0),
    impressions: a.impressions + (m.impressions || 0),
    clicks: a.clicks + (m.clicks || 0),
    link_clicks: a.link_clicks + (m.link_clicks || 0),
    unique_link_clicks: a.unique_link_clicks + (m.unique_link_clicks || 0),
    reach: a.reach + (m.reach || 0),
    add_to_cart: a.add_to_cart + (m.add_to_cart || 0),
    landing_page_views: a.landing_page_views + (m.landing_page_views || 0),
    freq_imp: a.freq_imp + (m.impressions || 0),
    freq_sum: a.freq_sum + ((m.frequency || 0) * (m.impressions || 0)),
    video_imp: a.video_imp + (m.impressions || 0),
    video_sum: a.video_sum + ((m.video_avg_time_watched || 0) * (m.impressions || 0)),
    hook_imp: a.hook_imp + (m.impressions || 0),
    hook_sum: a.hook_sum + ((m.hook_rate || 0) * (m.impressions || 0)),
  }), { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, clicks: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, add_to_cart: 0, landing_page_views: 0, freq_imp: 0, freq_sum: 0, video_imp: 0, video_sum: 0, hook_imp: 0, hook_sum: 0 })

  const td = agg(todayM.data || [])
  const yd = agg(yesterdayM.data || [])

  const calc = (d: typeof td) => ({
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    cpa: d.purchases > 0 ? d.spend / d.purchases : null,
    ctr: d.reach > 0 && d.unique_link_clicks > 0 ? d.unique_link_clicks / d.reach * 100 : null,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : null,
    cpc: d.link_clicks > 0 ? d.spend / d.link_clicks : d.clicks > 0 ? d.spend / d.clicks : null,
    cost_atc: d.add_to_cart > 0 ? d.spend / d.add_to_cart : null,
    frequency: d.freq_imp > 0 ? d.freq_sum / d.freq_imp : null,
    hook_rate: d.hook_imp > 0 ? d.hook_sum / d.hook_imp : null,
    video_avg: d.video_imp > 0 ? d.video_sum / d.video_imp : null,
  })

  const t = calc(td)
  const y = calc(yd)

  const pct = (a: number | null, b: number | null) => (a && b && b > 0) ? ((a - b) / b) * 100 : null

  const byDate = new Map<string, any>()
  for (const m of weekM.data || []) {
    const e = byDate.get(m.date) || {
      spend: 0, purchase_value: 0, purchases: 0, impressions: 0,
      clicks: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0,
      add_to_cart: 0, landing_page_views: 0, checkout_initiated: 0,
      freq_sum: 0, freq_imp: 0,
    }
    byDate.set(m.date, {
      spend:              e.spend              + (m.spend              || 0),
      purchase_value:     e.purchase_value     + (m.purchase_value     || 0),
      purchases:          e.purchases          + (m.purchases          || 0),
      impressions:        e.impressions        + (m.impressions        || 0),
      clicks:             e.clicks             + (m.clicks             || 0),
      link_clicks:        e.link_clicks        + (m.link_clicks        || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach:              e.reach              + (m.reach              || 0),
      add_to_cart:        e.add_to_cart        + (m.add_to_cart        || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      freq_sum:           e.freq_sum           + ((m.frequency || 0) * (m.impressions || 0)),
      freq_imp:           e.freq_imp           + (m.impressions || 0),
    })
  }

  const dailyData = Array.from(byDate.entries()).map(([date, d]) => {
    const lc = d.link_clicks || d.clicks
    return {
      date,
      spend:              d.spend,
      roas:               d.spend > 0       ? d.purchase_value / d.spend : null,
      purchases:          d.purchases,
      purchase_value:     d.purchase_value,
      impressions:        d.impressions,
      clicks:             lc,
      unique_link_clicks: d.unique_link_clicks,
      add_to_cart:        d.add_to_cart,
      landing_page_views: d.landing_page_views,
      checkout_initiated: d.checkout_initiated,
      cpa:      d.purchases > 0    ? d.spend / d.purchases : null,
      ctr:      d.reach > 0 && d.unique_link_clicks > 0 ? d.unique_link_clicks / d.reach * 100 : null,
      cpm:      d.impressions > 0  ? d.spend / d.impressions * 1000 : null,
      cpc:      lc > 0             ? d.spend / lc : null,
      cost_atc: d.add_to_cart > 0  ? d.spend / d.add_to_cart : null,
      conv_web: d.landing_page_views > 0 && d.purchases > 0 ? d.purchases / d.landing_page_views * 100 : null,
      frequency: d.freq_imp > 0    ? d.freq_sum / d.freq_imp : null,
    }
  })

  const todayMap = new Map((todayM.data || []).map((m: any) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayM.data || []).map((m: any) => [m.object_id, m]))

  const campaignsWithMetrics = (campaigns.data || []).map((c: any) => {
    const tm = todayMap.get(c.id) as any
    const ym = yesterdayMap.get(c.id) as any
    return {
      ...c,
      m: {
        spend: tm?.spend ?? 0,
        purchases: tm?.purchases ?? 0,
        cpa: tm?.purchases > 0 ? tm.spend / tm.purchases : null,
        roas: tm?.roas ?? null,
        ctr: tm?.ctr ?? null,
        add_to_cart: tm?.add_to_cart ?? 0,
        link_clicks: tm?.link_clicks ?? 0,
        unique_link_clicks: tm?.unique_link_clicks ?? 0,
        landing_page_views: tm?.landing_page_views ?? 0,
      },
      trend: (tm?.roas ?? 0) > (ym?.roas ?? 0) ? '▲' : (tm?.roas ?? 0) < (ym?.roas ?? 0) ? '▼' : '—',
    }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    return b.m.spend - a.m.spend
  })

  const activeCampaigns = (campaigns.data || []).filter((c: any) => c.status === 'ACTIVE').length

  return { today, currency, activeCampaigns, dailyData, campaignsWithMetrics, alerts: alerts.data || [], td, yd, t, y, pct }
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const sp = await searchParams
  const days = Math.min(90, Math.max(1, Number(sp?.days || 1)))
  const customFrom = sp?.from || null
  const customTo = sp?.to || null
  const { today, currency, activeCampaigns, dailyData, campaignsWithMetrics, alerts, td, yd, t, y, pct } = await getOverviewData(days, customFrom, customTo)

  const dateLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  // Today's hero status
  const heroColor = t.roas && t.roas >= 2.5 ? '#22C55E' : t.roas && t.roas >= 1 ? '#F59E0B' : '#EF4444'
  const heroText = t.roas && t.roas >= 2.5 ? 'Rentable' : t.roas && t.roas >= 1 ? 'Atención' : td.spend > 0 ? 'Revisar' : 'Sin datos'

  const row1 = [
    { label: 'CPM', value: t.cpm ? formatCurrency(t.cpm, currency) : '—', delta: deltaLabel(pct(t.cpm, y.cpm), true), color: cpmColor(t.cpm) },
    { label: 'CTR único', value: t.ctr ? `${t.ctr.toFixed(2)}%` : '—', color: ctrColor(t.ctr), delta: deltaLabel(pct(t.ctr, y.ctr)) },
    { label: 'CPC', value: t.cpc ? formatCurrency(t.cpc, currency) : '—', delta: deltaLabel(pct(t.cpc, y.cpc), true), color: cpcColor(t.cpc) },
    { label: 'Clics únicos', value: formatNumber(td.unique_link_clicks || 0), delta: deltaLabel(pct(td.unique_link_clicks || 0, yd.unique_link_clicks || 0)), color: '#F1F5F9' },
  ]
  const row2 = [
    { label: 'Add to Cart', value: formatNumber(td.add_to_cart), delta: deltaLabel(pct(td.add_to_cart, yd.add_to_cart || 0)), color: '#F1F5F9' },
    { label: 'Costo por ATC', value: t.cost_atc ? formatCurrency(t.cost_atc, currency) : '—', delta: deltaLabel(pct(t.cost_atc, y.cost_atc), true), color: '#F1F5F9' },
    { label: 'Ventas (resultados)', value: String(td.purchases), color: td.purchases > 0 ? '#22C55E' : '#7A90AA', delta: deltaLabel(pct(td.purchases, yd.purchases || 0)) },
    { label: `CPA  ≤$${CPA_TARGET} ✓`, value: t.cpa ? formatCurrency(t.cpa, currency) : '—', color: cpaColor(t.cpa), delta: deltaLabel(pct(t.cpa, y.cpa), true) },
  ]
  const row3 = [
    { label: 'ROAS', value: t.roas ? formatROAS(t.roas) : '—', color: roasColor(t.roas), delta: deltaLabel(pct(t.roas, y.roas)) },
    { label: 'Gasto total', value: formatCurrency(td.spend, currency), delta: deltaLabel(pct(td.spend, yd.spend || 0)), color: '#F1F5F9' },
    { label: 'Tráfico efectivo', value: (td.link_clicks || td.clicks) > 0 ? `${(td.landing_page_views / (td.link_clicks || td.clicks) * 100).toFixed(1)}%` : '—', sub: `${td.landing_page_views} llegaron`, delta: (() => { const tv = (td.link_clicks || td.clicks) > 0 ? td.landing_page_views / (td.link_clicks || td.clicks) * 100 : null; const yv = (yd.link_clicks || yd.clicks) > 0 ? yd.landing_page_views / (yd.link_clicks || yd.clicks) * 100 : null; return deltaLabel(pct(tv, yv)) })(), color: '#F1F5F9' },
    { label: 'Frecuencia', value: t.frequency ? t.frequency.toFixed(2) : '—', color: t.frequency && t.frequency > 3.5 ? '#EF4444' : t.frequency && t.frequency > 2.5 ? '#F59E0B' : '#F1F5F9' },
  ]
  const row4 = [
    { label: 'Hook Rate', value: t.hook_rate ? `${t.hook_rate.toFixed(1)}%` : '—', color: t.hook_rate ? (t.hook_rate >= 40 ? '#22C55E' : t.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#7A90AA', sub: t.hook_rate ? (t.hook_rate >= 40 ? '▲ Excelente' : t.hook_rate >= 20 ? '~ Aceptable' : '▼ Mejorar') : undefined },
    { label: 'Video promedio', value: t.video_avg ? `${t.video_avg.toFixed(1)}s` : '—', color: '#F1F5F9' },
    { label: 'Campañas activas', value: String(activeCampaigns), color: activeCampaigns > 0 ? '#6366F1' : '#7A90AA' },
  ]

  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }
  const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }

  const thStyle: any = {
    padding: '8px 10px', textAlign: 'right' as const, color: '#7A90AA',
    fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #1A4080',
    whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', backgroundColor: '#050F1E',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <AutoRefresh />
      <div style={{ marginLeft: '220px', flex: 1 }}>
        <Header title="Overview" subtitle={dateLabel} />
        <main style={{ padding: '20px 20px', maxWidth: '100%' }}>

          {/* Today hero banner */}
          <div style={{
            marginBottom: '16px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${heroColor}10 0%, transparent 100%)`,
            border: `1px solid ${heroColor}30`,
            display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: heroColor, boxShadow: `0 0 8px ${heroColor}`,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: heroColor }}>
                {heroText}
              </span>
              <span style={{ fontSize: '12px', color: '#7A90AA' }}>—</span>
              <span style={{ fontSize: '12px', color: '#A8BCD0' }}>Hoy</span>
            </div>
            <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
              {[
                { label: 'VENTAS', value: String(td.purchases), color: td.purchases > 0 ? '#22C55E' : '#7A90AA' },
                { label: 'ROAS', value: t.roas ? `${t.roas.toFixed(2)}x` : '—', color: roasColor(t.roas) },
                { label: 'CPA', value: t.cpa ? formatCurrency(t.cpa, currency) : '—', color: cpaColor(t.cpa) },
                { label: 'GASTO', value: formatCurrency(td.spend, currency), color: '#F1F5F9' },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: '9px', color: '#7A90AA', letterSpacing: '0.08em', marginBottom: '2px' }}>{k.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: k.color, letterSpacing: '-0.02em' }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Range selector */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <Suspense fallback={null}>
              <RangeSelector />
            </Suspense>
          </div>

          {/* KPI grids */}
          <div style={grid4}>{row1.map(k => <KPI key={k.label} {...k} />)}</div>
          <div style={grid4}>{row2.map(k => <KPI key={k.label} {...k} />)}</div>
          <div style={grid4}>{row3.map(k => <KPI key={k.label} {...k} />)}</div>
          <div style={grid3}>{row4.map(k => <KPI key={k.label} {...k} />)}</div>

          {/* Spend chart */}
          <div style={{ marginBottom: '20px' }}>
            <SpendChart data={dailyData} />
          </div>

          {/* Day table + alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '16px', marginBottom: '20px' }}>
            {/* Daily table */}
            <div style={{ backgroundColor: '#071428', border: '1px solid #1A4080', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A4080', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5F9' }}>
                  📅 {customFrom && customTo ? `${customFrom} → ${customTo}` : `Últimos ${days} días`}
                </h3>
                <span style={{ fontSize: '10px', color: '#7A90AA' }}>CPA target ≤${CPA_TARGET}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '1500px', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      {[
                        { h: 'Fecha',      left: true },
                        { h: 'Ventas',     left: false },
                        { h: 'Valor conv.', left: false },
                        { h: 'CPA',        left: false },
                        { h: 'ROAS',       left: false },
                        { h: 'Gasto',      left: false },
                        { h: 'Impr.',      left: false },
                        { h: 'CPM',        left: false },
                        { h: 'CPC',        left: false },
                        { h: 'CTR',        left: false },
                        { h: 'Clics',      left: false },
                        { h: 'Visit. LP',  left: false },
                        { h: 'Tráf. ef.', left: false },
                        { h: 'Conv. web', left: false },
                        { h: 'ATC',        left: false },
                        { h: 'Costo ATC', left: false },
                        { h: 'Pagos inic.', left: false },
                        { h: 'Frec.',      left: false },
                      ].map(({ h, left }) => (
                        <th key={h} style={{ ...thStyle, textAlign: left ? 'left' as const : 'right' as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...dailyData].reverse().map((d: any) => {
                      const isToday = d.date === today
                      const cell = (v: React.ReactNode, color?: string) => (
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: color || '#F1F5F9' }}>{v}</td>
                      )
                      return (
                        <tr key={d.date} className="tr-hover" style={{ backgroundColor: isToday ? '#0A1E3A' : 'transparent' }}>
                          <td style={{ padding: '7px 10px', color: isToday ? '#6366F1' : '#F1F5F9', fontWeight: isToday ? 700 : 400, textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {new Date(d.date + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                            {isToday && <span style={{ marginLeft: '5px', fontSize: '9px', color: '#6366F1', backgroundColor: '#6366F120', padding: '1px 5px', borderRadius: '3px' }}>HOY</span>}
                          </td>
                          {cell(d.purchases > 0 ? d.purchases : '—', d.purchases > 0 ? '#22C55E' : '#7A90AA')}
                          {cell(d.purchase_value > 0 ? formatCurrency(d.purchase_value, currency) : '—', '#A8BCD0')}
                          {cell(d.cpa ? formatCurrency(d.cpa, currency) : '—', cpaColor(d.cpa))}
                          {cell(d.roas ? `${d.roas.toFixed(2)}x` : '—', roasColor(d.roas))}
                          {cell(formatCurrency(d.spend, currency))}
                          {cell(d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—', '#A8BCD0')}
                          {cell(d.cpm ? formatCurrency(d.cpm, currency) : '—', cpmColor(d.cpm))}
                          {cell(d.cpc ? formatCurrency(d.cpc, currency) : '—', cpcColor(d.cpc))}
                          {cell(d.ctr ? `${d.ctr.toFixed(2)}%` : '—', ctrColor(d.ctr))}
                          {cell(d.unique_link_clicks > 0 ? d.unique_link_clicks : '—', '#A8BCD0')}
                          {cell(d.landing_page_views > 0 ? d.landing_page_views : '—', '#A8BCD0')}
                          {cell(d.conv_web !== null && d.clicks > 0 ? `${(d.landing_page_views / d.clicks * 100).toFixed(2)}%` : '—', '#A8BCD0')}
                          {cell(d.conv_web ? `${d.conv_web.toFixed(2)}%` : '—', '#A8BCD0')}
                          {cell(d.add_to_cart > 0 ? d.add_to_cart : '—')}
                          {cell(d.cost_atc ? formatCurrency(d.cost_atc, currency) : '—')}
                          {cell(d.checkout_initiated > 0 ? d.checkout_initiated : '—')}
                          {cell(d.frequency ? `${d.frequency.toFixed(2)}x` : '—', d.frequency && d.frequency > 3.5 ? '#EF4444' : d.frequency && d.frequency > 2.5 ? '#F59E0B' : '#A8BCD0')}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <AlertsFeed alerts={alerts as any} />
          </div>

          {/* Campaigns table */}
          <div style={{ backgroundColor: '#071428', border: '1px solid #1A4080', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A4080', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5F9' }}>Campañas — hoy</h3>
              <Link href="/campaigns" style={{ fontSize: '11px', color: '#6366F1', textDecoration: 'none', fontWeight: 500 }}>Ver todas →</Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {['Campaña', '', 'Ventas', 'CPA', 'ROAS', 'Gasto', 'CTR', 'ATC', 'Tráf.', 'Tend.'].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: (i === 0 || i === 1) ? 'left' as const : 'right' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaignsWithMetrics.slice(0, 15).map((c: any) => (
                    <tr key={c.id} className="tr-hover" style={{ borderBottom: '1px solid #07142850' }}>
                      <td style={{ padding: '9px 10px', maxWidth: '200px' }}>
                        <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'left' }}>
                        <span className={c.status === 'ACTIVE' ? 'status-active' : 'status-paused'} />
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: c.m.purchases > 0 ? '#22C55E' : '#7A90AA', fontWeight: 600 }}>{c.m.purchases}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: cpaColor(c.m.cpa), fontWeight: 600 }}>{c.m.cpa ? formatCurrency(c.m.cpa, currency) : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: roasColor(c.m.roas) }}>{c.m.roas ? `${c.m.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#F1F5F9' }}>{formatCurrency(c.m.spend, currency)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: ctrColor(c.m.ctr) }}>{c.m.ctr ? `${c.m.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#A8BCD0' }}>{c.m.add_to_cart}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#A8BCD0' }}>{c.m.link_clicks > 0 ? `${(c.m.landing_page_views / c.m.link_clicks * 100).toFixed(1)}%` : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: c.trend === '▲' ? '#22C55E' : c.trend === '▼' ? '#EF4444' : '#7A90AA', fontWeight: 600 }}>{c.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
