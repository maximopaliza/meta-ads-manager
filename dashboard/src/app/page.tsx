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
  if (!v) return '#64748B'
  if (v <= CPA_TARGET) return '#22C55E'
  if (v <= CPA_BREAKEVEN) return '#F59E0B'
  return '#EF4444'
}

function roasColor(v: number | null) {
  if (!v) return '#64748B'
  if (v >= 3.5) return '#22C55E'
  if (v >= 1.5) return '#F59E0B'
  return '#EF4444'
}

function ctrColor(v: number | null) {
  if (!v) return '#64748B'
  if (v >= 2.5) return '#22C55E'
  if (v >= 0.8) return '#F1F5F9'
  return '#EF4444'
}

function deltaLabel(delta: number | null, invertSign = false) {
  if (delta === null || delta === undefined) return null
  const d = invertSign ? -delta : delta
  return {
    text: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}% vs ayer`,
    color: d >= 0 ? '#22C55E' : '#EF4444',
  }
}

function KPI({ label, value, delta, color, sub }: {
  label: string; value: string
  delta?: { text: string; color: string } | null
  color?: string; sub?: string
}) {
  return (
    <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color || '#F1F5F9', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{sub}</div>}
      {delta && <div style={{ fontSize: '10px', color: delta.color, marginTop: '4px' }}>{delta.text}</div>}
    </div>
  )
}

async function getOverviewData(days: number) {
  await headers()

  const latestDateRes = await supabaseAdmin
    .from('metrics').select('date').eq('object_type', 'campaign')
    .order('date', { ascending: false }).limit(1)

  const today = latestDateRes.data?.[0]?.date ?? new Date().toISOString().split('T')[0]
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]
  const rangeStart = new Date(todayMs - days * 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = rangeStart

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
    add_to_cart: a.add_to_cart + (m.add_to_cart || 0),
    landing_page_views: a.landing_page_views + (m.landing_page_views || 0),
    // frequency: impressions-weighted average
    freq_imp: a.freq_imp + (m.impressions || 0),
    freq_sum: a.freq_sum + ((m.frequency || 0) * (m.impressions || 0)),
    // video: impression-weighted
    video_imp: a.video_imp + (m.impressions || 0),
    video_sum: a.video_sum + ((m.video_avg_time_watched || 0) * (m.impressions || 0)),
    hook_imp: a.hook_imp + (m.impressions || 0),
    hook_sum: a.hook_sum + ((m.hook_rate || 0) * (m.impressions || 0)),
  }), { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, clicks: 0, link_clicks: 0, add_to_cart: 0, landing_page_views: 0, freq_imp: 0, freq_sum: 0, video_imp: 0, video_sum: 0, hook_imp: 0, hook_sum: 0 })

  const td = agg(todayM.data || [])
  const yd = agg(yesterdayM.data || [])

  const calc = (d: typeof td) => ({
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    cpa: d.purchases > 0 ? d.spend / d.purchases : null,
    ctr: d.impressions > 0 && d.link_clicks > 0 ? d.link_clicks / d.impressions * 100 : d.impressions > 0 && d.clicks > 0 ? d.clicks / d.impressions * 100 : null,
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

  // Daily data for chart + table
  const byDate = new Map<string, any>()
  for (const m of weekM.data || []) {
    const e = byDate.get(m.date) || { spend: 0, purchase_value: 0, purchases: 0, impressions: 0, clicks: 0, link_clicks: 0, add_to_cart: 0, landing_page_views: 0, freq_sum: 0, freq_imp: 0 }
    byDate.set(m.date, {
      spend: e.spend + (m.spend || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      purchases: e.purchases + (m.purchases || 0),
      impressions: e.impressions + (m.impressions || 0),
      clicks: e.clicks + (m.clicks || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      freq_sum: e.freq_sum + ((m.frequency || 0) * (m.impressions || 0)),
      freq_imp: e.freq_imp + (m.impressions || 0),
    })
  }

  const dailyData = Array.from(byDate.entries()).map(([date, d]) => {
    const lc = d.link_clicks || d.clicks
    return {
      date,
      spend: d.spend,
      roas: d.spend > 0 ? d.purchase_value / d.spend : null,
      purchases: d.purchases,
      impressions: d.impressions,
      clicks: lc,
      add_to_cart: d.add_to_cart,
      landing_page_views: d.landing_page_views,
      cpa: d.purchases > 0 ? d.spend / d.purchases : null,
      ctr: d.impressions > 0 && lc > 0 ? lc / d.impressions * 100 : null,
      cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : null,
      cost_atc: d.add_to_cart > 0 ? d.spend / d.add_to_cart : null,
      frequency: d.freq_imp > 0 ? d.freq_sum / d.freq_imp : null,
    }
  })

  // Campaigns with metrics
  const todayMap = new Map((todayM.data || []).map((m: any) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayM.data || []).map((m: any) => [m.object_id, m]))

  const campaignsWithMetrics = (campaigns.data || []).map((c: any) => {
    const tm = todayMap.get(c.id) as any
    const ym = yesterdayMap.get(c.id) as any
    const lc = tm?.link_clicks || tm?.clicks || 0
    return {
      ...c,
      m: {
        spend: tm?.spend ?? 0,
        purchases: tm?.purchases ?? 0,
        cpa: tm?.purchases > 0 ? tm.spend / tm.purchases : null,
        roas: tm?.roas ?? null,
        ctr: tm?.impressions > 0 && lc > 0 ? lc / tm.impressions * 100 : null,
        add_to_cart: tm?.add_to_cart ?? 0,
        link_clicks: lc,
        landing_page_views: tm?.landing_page_views ?? 0,
      },
      trend: (tm?.roas ?? 0) > (ym?.roas ?? 0) ? '▲' : (tm?.roas ?? 0) < (ym?.roas ?? 0) ? '▼' : '—',
    }
  }).sort((a: any, b: any) => b.m.spend - a.m.spend)

  const activeCampaigns = (campaigns.data || []).filter((c: any) => c.status === 'ACTIVE').length

  return { today, currency, activeCampaigns, dailyData, campaignsWithMetrics, alerts: alerts.data || [], td, t, y, pct }
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams
  const days = Math.min(30, Math.max(7, Number(sp?.days || 7)))
  const { today, currency, activeCampaigns, dailyData, campaignsWithMetrics, alerts, td, t, y, pct } = await getOverviewData(days)

  const dateLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  // Metric rows in requested order
  const row1 = [
    { label: 'CPM', value: t.cpm ? formatCurrency(t.cpm, currency) : '—', delta: deltaLabel(pct(t.cpm, y.cpm), true) },
    { label: 'CTR', value: t.ctr ? `${t.ctr.toFixed(2)}%` : '—', color: ctrColor(t.ctr), delta: deltaLabel(pct(t.ctr, y.ctr)) },
    { label: 'CPC', value: t.cpc ? formatCurrency(t.cpc, currency) : '—', delta: deltaLabel(pct(t.cpc, y.cpc), true) },
    { label: 'Clics únicos enlace', value: formatNumber(td.link_clicks || td.clicks), delta: deltaLabel(pct(td.link_clicks || td.clicks, (y as any).link_clicks || 0)) },
  ]
  const row2 = [
    { label: 'ATC (add to cart)', value: formatNumber(td.add_to_cart), delta: deltaLabel(pct(td.add_to_cart, (y as any).add_to_cart || 0)) },
    { label: 'Costo por ATC', value: t.cost_atc ? formatCurrency(t.cost_atc, currency) : '—', delta: deltaLabel(pct(t.cost_atc, y.cost_atc), true) },
    { label: 'Resultados (ventas)', value: String(td.purchases), color: td.purchases > 0 ? '#22C55E' : '#64748B', delta: deltaLabel(pct(td.purchases, (y as any).purchases || 0)) },
    { label: `CPA (≤$${CPA_TARGET} 🟢 ≤$15 🟡)`, value: t.cpa ? formatCurrency(t.cpa, currency) : '—', color: cpaColor(t.cpa), delta: deltaLabel(pct(t.cpa, y.cpa), true) },
  ]
  const row3 = [
    { label: 'ROAS', value: t.roas ? formatROAS(t.roas) : '—', color: roasColor(t.roas), delta: deltaLabel(pct(t.roas, y.roas)) },
    { label: 'Importe gastado', value: formatCurrency(td.spend, currency), delta: deltaLabel(pct(td.spend, (y as any).spend || 0)) },
    { label: 'Tráfico efectivo (LPV)', value: formatNumber(td.landing_page_views), delta: deltaLabel(pct(td.landing_page_views, (y as any).landing_page_views || 0)) },
    { label: 'Frecuencia', value: t.frequency ? t.frequency.toFixed(2) : '—', color: t.frequency && t.frequency > 3.5 ? '#EF4444' : '#F1F5F9' },
  ]
  const row4 = [
    { label: 'Hook Rate', value: t.hook_rate ? `${t.hook_rate.toFixed(1)}%` : '—', color: t.hook_rate ? (t.hook_rate >= 40 ? '#22C55E' : t.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#64748B', sub: t.hook_rate ? (t.hook_rate >= 40 ? 'Excelente' : t.hook_rate >= 20 ? 'Aceptable' : 'Mejorar hook') : undefined },
    { label: 'Tiempo prom. video (seg)', value: t.video_avg ? `${t.video_avg.toFixed(1)}s` : '—' },
    { label: 'Campañas activas', value: String(activeCampaigns) },
  ]

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }
  const grid3Style = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <AutoRefresh />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Overview" subtitle={`Hoy — ${dateLabel}`} />
        <main style={{ padding: '28px 32px', maxWidth: '1400px' }}>

          {/* Range selector */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <Suspense fallback={null}>
              <RangeSelector />
            </Suspense>
          </div>

          {/* Rows 1-3: 4 cols each */}
          <div style={gridStyle}>
            {row1.map(k => <KPI key={k.label} {...k} />)}
          </div>
          <div style={gridStyle}>
            {row2.map(k => <KPI key={k.label} {...k} />)}
          </div>
          <div style={gridStyle}>
            {row3.map(k => <KPI key={k.label} {...k} />)}
          </div>
          {/* Row 4: 3 cols (video metrics + activas) */}
          <div style={grid3Style}>
            {row4.map(k => <KPI key={k.label} {...k} />)}
          </div>

          {/* Spend chart */}
          <div style={{ marginBottom: '24px' }}>
            <SpendChart data={dailyData} />
          </div>

          {/* Day-by-day table + Alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #2D3244' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>📅 Últimos {days} días</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      {['Fecha', 'Ventas', 'CPA', 'ROAS', 'Gasto', 'CTR', 'CPM', 'ATC', 'LPV', 'Frec'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'right', color: '#64748B', fontWeight: 500, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...dailyData].reverse().map((d: any) => {
                      const isToday = d.date === today
                      return (
                        <tr key={d.date} style={{ backgroundColor: isToday ? '#1e2235' : 'transparent' }}>
                          <td style={{ padding: '7px 10px', color: isToday ? '#6366F1' : '#F1F5F9', fontWeight: isToday ? 600 : 400, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {new Date(d.date + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: d.purchases > 0 ? '#22C55E' : '#64748B' }}>{d.purchases}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: cpaColor(d.cpa), fontWeight: 600 }}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: roasColor(d.roas) }}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#F1F5F9' }}>{formatCurrency(d.spend, currency)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: ctrColor(d.ctr) }}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#F1F5F9' }}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#F1F5F9' }}>{d.add_to_cart || 0}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#F1F5F9' }}>{d.landing_page_views || 0}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: d.frequency && d.frequency > 3.5 ? '#EF4444' : '#F1F5F9' }}>{d.frequency ? d.frequency.toFixed(1) : '—'}</td>
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
          <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #2D3244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>📣 Campañas — hoy</h3>
              <Link href="/campaigns" style={{ fontSize: '12px', color: '#6366F1', textDecoration: 'none' }}>Ver todas →</Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {['Campaña', '', 'Ventas', 'CPA', 'ROAS', 'Gasto', 'CTR', 'ATC', 'LPV', 'Tend.'].map((h, i) => (
                      <th key={i} style={{ padding: '7px 10px', textAlign: i <= 1 ? 'left' : 'right', color: '#64748B', fontWeight: 500, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaignsWithMetrics.slice(0, 12).map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1a1d27' }}>
                      <td style={{ padding: '9px 10px', maxWidth: '180px' }}>
                        <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td style={{ padding: '9px 6px' }}>{statusEmoji(c.status)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: c.m.purchases > 0 ? '#22C55E' : '#64748B' }}>{c.m.purchases}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: cpaColor(c.m.cpa), fontWeight: 600 }}>{c.m.cpa ? formatCurrency(c.m.cpa, currency) : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: roasColor(c.m.roas) }}>{c.m.roas ? `${c.m.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#F1F5F9' }}>{formatCurrency(c.m.spend, currency)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: ctrColor(c.m.ctr) }}>{c.m.ctr ? `${c.m.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#F1F5F9' }}>{c.m.add_to_cart}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#F1F5F9' }}>{c.m.landing_page_views}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: c.trend === '▲' ? '#22C55E' : c.trend === '▼' ? '#EF4444' : '#64748B' }}>{c.trend}</td>
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
