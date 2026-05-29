import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { Suspense } from 'react'
import { formatCurrency, formatNumber, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, cpmColor, cpcColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'
import BudgetControl from '@/components/shared/BudgetControl'
import StatusToggle from '@/components/shared/StatusToggle'
import SortableHeader from '@/components/shared/SortableHeader'

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; sort?: string; dir?: string }> }) {
  await headers()
  const sp    = await searchParams
  const sortCol = sp.sort || ''
  const sortDir = sp.dir  || 'desc'
  const today = await getLatestDate()
  const { rangeStart, rangeEnd, days, label } = resolveDateRange(sp, today, 7)
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]

  const [campaigns, yesterdayM, rangeM, accountRes] = await Promise.all([
    supabaseAdmin.from('campaigns').select('*'),
    supabaseAdmin.from('metrics').select('object_id,roas').eq('object_type', 'campaign').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', rangeStart).lte('date', rangeEnd),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
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

  const totalRaw = { ...ZERO }
  for (const v of rangeAgg.values()) {
    totalRaw.spend += v.spend; totalRaw.purchases += v.purchases; totalRaw.purchase_value += v.purchase_value
    totalRaw.impressions += v.impressions; totalRaw.link_clicks += v.link_clicks; totalRaw.unique_link_clicks += v.unique_link_clicks
    totalRaw.reach += v.reach; totalRaw.landing_page_views += v.landing_page_views; totalRaw.add_to_cart += v.add_to_cart
    totalRaw.checkout_initiated += v.checkout_initiated; totalRaw.freq_w += v.freq_w; totalRaw.hook_w += v.hook_w; totalRaw.video_w += v.video_w
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
    // Always active before paused
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    // Column sort within each group
    if (sortCol) {
      const aVal = a.t[sortCol] ?? (sortCol === 'daily_budget' ? (a.daily_budget ?? 0) : 0)
      const bVal = b.t[sortCol] ?? (sortCol === 'daily_budget' ? (b.daily_budget ?? 0) : 0)
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    }
    return b.t.spend - a.t.spend
  })

  const totals = deriveRaw(totalRaw) || ZEROS

  const th: any = { padding: '7px 8px', textAlign: 'right' as const, color: '#7A90AA', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #1A4080', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#151820' }
  const td: any = { padding: '7px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }
  const tf: any = { padding: '8px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '2px solid #6366F1', fontWeight: 700, backgroundColor: '#030810', color: '#F1F5F9', whiteSpace: 'nowrap' as const }
  const sep: any = { ...td, borderLeft: '1px solid #1A4080' }
  const thSep: any = { ...th, borderLeft: '1px solid #1A4080' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Campañas" subtitle={`${rows.length} campañas · ordenadas por rendimiento`} />
        <main style={{ padding: '20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <Suspense fallback={null}><RangeSelector /></Suspense>
          </div>
          <div style={{ backgroundColor: '#071428', border: '1px solid #1A4080', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #1A4080', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366F1' }}>{label}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#22C55E20', color: '#22C55E', borderRadius: '4px' }}>CPA ≤${CPA_TARGET} 🟢</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#F59E0B20', color: '#F59E0B', borderRadius: '4px' }}>≤${CPA_BREAKEVEN} 🟡</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#EF444420', color: '#EF4444', borderRadius: '4px' }}>&gt;${CPA_BREAKEVEN} 🔴</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '2200px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: '64px', position: 'sticky', left: 0, zIndex: 2, textAlign: 'center' as const }}>Estado</th>
                    <th style={{ ...th, textAlign: 'left' as const, minWidth: '180px', position: 'sticky', left: '64px', zIndex: 2 }}>Campaña</th>
                    <SortableHeader col="impressions"      label="Impresiones"  currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="cpm"              label="CPM"          currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="ctr"              label="CTR único"    currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="cpc"              label="CPC"          currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="unique_link_clicks" label="Clics únicos" currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="landing_page_views" label="Visitas LP"  currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="add_to_cart"      label="ATC"          currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="cost_per_atc"     label="Costo/ATC"    currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="checkout_initiated" label="Pagos inic." currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="purchases"        label="Resultados"   currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="cpa"              label="CPA"          currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="spend"            label="Gasto"        currentSort={sortCol} currentDir={sortDir} style={th} />
                    <th style={th}>Presupuesto</th>
                    <SortableHeader col="purchase_value"   label="Valor result." currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="roas"             label="ROAS"         currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="traf_ef"          label="Tráf. ef."    currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="conv_web"         label="Conv. WEB"    currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="frequency"        label="Frecuencia"   currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="hook_rate"        label="Hook Rate"    currentSort={sortCol} currentDir={sortDir} style={th} />
                    <SortableHeader col="video_avg"        label="Video avg"    currentSort={sortCol} currentDir={sortDir} style={th} />
                    <th style={th}>Tend.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...tf, position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#030810', width: '64px' }}>—</td>
                    <td style={{ ...tf, textAlign: 'left' as const, minWidth: '180px', position: 'sticky', left: '64px', zIndex: 2, backgroundColor: '#030810' }}>
                      <span style={{ color: '#6366F1', fontWeight: 700, fontSize: '11px' }}>Total / Promedio</span>
                    </td>
                    <td style={{ ...tf, color: '#A8BCD0' }}>{totals.impressions > 0 ? new Intl.NumberFormat('es-AR').format(totals.impressions) : '—'}</td>
                    <td style={{ ...tf, color: cpmColor(totals.cpm) }}>{totals.cpm ? formatCurrency(totals.cpm, currency) : '—'}</td>
                    <td style={{ ...tf, color: ctrColor(totals.ctr) }}>{totals.ctr ? `${totals.ctr.toFixed(2)}%` : '—'}</td>
                    <td style={{ ...tf, color: '#F1F5F9' }}>{totals.cpc ? formatCurrency(totals.cpc, currency) : '—'}</td>
                    <td style={{ ...tf, color: '#A8BCD0' }}>{totals.unique_link_clicks > 0 ? formatNumber(totals.unique_link_clicks) : '—'}</td>
                    <td style={{ ...tf, color: '#A8BCD0' }}>{totals.landing_page_views > 0 ? formatNumber(totals.landing_page_views) : '—'}</td>
                    <td style={tf}>{totals.add_to_cart || '—'}</td>
                    <td style={tf}>{totals.cost_per_atc ? formatCurrency(totals.cost_per_atc, currency) : '—'}</td>
                    <td style={tf}>{totals.checkout_initiated || '—'}</td>
                    <td style={{ ...tf, color: totals.purchases > 0 ? '#22C55E' : '#7A90AA' }}>{totals.purchases || '—'}</td>
                    <td style={{ ...tf, color: cpaColor(totals.cpa) }}>{totals.cpa ? formatCurrency(totals.cpa, currency) : '—'}</td>
                    <td style={{ ...tf, color: '#6366F1' }}>{totals.spend > 0 ? formatCurrency(totals.spend, currency) : '—'}</td>
                    <td style={tf}>—</td>
                    <td style={{ ...tf, color: '#6366F1' }}>{totals.purchase_value > 0 ? formatCurrency(totals.purchase_value, currency) : '—'}</td>
                    <td style={{ ...tf, color: roasColor(totals.roas) }}>{totals.roas ? `${totals.roas.toFixed(2)}x` : '—'}</td>
                    <td style={tf}>{totals.traf_ef ? `${totals.traf_ef.toFixed(1)}%` : '—'}</td>
                    <td style={{ ...tf, color: totals.conv_web ? '#22C55E' : '#7A90AA' }}>{totals.conv_web ? `${totals.conv_web.toFixed(1)}%` : '—'}</td>
                    <td style={tf}>{totals.frequency ? totals.frequency.toFixed(1) : '—'}</td>
                    <td style={tf}>{totals.hook_rate ? `${totals.hook_rate.toFixed(1)}%` : '—'}</td>
                    <td style={tf}>{totals.video_avg ? `${totals.video_avg.toFixed(0)}s` : '—'}</td>
                    <td style={tf}>—</td>
                  </tr>
                  {rows.map((c: any, idx: number) => {
                    const active  = c.status === 'ACTIVE'
                    const rowBg   = active ? '#071428' : '#050810'
                    const showSep = idx > 0 && !active && rows[idx - 1].status === 'ACTIVE'
                    const COLS    = 23  // total column count
                    return (
                    <>
                    {showSep && (
                      <tr key={`sep-${c.id}`}>
                        <td colSpan={COLS} style={{ padding: '0', borderBottom: '2px solid #1A4080', background: 'linear-gradient(90deg, #EF444415, transparent)' }}>
                          <div style={{ padding: '3px 12px', fontSize: '10px', color: '#EF444480', fontWeight: 700, letterSpacing: '0.1em' }}>PAUSADAS</div>
                        </td>
                      </tr>
                    )}
                    <tr key={c.id} style={{ opacity: active ? 1 : 0.55, borderLeft: active ? '3px solid #22C55E' : '3px solid #EF444460' }}>
                      <td style={{ ...td, position: 'sticky', left: 0, zIndex: 1, backgroundColor: rowBg, textAlign: 'center' as const, width: '64px' }}>
                        <StatusToggle objectId={c.id} objectType="campaign" initialStatus={c.status} />
                      </td>
                      <td style={{ ...td, textAlign: 'left' as const, minWidth: '180px', position: 'sticky', left: '64px', zIndex: 1, backgroundColor: rowBg }}>
                        <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {c.name || c.id}
                        </Link>
                      </td>
                      <td style={{ ...td, color: '#A8BCD0' }}>{c.t.impressions > 0 ? new Intl.NumberFormat('es-AR').format(c.t.impressions) : '—'}</td>
                      <td style={{ ...td, color: cpmColor(c.t.cpm) }}>{c.t.cpm ? formatCurrency(c.t.cpm, currency) : '—'}</td>
                      <td style={{ ...td, color: ctrColor(c.t.ctr) }}>{c.t.ctr ? `${c.t.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ ...td, color: cpcColor(c.t.cpc) }}>{c.t.cpc ? formatCurrency(c.t.cpc, currency) : '—'}</td>
                      <td style={{ ...td, color: '#A8BCD0' }}>{c.t.unique_link_clicks > 0 ? formatNumber(c.t.unique_link_clicks) : '—'}</td>
                      <td style={{ ...td, color: '#A8BCD0' }}>{c.t.landing_page_views > 0 ? formatNumber(c.t.landing_page_views) : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.add_to_cart || '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.cost_per_atc ? formatCurrency(c.t.cost_per_atc, currency) : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.checkout_initiated || '—'}</td>
                      <td style={{ ...td, color: c.t.purchases > 0 ? '#22C55E' : '#7A90AA', fontWeight: 600 }}>{c.t.purchases || '—'}</td>
                      <td style={{ ...td, color: cpaColor(c.t.cpa), fontWeight: 600 }}>{c.t.cpa ? formatCurrency(c.t.cpa, currency) : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.spend > 0 ? formatCurrency(c.t.spend, currency) : '—'}</td>
                      <td style={td}>
                        <BudgetControl
                          objectId={c.id}
                          objectType="campaign"
                          budgetCents={c.daily_budget ?? null}
                          currency={currency}
                          isActive={c.status === 'ACTIVE'}
                        />
                      </td>
                      <td style={{ ...td, color: '#A8BCD0' }}>{c.t.purchase_value > 0 ? formatCurrency(c.t.purchase_value, currency) : '—'}</td>
                      <td style={{ ...td, color: roasColor(c.t.roas) }}>{c.t.roas ? `${c.t.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...td, color: '#F1F5F9' }}>{c.t.traf_ef ? `${c.t.traf_ef.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...td, color: c.t.conv_web ? '#22C55E' : '#7A90AA' }}>{c.t.conv_web ? `${c.t.conv_web.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...td, color: c.t.frequency && c.t.frequency > 3 ? '#F59E0B' : '#A8BCD0' }}>{c.t.frequency ? c.t.frequency.toFixed(1) : '—'}</td>
                      <td style={{ ...td, color: c.t.hook_rate ? (c.t.hook_rate >= 30 ? '#22C55E' : c.t.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#7A90AA' }}>{c.t.hook_rate ? `${c.t.hook_rate.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...td, color: '#7A90AA' }}>{c.t.video_avg ? `${c.t.video_avg.toFixed(0)}s` : '—'}</td>
                      <td style={{ ...td, color: c.trend === '▲' ? '#22C55E' : c.trend === '▼' ? '#EF4444' : '#7A90AA' }}>{c.trend}</td>
                    </tr>
                    </>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
