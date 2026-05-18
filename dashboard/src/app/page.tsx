import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import SpendChart from '@/components/dashboard/SpendChart'
import AlertsFeed from '@/components/dashboard/AlertsFeed'
import { formatCurrency, formatROAS, formatNumber, statusEmoji } from '@/lib/utils'
import AutoRefresh from './AutoRefresh'
import Link from 'next/link'

const CPA_BREAKEVEN = 15
const CPA_TARGET = 7

function cpaColor(cpa: number | null): string {
  if (!cpa) return '#64748B'
  if (cpa <= CPA_TARGET) return '#22C55E'
  if (cpa <= CPA_BREAKEVEN) return '#F59E0B'
  return '#EF4444'
}

function roasColor(roas: number | null): string {
  if (!roas) return '#64748B'
  if (roas >= 3.5) return '#22C55E'
  if (roas >= 1.5) return '#F59E0B'
  return '#EF4444'
}

function deltaLabel(delta: number | null): { text: string; color: string } | null {
  if (delta === null || delta === undefined) return null
  const color = delta >= 0 ? '#22C55E' : '#EF4444'
  const text = `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}% vs ayer`
  return { text, color }
}

async function getOverviewData() {
  await headers()

  const latestDateRes = await supabaseAdmin
    .from('metrics')
    .select('date')
    .eq('object_type', 'campaign')
    .order('date', { ascending: false })
    .limit(1)

  const today = latestDateRes.data?.[0]?.date ?? new Date().toISOString().split('T')[0]
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = new Date(todayMs - 7 * 86400000).toISOString().split('T')[0]

  const [todayMetrics, yesterdayMetrics, weekMetrics, campaigns, alerts] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', sevenDaysAgo).order('date'),
    supabaseAdmin.from('campaigns').select('*').order('updated_at', { ascending: false }),
    supabaseAdmin.from('alerts').select('*').order('created_at', { ascending: false }).limit(5),
  ])

  const sumMetrics = (rows: any[]) => rows.reduce((acc, m) => ({
    spend: acc.spend + (m.spend || 0),
    purchases: acc.purchases + (m.purchases || 0),
    purchase_value: acc.purchase_value + (m.purchase_value || 0),
    impressions: acc.impressions + (m.impressions || 0),
    clicks: acc.clicks + (m.clicks || 0),
    add_to_cart: acc.add_to_cart + (m.add_to_cart || 0),
    landing_page_views: acc.landing_page_views + (m.landing_page_views || 0),
  }), { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, clicks: 0, add_to_cart: 0, landing_page_views: 0 })

  const td = sumMetrics(todayMetrics.data || [])
  const yd = sumMetrics(yesterdayMetrics.data || [])

  const todayRoas = td.spend > 0 ? td.purchase_value / td.spend : null
  const todayCpa = td.purchases > 0 ? td.spend / td.purchases : null
  const todayCtr = td.impressions > 0 ? td.clicks / td.impressions * 100 : null
  const todayCpm = td.impressions > 0 ? td.spend / td.impressions * 1000 : null
  const todayCpc = td.clicks > 0 ? td.spend / td.clicks : null
  const todayCostAtc = td.add_to_cart > 0 ? td.spend / td.add_to_cart : null

  const yesterdayRoas = yd.spend > 0 ? yd.purchase_value / yd.spend : null
  const yesterdayCpa = yd.purchases > 0 ? yd.spend / yd.purchases : null

  const pct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : null

  const activeCampaigns = (campaigns.data || []).filter((c: any) => c.status === 'ACTIVE').length

  // Daily aggregation
  const byDate = new Map<string, any>()
  for (const m of weekMetrics.data || []) {
    const e = byDate.get(m.date) || { spend: 0, purchase_value: 0, purchases: 0, impressions: 0, clicks: 0, add_to_cart: 0 }
    byDate.set(m.date, {
      spend: e.spend + (m.spend || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      purchases: e.purchases + (m.purchases || 0),
      impressions: e.impressions + (m.impressions || 0),
      clicks: e.clicks + (m.clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
    })
  }

  const dailyData = Array.from(byDate.entries()).map(([date, d]) => ({
    date,
    spend: d.spend,
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    purchases: d.purchases,
    impressions: d.impressions,
    clicks: d.clicks,
    add_to_cart: d.add_to_cart,
    cpa: d.purchases > 0 ? d.spend / d.purchases : null,
    ctr: d.impressions > 0 ? d.clicks / d.impressions * 100 : null,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : null,
  }))

  // Campaigns with today metrics
  const todayMap = new Map((todayMetrics.data || []).map((m: any) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayMetrics.data || []).map((m: any) => [m.object_id, m]))

  const campaignsWithMetrics = (campaigns.data || []).map((c: any) => {
    const tm = todayMap.get(c.id) as any
    const ym = yesterdayMap.get(c.id) as any
    return {
      ...c,
      todayMetrics: {
        spend: tm?.spend ?? 0,
        roas: tm?.roas ?? null,
        purchases: tm?.purchases ?? 0,
        cpa: tm?.cpa ?? (tm?.spend && tm?.purchases ? tm.spend / tm.purchases : null),
        ctr: tm?.ctr ?? null,
        add_to_cart: tm?.add_to_cart ?? 0,
      },
      trend: (tm?.roas ?? 0) > (ym?.roas ?? 0) ? 'up' : (tm?.roas ?? 0) < (ym?.roas ?? 0) ? 'down' : 'neutral',
    }
  }).sort((a: any, b: any) => b.todayMetrics.spend - a.todayMetrics.spend)

  return {
    today, activeCampaigns, dailyData, campaignsWithMetrics, alerts: alerts.data || [],
    td, todayRoas, todayCpa, todayCtr, todayCpm, todayCpc, todayCostAtc,
    yd, yesterdayRoas, yesterdayCpa,
    deltas: {
      spend: pct(td.spend, yd.spend),
      roas: pct(todayRoas ?? 0, yesterdayRoas ?? 0),
      purchases: pct(td.purchases, yd.purchases),
      cpa: todayCpa && yesterdayCpa ? pct(todayCpa, yesterdayCpa) : null,
      ctr: todayCtr && (yd.impressions > 0 ? yd.clicks / yd.impressions * 100 : null) ? pct(todayCtr, yd.clicks / yd.impressions * 100) : null,
    }
  }
}

function KPI({ label, value, delta, color, small }: { label: string; value: string; delta?: { text: string; color: string } | null; color?: string; small?: boolean }) {
  return (
    <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', padding: '20px', flex: 1, minWidth: '130px' }}>
      <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: small ? '20px' : '26px', fontWeight: 700, color: color || '#F1F5F9', lineHeight: 1.2 }}>{value}</div>
      {delta && <div style={{ fontSize: '11px', color: delta.color, marginTop: '6px' }}>{delta.text}</div>}
    </div>
  )
}

export default async function OverviewPage() {
  const data = await getOverviewData()
  const { td, todayRoas, todayCpa, todayCtr, todayCpm, todayCpc, todayCostAtc, deltas } = data

  const accounts = await supabaseAdmin.from('ad_accounts').select('currency').limit(1)
  const currency = accounts.data?.[0]?.currency || 'USD'

  const dateLabel = new Date(data.today + 'T12:00:00Z').toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires'
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <AutoRefresh />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Overview" subtitle={`Hoy — ${dateLabel}`} />
        <main style={{ padding: '32px', maxWidth: '1400px' }}>

          {/* Row 1: Ventas + CPA + Gasto + ROAS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
            <KPI label="Ventas hoy" value={String(td.purchases)} delta={deltaLabel(deltas.purchases)} />
            <KPI
              label={`CPA (breakeven $${CPA_BREAKEVEN})`}
              value={todayCpa ? formatCurrency(todayCpa, currency) : '—'}
              delta={deltaLabel(deltas.cpa ? -deltas.cpa : null)}
              color={cpaColor(todayCpa)}
            />
            <KPI label="Gasto hoy" value={formatCurrency(td.spend, currency)} delta={deltaLabel(deltas.spend)} />
            <KPI label="ROAS" value={todayRoas ? formatROAS(todayRoas) : '—'} delta={deltaLabel(deltas.roas)} color={roasColor(todayRoas)} />
          </div>

          {/* Row 2: Impresiones + CTR + CPM + CPC */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
            <KPI label="Impresiones" value={formatNumber(td.impressions)} small />
            <KPI label="CTR" value={todayCtr ? `${todayCtr.toFixed(2)}%` : '—'} color={todayCtr ? (todayCtr >= 2.5 ? '#22C55E' : todayCtr >= 0.8 ? '#F1F5F9' : '#EF4444') : undefined} small />
            <KPI label="CPM" value={todayCpm ? formatCurrency(todayCpm, currency) : '—'} small />
            <KPI label="CPC" value={todayCpc ? formatCurrency(todayCpc, currency) : '—'} small />
          </div>

          {/* Row 3: Add to Cart + Costo/ATC + LP Views + Campañas activas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <KPI label="Add to Cart" value={String(td.add_to_cart)} small />
            <KPI label="Costo por ATC" value={todayCostAtc ? formatCurrency(todayCostAtc, currency) : '—'} small />
            <KPI label="Landing Page Views" value={formatNumber(td.landing_page_views)} small />
            <KPI label="Campañas activas" value={String(data.activeCampaigns)} small />
          </div>

          {/* Chart */}
          <div style={{ marginBottom: '24px' }}>
            <SpendChart data={data.dailyData} />
          </div>

          {/* Daily table + Alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '16px', marginBottom: '24px' }}>
            {/* Day-by-day table */}
            <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #2D3244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F1F5F9' }}>📅 Últimos 7 días</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Fecha', 'Ventas', 'CPA', 'Gasto', 'ROAS', 'CTR', 'CPM', 'ATC'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B', fontWeight: 500, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.dailyData].reverse().map((d: any) => {
                      const isToday = d.date === data.today
                      const cpaOk = d.cpa !== null && d.cpa <= CPA_TARGET
                      const cpaBad = d.cpa !== null && d.cpa > CPA_BREAKEVEN
                      return (
                        <tr key={d.date} style={{ backgroundColor: isToday ? '#1e2235' : 'transparent' }}>
                          <td style={{ padding: '8px 12px', color: isToday ? '#6366F1' : '#F1F5F9', fontWeight: isToday ? 600 : 400, whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {new Date(d.date + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: d.purchases > 0 ? '#22C55E' : '#64748B' }}>{d.purchases}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: cpaOk ? '#22C55E' : cpaBad ? '#EF4444' : '#F59E0B', fontWeight: 600 }}>
                            {d.cpa ? formatCurrency(d.cpa, currency) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#F1F5F9' }}>{formatCurrency(d.spend, currency)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: roasColor(d.roas) }}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: d.ctr ? (d.ctr >= 2.5 ? '#22C55E' : d.ctr >= 0.8 ? '#F1F5F9' : '#EF4444') : '#64748B' }}>
                            {d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#F1F5F9' }}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#F1F5F9' }}>{d.add_to_cart || 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <AlertsFeed alerts={data.alerts as any} />
          </div>

          {/* Campaigns table */}
          <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #2D3244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F1F5F9' }}>📣 Campañas — hoy</h3>
              <Link href="/campaigns" style={{ fontSize: '12px', color: '#6366F1', textDecoration: 'none' }}>Ver todas →</Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Campaña', 'Estado', 'Ventas', 'CPA', 'Gasto', 'ROAS', 'CTR', 'ATC'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Campaña' ? 'left' : 'right', color: '#64748B', fontWeight: 500, borderBottom: '1px solid #2D3244' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.campaignsWithMetrics.slice(0, 10).map((c: any) => {
                    const cpaOk = c.todayMetrics.cpa !== null && c.todayMetrics.cpa <= CPA_TARGET
                    const cpaBad = c.todayMetrics.cpa !== null && c.todayMetrics.cpa > CPA_BREAKEVEN
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #2D3244' }}>
                        <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                          <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', fontSize: '12px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name}
                          </Link>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{statusEmoji(c.status)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: c.todayMetrics.purchases > 0 ? '#22C55E' : '#64748B' }}>{c.todayMetrics.purchases}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: cpaOk ? '#22C55E' : cpaBad ? '#EF4444' : '#F59E0B', fontWeight: 600 }}>
                          {c.todayMetrics.cpa ? formatCurrency(c.todayMetrics.cpa, currency) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#F1F5F9' }}>{formatCurrency(c.todayMetrics.spend, currency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: roasColor(c.todayMetrics.roas) }}>{c.todayMetrics.roas ? `${c.todayMetrics.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: c.todayMetrics.ctr ? (c.todayMetrics.ctr >= 2.5 ? '#22C55E' : c.todayMetrics.ctr >= 0.8 ? '#F1F5F9' : '#EF4444') : '#64748B' }}>
                          {c.todayMetrics.ctr ? `${c.todayMetrics.ctr.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#F1F5F9' }}>{c.todayMetrics.add_to_cart || 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
