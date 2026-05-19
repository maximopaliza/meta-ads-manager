import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import RangeSelector from '@/components/dashboard/RangeSelector'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'
import { notFound } from 'next/navigation'

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ days?: string }>
}) {
  await headers()
  const { id } = await params
  const sp = await searchParams
  const days = Math.min(90, Math.max(1, Number(sp?.days || 7)))

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const rangeStart = new Date(todayMs - days * 86400000).toISOString().split('T')[0]

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns').select('*').eq('id', id).single()

  if (error || !campaign) notFound()

  const [todayM, rangeM, adSetsRes, adSetTodayM, adSetRangeM, accountRes, alerts] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_id', id).eq('object_type', 'campaign').eq('date', today).single(),
    supabaseAdmin.from('metrics').select('*').eq('object_id', id).eq('object_type', 'campaign').gte('date', rangeStart).order('date', { ascending: false }),
    supabaseAdmin.from('ad_sets').select('*').eq('campaign_id', id),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').gte('date', rangeStart),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
    supabaseAdmin.from('alerts').select('*').eq('object_id', id).order('created_at', { ascending: false }).limit(5),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const tm = todayM.data as any

  // Build today map for ad sets
  const asToday = new Map((adSetTodayM.data || []).map((m: any) => [m.object_id, m]))

  // Aggregate range for ad sets
  const asRangeAgg = new Map<string, any>()
  for (const m of adSetRangeM.data || []) {
    const e = asRangeAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, clicks: 0, add_to_cart: 0, unique_link_clicks: 0, reach: 0 }
    asRangeAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      clicks: e.clicks + (m.clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach: e.reach + (m.reach || 0),
    })
  }

  // Ad sets with metrics
  const adSetRows = (adSetsRes.data || []).map((as: any) => {
    const atm = asToday.get(as.id) as any
    const arm = asRangeAgg.get(as.id) as any
    const lc = atm?.link_clicks || atm?.clicks || 0
    const rlc = arm?.link_clicks || arm?.clicks || 0
    return {
      ...as,
      today: {
        spend: atm?.spend ?? 0,
        purchases: atm?.purchases ?? 0,
        roas: atm?.roas ?? null,
        cpa: atm?.purchases > 0 ? atm.spend / atm.purchases : null,
        ctr: atm?.ctr ?? null,
        cpm: atm?.cpm ?? null,
        cpc: atm?.cpc || (lc > 0 ? (atm?.spend || 0) / lc : null),
        add_to_cart: atm?.add_to_cart ?? 0,
        cost_per_atc: atm?.cost_per_atc ?? (atm?.add_to_cart > 0 ? (atm?.spend || 0) / atm.add_to_cart : null),
        hook_rate: atm?.hook_rate ?? null,
      },
      range: arm ? {
        spend: arm.spend,
        purchases: arm.purchases,
        roas: arm.spend > 0 ? arm.purchase_value / arm.spend : null,
        cpa: arm.purchases > 0 ? arm.spend / arm.purchases : null,
        ctr: arm.reach > 0 && arm.unique_link_clicks > 0 ? arm.unique_link_clicks / arm.reach * 100 : null,
        add_to_cart: arm.add_to_cart,
      } : null,
    }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    return b.today.spend - a.today.spend
  })

  // Today KPI derived
  const lc = tm?.link_clicks || tm?.clicks || 0
  const todayKpis = tm ? {
    spend: tm.spend ?? 0,
    purchases: tm.purchases ?? 0,
    roas: tm.roas ?? null,
    cpa: tm.purchases > 0 ? tm.spend / tm.purchases : null,
    ctr: tm.ctr ?? null,
    cpm: tm.cpm ?? null,
    cpc: tm.cpc || (lc > 0 ? tm.spend / lc : null),
    add_to_cart: tm.add_to_cart ?? 0,
    cost_per_atc: tm.cost_per_atc ?? (tm.add_to_cart > 0 ? tm.spend / tm.add_to_cart : null),
    impressions: tm.impressions ?? 0,
    link_clicks: lc,
    frequency: tm.frequency ?? null,
    hook_rate: tm.hook_rate ?? null,
    video_avg_time_watched: tm.video_avg_time_watched ?? null,
    landing_page_views: tm.landing_page_views ?? 0,
  } : null

  const thStyle: any = { padding: '7px 10px', textAlign: 'right', color: '#64748B', fontSize: '11px', fontWeight: 500, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' }
  const tdStyle: any = { padding: '8px 10px', textAlign: 'right', fontSize: '12px', borderBottom: '1px solid #1a1d27' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header
          title={campaign.name}
          subtitle={`${statusEmoji(campaign.status)} ${campaign.status} · ${campaign.objective || 'Sin objetivo'}`}
        />
        <main style={{ padding: '28px 32px', maxWidth: '1600px' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <RangeSelector />
          </div>

          {/* KPIs hoy */}
          {todayKpis && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoy — {today}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Gasto', value: todayKpis.spend > 0 ? formatCurrency(todayKpis.spend, currency) : '—', color: '#F1F5F9' },
                  { label: 'Resultados', value: todayKpis.purchases > 0 ? String(todayKpis.purchases) : '—', color: todayKpis.purchases > 0 ? '#22C55E' : '#64748B' },
                  { label: 'CPA', value: todayKpis.cpa ? formatCurrency(todayKpis.cpa, currency) : '—', color: cpaColor(todayKpis.cpa) },
                  { label: 'ROAS', value: todayKpis.roas ? `${todayKpis.roas.toFixed(2)}x` : '—', color: roasColor(todayKpis.roas) },
                  { label: 'CTR', value: todayKpis.ctr ? `${todayKpis.ctr.toFixed(2)}%` : '—', color: ctrColor(todayKpis.ctr) },
                  { label: 'CPM', value: todayKpis.cpm ? formatCurrency(todayKpis.cpm, currency) : '—', color: '#F1F5F9' },
                  { label: 'CPC', value: todayKpis.cpc ? formatCurrency(todayKpis.cpc, currency) : '—', color: '#F1F5F9' },
                  { label: 'Clics enlace', value: todayKpis.link_clicks > 0 ? formatNumber(todayKpis.link_clicks) : '—', color: '#F1F5F9' },
                  { label: 'ATC', value: todayKpis.add_to_cart > 0 ? String(todayKpis.add_to_cart) : '—', color: '#F1F5F9' },
                  { label: 'Costo/ATC', value: todayKpis.cost_per_atc ? formatCurrency(todayKpis.cost_per_atc, currency) : '—', color: '#F1F5F9' },
                  { label: 'Tráfico efectivo', value: todayKpis.link_clicks > 0 ? `${(todayKpis.landing_page_views / todayKpis.link_clicks * 100).toFixed(2)}%` : '—', color: '#F1F5F9' },
                  { label: 'Frecuencia', value: todayKpis.frequency ? todayKpis.frequency.toFixed(2) : '—', color: todayKpis.frequency && todayKpis.frequency > 3 ? '#F59E0B' : '#F1F5F9' },
                  { label: 'Hook Rate', value: todayKpis.hook_rate ? `${todayKpis.hook_rate.toFixed(1)}%` : '—', color: todayKpis.hook_rate ? (todayKpis.hook_rate >= 40 ? '#22C55E' : todayKpis.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#64748B' },
                  { label: 'Video avg', value: todayKpis.video_avg_time_watched ? `${todayKpis.video_avg_time_watched.toFixed(1)}s` : '—', color: '#F1F5F9' },
                ].map(kpi => (
                  <div key={kpi.label} style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>{kpi.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla día por día */}
          {(rangeM.data || []).length > 0 && (
            <div style={{ marginBottom: '24px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Histórico {days}d · día por día</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Fecha</th>
                      <th style={thStyle}>Gasto</th>
                      <th style={thStyle}>Resultados</th>
                      <th style={thStyle}>CPA</th>
                      <th style={thStyle}>ROAS</th>
                      <th style={thStyle}>CTR</th>
                      <th style={thStyle}>CPM</th>
                      <th style={thStyle}>CPC</th>
                      <th style={thStyle}>ATC</th>
                      <th style={thStyle}>Hook%</th>
                      <th style={thStyle}>Frec.</th>
                      <th style={thStyle}>Impres.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rangeM.data || []).map((m: any) => {
                      const mlc = m.link_clicks || m.clicks || 0
                      const mctr = m.impressions > 0 && mlc > 0 ? mlc / m.impressions * 100 : null
                      const mcpa = m.purchases > 0 ? m.spend / m.purchases : null
                      return (
                        <tr key={m.date}>
                          <td style={{ ...tdStyle, textAlign: 'left', color: '#F1F5F9', fontWeight: 500 }}>{formatDate(m.date)}</td>
                          <td style={{ ...tdStyle, color: '#F1F5F9' }}>{m.spend > 0 ? formatCurrency(m.spend, currency) : '—'}</td>
                          <td style={{ ...tdStyle, color: m.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: m.purchases > 0 ? 600 : 400 }}>{m.purchases || '—'}</td>
                          <td style={{ ...tdStyle, color: cpaColor(mcpa), fontWeight: 600 }}>{mcpa ? formatCurrency(mcpa, currency) : '—'}</td>
                          <td style={{ ...tdStyle, color: roasColor(m.roas) }}>{m.roas ? `${m.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ ...tdStyle, color: ctrColor(mctr) }}>{mctr ? `${mctr.toFixed(2)}%` : '—'}</td>
                          <td style={{ ...tdStyle, color: '#F1F5F9' }}>{m.cpm ? formatCurrency(m.cpm, currency) : '—'}</td>
                          <td style={{ ...tdStyle, color: '#F1F5F9' }}>{m.cpc ? formatCurrency(m.cpc, currency) : '—'}</td>
                          <td style={{ ...tdStyle, color: '#F1F5F9' }}>{m.add_to_cart || '—'}</td>
                          <td style={{ ...tdStyle, color: m.hook_rate ? (m.hook_rate >= 40 ? '#22C55E' : m.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#64748B' }}>{m.hook_rate ? `${m.hook_rate.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...tdStyle, color: m.frequency && m.frequency > 3 ? '#F59E0B' : '#F1F5F9' }}>{m.frequency ? m.frequency.toFixed(1) : '—'}</td>
                          <td style={{ ...tdStyle, color: '#64748B' }}>{m.impressions > 0 ? formatNumber(m.impressions) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ad Sets */}
          {adSetRows.length > 0 && (
            <div style={{ marginBottom: '24px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Ad Sets — {adSetRows.length}</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#22C55E20', color: '#22C55E', borderRadius: '4px' }}>CPA ≤${CPA_TARGET} 🟢</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#F59E0B20', color: '#F59E0B', borderRadius: '4px' }}>≤${CPA_BREAKEVEN} 🟡</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#EF444420', color: '#EF4444', borderRadius: '4px' }}>&gt;${CPA_BREAKEVEN} 🔴</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Ad Set</th>
                      <th style={thStyle}>Est.</th>
                      <th style={thStyle}>Ventas hoy</th>
                      <th style={thStyle}>CPA hoy</th>
                      <th style={thStyle}>ROAS hoy</th>
                      <th style={thStyle}>Gasto hoy</th>
                      <th style={thStyle}>CTR</th>
                      <th style={thStyle}>CPM</th>
                      <th style={thStyle}>CPC</th>
                      <th style={thStyle}>ATC</th>
                      <th style={thStyle}>Costo/ATC</th>
                      <th style={thStyle}>Hook%</th>
                      <th style={{ ...thStyle, borderLeft: '1px solid #2D3244' }}>Ventas {days}d</th>
                      <th style={thStyle}>CPA {days}d</th>
                      <th style={thStyle}>ROAS {days}d</th>
                      <th style={thStyle}>Gasto {days}d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adSetRows.map((as: any) => (
                      <tr key={as.id} style={{ opacity: as.status === 'ACTIVE' ? 1 : 0.55 }}>
                        <td style={{ ...tdStyle, textAlign: 'left', maxWidth: '180px' }}>
                          <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{as.name}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{statusEmoji(as.status)}</td>
                        <td style={{ ...tdStyle, color: as.today.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: as.today.purchases > 0 ? 600 : 400 }}>{as.today.purchases || '—'}</td>
                        <td style={{ ...tdStyle, color: cpaColor(as.today.cpa), fontWeight: 600 }}>{as.today.cpa ? formatCurrency(as.today.cpa, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: roasColor(as.today.roas) }}>{as.today.roas ? `${as.today.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.spend > 0 ? formatCurrency(as.today.spend, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: ctrColor(as.today.ctr) }}>{as.today.ctr ? `${as.today.ctr.toFixed(2)}%` : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.cpm ? formatCurrency(as.today.cpm, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.cpc ? formatCurrency(as.today.cpc, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.add_to_cart || '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.cost_per_atc ? formatCurrency(as.today.cost_per_atc, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: as.today.hook_rate ? (as.today.hook_rate >= 40 ? '#22C55E' : as.today.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#64748B' }}>{as.today.hook_rate ? `${as.today.hook_rate.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...tdStyle, borderLeft: '1px solid #2D3244', color: as.range?.purchases > 0 ? '#22C55E' : '#64748B' }}>{as.range?.purchases || '—'}</td>
                        <td style={{ ...tdStyle, color: cpaColor(as.range?.cpa), fontWeight: 600 }}>{as.range?.cpa ? formatCurrency(as.range.cpa, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: roasColor(as.range?.roas) }}>{as.range?.roas ? `${as.range.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.range?.spend > 0 ? formatCurrency(as.range.spend, currency) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alertas */}
          {(alerts.data || []).length > 0 && (
            <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Alertas recientes</span>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(alerts.data || []).map((a: any) => (
                  <div key={a.id} style={{ padding: '10px 14px', backgroundColor: '#0F1117', borderRadius: '8px', border: `1px solid ${a.severity === 'critical' ? '#EF444440' : a.severity === 'warning' ? '#F59E0B40' : '#6366F140'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#F1F5F9', lineHeight: 1.5 }}>{a.message}</div>
                      <div style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>{formatDate(a.created_at?.split('T')[0] || '')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
