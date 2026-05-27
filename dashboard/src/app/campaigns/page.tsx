import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { Suspense } from 'react'
import { formatCurrency, formatNumber, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, cpmColor, cpcColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await headers()
  const sp = await searchParams
  const today = await getLatestDate()
  const { rangeStart, rangeEnd, days, label } = resolveDateRange(sp, today, 1)
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]

  const [campaigns, todayM, yesterdayM, rangeM, accountRes] = await Promise.all([
    supabaseAdmin.from('campaigns').select('*'),
    supabaseAdmin.from('metrics').select('object_id,spend').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('object_id,roas').eq('object_type', 'campaign').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', rangeStart).lte('date', rangeEnd),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  // todaySpend: para ordenar siempre por gasto de HOY, sin importar el período
  const todaySpend = new Map((todayM.data || []).map((m: any) => [m.object_id, m.spend || 0]))
  const yesterdayMap = new Map((yesterdayM.data || []).map((m: any) => [m.object_id, m]))

  // Agregar TODOS los campos del período seleccionado
  const ZERO = { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0, freq_w: 0, hook_w: 0, video_w: 0 }
  const rangeAgg = new Map<string, any>()
  for (const m of rangeM.data || []) {
    const e = rangeAgg.get(m.object_id) || { ...ZERO }
    const imp = m.impressions || 0
    rangeAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + imp,
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach: e.reach + (m.reach || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      freq_w: e.freq_w + (m.frequency || 0) * imp,
      hook_w: e.hook_w + (m.hook_rate || 0) * imp,
      video_w: e.video_w + (m.video_avg_time_watched || 0) * imp,
    })
  }

  function deriveRaw(raw: any) {
    if (!raw) return null
    const lc = raw.link_clicks || 0
    return {
      impressions: raw.impressions || 0,
      spend: raw.spend || 0,
      purchases: raw.purchases || 0,
      purchase_value: raw.purchase_value || 0,
      unique_link_clicks: raw.unique_link_clicks || 0,
      landing_page_views: raw.landing_page_views || 0,
      add_to_cart: raw.add_to_cart || 0,
      checkout_initiated: raw.checkout_initiated || 0,
      cpm: raw.impressions > 0 ? raw.spend / raw.impressions * 1000 : null,
      ctr: raw.reach > 0 && raw.unique_link_clicks > 0 ? raw.unique_link_clicks / raw.reach * 100 : null,
      cpc: lc > 0 ? raw.spend / lc : null,
      cost_per_atc: raw.add_to_cart > 0 ? raw.spend / raw.add_to_cart : null,
      cpa: raw.purchases > 0 ? raw.spend / raw.purchases : null,
      roas: raw.spend > 0 ? raw.purchase_value / raw.spend : null,
      traf_ef: lc > 0 && raw.landing_page_views > 0 ? raw.landing_page_views / lc * 100 : null,
      conv_web: raw.landing_page_views > 0 && raw.purchases > 0 ? raw.purchases / raw.landing_page_views * 100 : null,
      frequency: raw.impressions > 0 ? raw.freq_w / raw.impressions : null,
      hook_rate: raw.impressions > 0 ? raw.hook_w / raw.impressions : null,
      video_avg: raw.impressions > 0 ? raw.video_w / raw.impressions : null,
    }
  }

  const ZEROS = { impressions: 0, spend: 0, purchases: 0, purchase_value: 0, unique_link_clicks: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0, cpm: null, ctr: null, cpc: null, cost_per_atc: null, cpa: null, roas: null, traf_ef: null, conv_web: null, frequency: null, hook_rate: null, video_avg: null }

  const rows = (campaigns.data || []).map((c: any) => {
    const ym = yesterdayMap.get(c.id) as any
    const t = deriveRaw(rangeAgg.get(c.id)) || ZEROS
    const budget = c.daily_budget ? formatCurrency(c.daily_budget / 100, currency) : '—'
    return {
      ...c, t, budget,
      trend: (t.roas ?? 0) > (ym?.roas ?? 0) ? '▲' : (t.roas ?? 0) < (ym?.roas ?? 0) ? '▼' : '—',
    }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    // Orden por gasto de HOY (estable, no cambia con el período)
    return (todaySpend.get(b.id) ?? 0) - (todaySpend.get(a.id) ?? 0)
  })

  const th: any = { padding: '7px 8px', textAlign: 'right' as const, color: '#64748B', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#151820' }
  const td: any = { padding: '7px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }
  const sep: any = { ...td, borderLeft: '1px solid #2D3244' }
  const thSep: any = { ...th, borderLeft: '1px solid #2D3244' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Campañas" subtitle={`${rows.length} campañas · ordenadas por rendimiento`} />
        <main style={{ padding: '20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <Suspense fallback={null}><RangeSelector /></Suspense>
          </div>
          <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366F1' }}>{label}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#22C55E20', color: '#22C55E', borderRadius: '4px' }}>CPA ≤${CPA_TARGET} 🟢</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#F59E0B20', color: '#F59E0B', borderRadius: '4px' }}>≤${CPA_BREAKEVEN} 🟡</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#EF444420', color: '#EF4444', borderRadius: '4px' }}>&gt;${CPA_BREAKEVEN} 🔴</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '2200px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' as const, minWidth: '180px', position: 'sticky', left: 0 }}>Campaña</th>
                    <th style={{ ...th, width: '36px' }}>Est.</th>
                    <th style={th}>Impresiones</th>
                    <th style={th}>CPM</th>
                    <th style={th}>CTR único</th>
                    <th style={th}>CPC</th>
                    <th style={th}>Clics únicos</th>
                    <th style={th}>Visitas LP</th>
                    <th style={th}>ATC</th>
                    <th style={th}>Costo/ATC</th>
                    <th style={th}>Pagos inic.</th>
                    <th style={th}>Resultados</th>
                    <th style={th}>CPA</th>
                    <th style={th}>Importe gastado</th>
                    <th style={th}>Presupuesto</th>
                    <th style={th}>Valor resultados</th>
                    <th style={th}>ROAS</th>
                    <th style={th}>Tráf. ef.</th>
                    <th style={th}>Conv. WEB</th>
                    <th style={th}>Frecuencia</th>
                    <th style={th}>Hook Rate</th>
                    <th style={th}>Video avg</th>
                    <th style={th}>Tend.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => (
                    <tr key={c.id} style={{ opacity: c.status === 'ACTIVE' ? 1 : 0.5 }}>
                      <td style={{ ...td, textAlign: 'left' as const, minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                        <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {c.name || c.id}
                        </Link>
                      </td>
                      <td style={{ ...td, textAlign: 'center' as const }}>{statusEmoji(c.status)}</td>
                      <td style={{ ...td, color: '#94A3B8' }}>{c.t.impressions > 0 ? new Intl.NumberFormat('es-AR').format(c.t.impressions) : '—'}</td>
                      <td style={{ ...td, color: cpmColor(c.t.cpm) }}>{c.t.cpm ? formatCurrency(c.t.cpm, currency) : '—'}</td>
                      <td style={{ ...td, color: ctrColor(c.t.ctr) }}>{c.t.ctr ? `${c.t.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ ...td, color: cpcColor(c.t.cpc) }}>{c.t.cpc ? formatCurrency(c.t.cpc, currency) : '—'}</td>
                      <td style={{ ...td, color: '#94A3B8' }}>{c.t.unique_link_clicks > 0 ? formatNumber(c.t.unique_link_clicks) : '—'}</td>
                      <td style={{ ...td, color: '#94A3B8' }}>{c.t.landing_page_views > 0 ? formatNumber(c.t.landing_page_views) : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.add_to_cart || '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.cost_per_atc ? formatCurrency(c.t.cost_per_atc, currency) : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.checkout_initiated || '—'}</td>
                      <td style={{ ...td, color: c.t.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{c.t.purchases || '—'}</td>
                      <td style={{ ...td, color: cpaColor(c.t.cpa), fontWeight: 600 }}>{c.t.cpa ? formatCurrency(c.t.cpa, currency) : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.spend > 0 ? formatCurrency(c.t.spend, currency) : '—'}</td>
                      <td style={{ ...td, color: '#64748B' }}>{c.budget}</td>
                      <td style={{ ...td, color: '#94A3B8' }}>{c.t.purchase_value > 0 ? formatCurrency(c.t.purchase_value, currency) : '—'}</td>
                      <td style={{ ...td, color: roasColor(c.t.roas) }}>{c.t.roas ? `${c.t.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.traf_ef ? `${c.t.traf_ef.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...td, color: c.t.conv_web ? '#22C55E' : '#64748B' }}>{c.t.conv_web ? `${c.t.conv_web.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...td, color: c.t.frequency && c.t.frequency > 3 ? '#F59E0B' : '#94A3B8' }}>{c.t.frequency ? c.t.frequency.toFixed(1) : '—'}</td>
                      <td style={{ ...td, color: c.t.hook_rate ? (c.t.hook_rate >= 30 ? '#22C55E' : c.t.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#64748B' }}>{c.t.hook_rate ? `${c.t.hook_rate.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...td, color: '#64748B' }}>{c.t.video_avg ? `${c.t.video_avg.toFixed(0)}s` : '—'}</td>
                      <td style={{ ...td, color: c.trend === '▲' ? '#22C55E' : c.trend === '▼' ? '#EF4444' : '#64748B' }}>{c.trend}</td>
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
