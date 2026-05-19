import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatNumber, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await headers()
  const sp = await searchParams
  const days = Math.min(90, Math.max(1, Number(sp?.days || 7)))

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]
  const rangeStart = new Date(todayMs - days * 86400000).toISOString().split('T')[0]

  const [campaigns, todayM, yesterdayM, rangeM, accountRes] = await Promise.all([
    supabaseAdmin.from('campaigns').select('*'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', rangeStart),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const todayMap = new Map((todayM.data || []).map((m: any) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayM.data || []).map((m: any) => [m.object_id, m]))

  const rangeAgg = new Map<string, any>()
  for (const m of rangeM.data || []) {
    const e = rangeAgg.get(m.object_id) || {
      spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
      link_clicks: 0, unique_link_clicks: 0, reach: 0, clicks: 0,
      add_to_cart: 0, landing_page_views: 0, checkout_initiated: 0,
    }
    rangeAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach: e.reach + (m.reach || 0),
      clicks: e.clicks + (m.clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
    })
  }

  const rows = (campaigns.data || []).map((c: any) => {
    const tm = todayMap.get(c.id) as any
    const ym = yesterdayMap.get(c.id) as any
    const rm = rangeAgg.get(c.id) as any

    const t = {
      spend: tm?.spend ?? 0,
      impressions: tm?.impressions ?? 0,
      cpm: tm?.cpm ?? null,
      ctr: tm?.ctr ?? null,
      cpc: tm?.cpc ?? null,
      unique_link_clicks: tm?.unique_link_clicks ?? 0,
      link_clicks: tm?.link_clicks ?? 0,
      landing_page_views: tm?.landing_page_views ?? 0,
      add_to_cart: tm?.add_to_cart ?? 0,
      cost_per_atc: tm?.add_to_cart > 0 ? (tm?.spend || 0) / tm.add_to_cart : null,
      checkout_initiated: tm?.checkout_initiated ?? 0,
      hook_rate: tm?.hook_rate ?? null,
      purchases: tm?.purchases ?? 0,
      purchase_value: tm?.purchase_value ?? 0,
      cpa: tm?.purchases > 0 ? tm.spend / tm.purchases : null,
      roas: tm?.roas ?? null,
      frequency: tm?.frequency ?? null,
      video_avg_time_watched: tm?.video_avg_time_watched ?? null,
    }

    const r = rm ? {
      spend: rm.spend,
      purchases: rm.purchases,
      purchase_value: rm.purchase_value,
      roas: rm.spend > 0 ? rm.purchase_value / rm.spend : null,
      cpa: rm.purchases > 0 ? rm.spend / rm.purchases : null,
      add_to_cart: rm.add_to_cart,
      checkout_initiated: rm.checkout_initiated,
      landing_page_views: rm.landing_page_views,
    } : null

    return {
      ...c,
      t, r,
      trend: (tm?.roas ?? 0) > (ym?.roas ?? 0) ? '▲' : (tm?.roas ?? 0) < (ym?.roas ?? 0) ? '▼' : '—',
    }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    return b.t.spend - a.t.spend
  })

  const th: any = { padding: '7px 8px', textAlign: 'right' as const, color: '#64748B', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em' }
  const td: any = { padding: '8px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }
  const sep: any = { ...td, borderLeft: '1px solid #2D3244' }
  const thSep: any = { ...th, borderLeft: '1px solid #2D3244' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Campañas" subtitle={`${rows.length} campañas · ordenadas por rendimiento`} />
        <main style={{ padding: '20px 16px', maxWidth: '100%' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <RangeSelector />
          </div>

          <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Hoy</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#22C55E20', color: '#22C55E', borderRadius: '4px' }}>CPA ≤${CPA_TARGET} 🟢</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#F59E0B20', color: '#F59E0B', borderRadius: '4px' }}>≤${CPA_BREAKEVEN} 🟡</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#EF444420', color: '#EF4444', borderRadius: '4px' }}>&gt;${CPA_BREAKEVEN} 🔴</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748B' }}>· acumulado {days}d →</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#151820' }}>
                    <th style={{ ...th, textAlign: 'left', width: '200px', maxWidth: '200px' }}>Campaña</th>
                    {/* === ORDEN ECOM === */}
                    <th style={{ ...th, width: '36px' }}>Est.</th>
                    <th style={th}>Impresiones</th>
                    <th style={th}>CPM</th>
                    <th style={th}>CTR único</th>
                    <th style={th}>CPC</th>
                    <th style={th}>Clics únicos</th>
                    <th style={th}>Visitas LP</th>
                    <th style={th}>Tráf. ef.</th>
                    <th style={th}>ATC</th>
                    <th style={th}>Costo/ATC</th>
                    <th style={th}>Pagos inic.</th>
                    <th style={th}>Hook%</th>
                    <th style={th}>Resultados</th>
                    <th style={th}>CPA</th>
                    <th style={th}>Gasto</th>
                    <th style={th}>Presupuesto</th>
                    <th style={th}>ROAS</th>
                    <th style={th}>Val. conv. prom.</th>
                    <th style={th}>Conv. WEB</th>
                    <th style={th}>Frecuencia</th>
                    <th style={th}>Video avg</th>
                    {/* === ACUMULADO === */}
                    <th style={thSep}>Vtas {days}d</th>
                    <th style={th}>CPA {days}d</th>
                    <th style={th}>ROAS {days}d</th>
                    <th style={th}>Gasto {days}d</th>
                    <th style={th}>Tend.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => {
                    const trafEf = c.t.link_clicks > 0 && c.t.landing_page_views > 0
                      ? c.t.landing_page_views / c.t.link_clicks * 100 : null
                    const convWeb = c.t.landing_page_views > 0 && c.t.purchases > 0
                      ? c.t.purchases / c.t.landing_page_views * 100 : null
                    const aov = c.t.purchases > 0 ? c.t.purchase_value / c.t.purchases : null
                    const budget = c.daily_budget ? formatCurrency(c.daily_budget / 100, currency) : '—'
                    return (
                      <tr key={c.id} style={{ opacity: c.status === 'ACTIVE' ? 1 : 0.5 }}>
                        <td style={{ ...td, textAlign: 'left', width: '200px', maxWidth: '200px' }}>
                          <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name}
                          </Link>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{statusEmoji(c.status)}</td>
                        <td style={{ ...td, color: '#94A3B8' }}>{c.t.impressions > 0 ? new Intl.NumberFormat('es-AR').format(c.t.impressions) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.t.cpm ? formatCurrency(c.t.cpm, currency) : '—'}</td>
                        <td style={{ ...td, color: ctrColor(c.t.ctr) }}>{c.t.ctr ? `${c.t.ctr.toFixed(2)}%` : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.t.cpc ? formatCurrency(c.t.cpc, currency) : '—'}</td>
                        <td style={{ ...td, color: '#94A3B8' }}>{c.t.unique_link_clicks > 0 ? formatNumber(c.t.unique_link_clicks) : '—'}</td>
                        <td style={{ ...td, color: '#94A3B8' }}>{c.t.landing_page_views > 0 ? formatNumber(c.t.landing_page_views) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{trafEf ? `${trafEf.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.t.add_to_cart || '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.t.cost_per_atc ? formatCurrency(c.t.cost_per_atc, currency) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.t.checkout_initiated || '—'}</td>
                        <td style={{ ...td, color: c.t.hook_rate ? (c.t.hook_rate >= 40 ? '#22C55E' : c.t.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#64748B' }}>{c.t.hook_rate ? `${c.t.hook_rate.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...td, color: c.t.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{c.t.purchases || '—'}</td>
                        <td style={{ ...td, color: cpaColor(c.t.cpa), fontWeight: 600 }}>{c.t.cpa ? formatCurrency(c.t.cpa, currency) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.t.spend > 0 ? formatCurrency(c.t.spend, currency) : '—'}</td>
                        <td style={{ ...td, color: '#64748B' }}>{budget}</td>
                        <td style={{ ...td, color: roasColor(c.t.roas) }}>{c.t.roas ? `${c.t.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: '#94A3B8' }}>{aov ? formatCurrency(aov, currency) : '—'}</td>
                        <td style={{ ...td, color: convWeb ? '#22C55E' : '#64748B' }}>{convWeb ? `${convWeb.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...td, color: c.t.frequency && c.t.frequency > 3 ? '#F59E0B' : '#94A3B8' }}>{c.t.frequency ? c.t.frequency.toFixed(1) : '—'}</td>
                        <td style={{ ...td, color: '#64748B' }}>{c.t.video_avg_time_watched ? `${c.t.video_avg_time_watched.toFixed(0)}s` : '—'}</td>
                        {/* ACUMULADO */}
                        <td style={{ ...sep, color: c.r?.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{c.r?.purchases || '—'}</td>
                        <td style={{ ...td, color: cpaColor(c.r?.cpa), fontWeight: 600 }}>{c.r?.cpa ? formatCurrency(c.r.cpa, currency) : '—'}</td>
                        <td style={{ ...td, color: roasColor(c.r?.roas) }}>{c.r?.roas ? `${c.r.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{c.r?.spend > 0 ? formatCurrency(c.r.spend, currency) : '—'}</td>
                        <td style={{ ...td, color: c.trend === '▲' ? '#22C55E' : c.trend === '▼' ? '#EF4444' : '#64748B' }}>{c.trend}</td>
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
