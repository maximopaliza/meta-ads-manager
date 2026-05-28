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

  const asToday = new Map((adSetTodayM.data || []).map((m: any) => [m.object_id, m]))

  const asRangeAgg = new Map<string, any>()
  for (const m of adSetRangeM.data || []) {
    const e = asRangeAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0 }
    asRangeAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
    })
  }

  const adSetRows = (adSetsRes.data || []).map((as: any) => {
    const atm = asToday.get(as.id) as any
    const arm = asRangeAgg.get(as.id) as any
    const lc = atm?.link_clicks || 0
    const t = {
      impressions: atm?.impressions ?? 0,
      cpm: atm?.cpm ?? null,
      ctr: atm?.ctr ?? null,
      cpc: atm?.cpc ?? null,
      unique_link_clicks: atm?.unique_link_clicks ?? 0,
      landing_page_views: atm?.landing_page_views ?? 0,
      add_to_cart: atm?.add_to_cart ?? 0,
      cost_per_atc: atm?.add_to_cart > 0 ? (atm?.spend || 0) / atm.add_to_cart : null,
      checkout_initiated: atm?.checkout_initiated ?? 0,
      purchases: atm?.purchases ?? 0,
      purchase_value: atm?.purchase_value ?? 0,
      cpa: atm?.purchases > 0 ? atm.spend / atm.purchases : null,
      spend: atm?.spend ?? 0,
      roas: atm?.roas ?? null,
      traf_ef: lc > 0 && (atm?.landing_page_views ?? 0) > 0 ? atm.landing_page_views / lc * 100 : null,
      conv_web: (atm?.landing_page_views ?? 0) > 0 && (atm?.purchases ?? 0) > 0 ? atm.purchases / atm.landing_page_views * 100 : null,
      frequency: atm?.frequency ?? null,
      hook_rate: atm?.hook_rate ?? null,
      video_avg: atm?.video_avg_time_watched ?? null,
    }
    const r = arm ? {
      purchases: arm.purchases,
      cpa: arm.purchases > 0 ? arm.spend / arm.purchases : null,
      roas: arm.spend > 0 ? arm.purchase_value / arm.spend : null,
      spend: arm.spend,
    } : null
    const budget = as.daily_budget ? formatCurrency(as.daily_budget / 100, currency) : '—'
    return { ...as, t, r, budget }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    return b.t.spend - a.t.spend
  })

  const lc = tm?.link_clicks || 0
  const todayKpis = tm ? {
    spend: tm.spend ?? 0,
    purchases: tm.purchases ?? 0,
    purchase_value: tm.purchase_value ?? 0,
    roas: tm.roas ?? null,
    cpa: tm.purchases > 0 ? tm.spend / tm.purchases : null,
    ctr: tm.ctr ?? null,
    cpm: tm.cpm ?? null,
    cpc: tm.cpc ?? null,
    unique_link_clicks: tm.unique_link_clicks ?? 0,
    landing_page_views: tm.landing_page_views ?? 0,
    add_to_cart: tm.add_to_cart ?? 0,
    cost_per_atc: tm.add_to_cart > 0 ? tm.spend / tm.add_to_cart : null,
    checkout_initiated: tm.checkout_initiated ?? 0,
    impressions: tm.impressions ?? 0,
    frequency: tm.frequency ?? null,
    hook_rate: tm.hook_rate ?? null,
    video_avg: tm.video_avg_time_watched ?? null,
    traf_ef: lc > 0 && (tm.landing_page_views ?? 0) > 0 ? tm.landing_page_views / lc * 100 : null,
    conv_web: (tm.landing_page_views ?? 0) > 0 && (tm.purchases ?? 0) > 0 ? tm.purchases / tm.landing_page_views * 100 : null,
  } : null

  const th: any = { padding: '7px 8px', textAlign: 'right' as const, color: '#7A90AA', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #1A3050', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#151820' }
  const td: any = { padding: '7px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }
  const sep: any = { ...td, borderLeft: '1px solid #1A3050' }
  const thSep: any = { ...th, borderLeft: '1px solid #1A3050' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header
          title={campaign.name}
          subtitle={`${statusEmoji(campaign.status)} ${campaign.status} · ${campaign.objective || 'Sin objetivo'}`}
        />
        <main style={{ padding: '20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <RangeSelector />
          </div>

          {/* KPIs hoy */}
          {todayKpis && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: '#7A90AA', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoy — {today}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {[
                  { label: 'Resultados', value: todayKpis.purchases > 0 ? String(todayKpis.purchases) : '—', color: todayKpis.purchases > 0 ? '#22C55E' : '#7A90AA' },
                  { label: 'CPA', value: todayKpis.cpa ? formatCurrency(todayKpis.cpa, currency) : '—', color: cpaColor(todayKpis.cpa) },
                  { label: 'Importe gastado', value: todayKpis.spend > 0 ? formatCurrency(todayKpis.spend, currency) : '—', color: '#F1F5F9' },
                  { label: 'Valor resultados', value: todayKpis.purchase_value > 0 ? formatCurrency(todayKpis.purchase_value, currency) : '—', color: '#A8BCD0' },
                  { label: 'ROAS', value: todayKpis.roas ? `${todayKpis.roas.toFixed(2)}x` : '—', color: roasColor(todayKpis.roas) },
                  { label: 'ATC', value: todayKpis.add_to_cart > 0 ? String(todayKpis.add_to_cart) : '—', color: '#F1F5F9' },
                  { label: 'Costo/ATC', value: todayKpis.cost_per_atc ? formatCurrency(todayKpis.cost_per_atc, currency) : '—', color: '#F1F5F9' },
                  { label: 'Pagos inic.', value: todayKpis.checkout_initiated > 0 ? String(todayKpis.checkout_initiated) : '—', color: '#F1F5F9' },
                  { label: 'CTR único', value: todayKpis.ctr ? `${todayKpis.ctr.toFixed(2)}%` : '—', color: ctrColor(todayKpis.ctr) },
                  { label: 'CPM', value: todayKpis.cpm ? formatCurrency(todayKpis.cpm, currency) : '—', color: '#F1F5F9' },
                  { label: 'Tráf. ef.', value: todayKpis.traf_ef ? `${todayKpis.traf_ef.toFixed(1)}%` : '—', color: '#F1F5F9' },
                  { label: 'Conv. WEB', value: todayKpis.conv_web ? `${todayKpis.conv_web.toFixed(1)}%` : '—', color: todayKpis.conv_web ? '#22C55E' : '#7A90AA' },
                  { label: 'Hook Rate', value: todayKpis.hook_rate ? `${todayKpis.hook_rate.toFixed(1)}%` : '—', color: todayKpis.hook_rate ? (todayKpis.hook_rate >= 30 ? '#22C55E' : todayKpis.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#7A90AA' },
                  { label: 'Frecuencia', value: todayKpis.frequency ? todayKpis.frequency.toFixed(1) : '—', color: todayKpis.frequency && todayKpis.frequency > 3 ? '#F59E0B' : '#F1F5F9' },
                  { label: 'Video avg', value: todayKpis.video_avg ? `${todayKpis.video_avg.toFixed(0)}s` : '—', color: '#7A90AA' },
                ].map(kpi => (
                  <div key={kpi.label} style={{ backgroundColor: '#0E1B30', border: '1px solid #1A3050', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '10px', color: '#7A90AA', marginBottom: '4px', textTransform: 'uppercase' }}>{kpi.label}</div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla día por día */}
          {(rangeM.data || []).length > 0 && (
            <div style={{ marginBottom: '24px', backgroundColor: '#0E1B30', border: '1px solid #1A3050', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A3050' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Histórico {days}d · día por día</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '1800px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' as const, minWidth: '80px' }}>Fecha</th>
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
                      <th style={th}>Valor resultados</th>
                      <th style={th}>ROAS</th>
                      <th style={th}>Tráf. ef.</th>
                      <th style={th}>Conv. WEB</th>
                      <th style={th}>Frecuencia</th>
                      <th style={th}>Hook Rate</th>
                      <th style={th}>Video avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rangeM.data || []).map((m: any) => {
                      const mcpa = m.purchases > 0 ? m.spend / m.purchases : null
                      const mlc = m.link_clicks || 0
                      const trafEf = mlc > 0 && m.landing_page_views > 0 ? m.landing_page_views / mlc * 100 : null
                      const convWeb = m.landing_page_views > 0 && m.purchases > 0 ? m.purchases / m.landing_page_views * 100 : null
                      const costAtc = m.add_to_cart > 0 ? m.spend / m.add_to_cart : null
                      return (
                        <tr key={m.date}>
                          <td style={{ ...td, textAlign: 'left' as const, color: '#F1F5F9', fontWeight: 500 }}>{formatDate(m.date)}</td>
                          <td style={{ ...td, color: '#A8BCD0' }}>{m.impressions > 0 ? new Intl.NumberFormat('es-AR').format(m.impressions) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{m.cpm ? formatCurrency(m.cpm, currency) : '—'}</td>
                          <td style={{ ...td, color: ctrColor(m.ctr) }}>{m.ctr ? `${m.ctr.toFixed(2)}%` : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{m.cpc ? formatCurrency(m.cpc, currency) : '—'}</td>
                          <td style={{ ...td, color: '#A8BCD0' }}>{m.unique_link_clicks > 0 ? formatNumber(m.unique_link_clicks) : '—'}</td>
                          <td style={{ ...td, color: '#A8BCD0' }}>{m.landing_page_views > 0 ? formatNumber(m.landing_page_views) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{m.add_to_cart || '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{costAtc ? formatCurrency(costAtc, currency) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{m.checkout_initiated || '—'}</td>
                          <td style={{ ...td, color: m.purchases > 0 ? '#22C55E' : '#7A90AA', fontWeight: 600 }}>{m.purchases || '—'}</td>
                          <td style={{ ...td, color: cpaColor(mcpa), fontWeight: 600 }}>{mcpa ? formatCurrency(mcpa, currency) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{m.spend > 0 ? formatCurrency(m.spend, currency) : '—'}</td>
                          <td style={{ ...td, color: '#A8BCD0' }}>{m.purchase_value > 0 ? formatCurrency(m.purchase_value, currency) : '—'}</td>
                          <td style={{ ...td, color: roasColor(m.roas) }}>{m.roas ? `${m.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{trafEf ? `${trafEf.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: convWeb ? '#22C55E' : '#7A90AA' }}>{convWeb ? `${convWeb.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: m.frequency && m.frequency > 3 ? '#F59E0B' : '#A8BCD0' }}>{m.frequency ? m.frequency.toFixed(1) : '—'}</td>
                          <td style={{ ...td, color: m.hook_rate ? (m.hook_rate >= 30 ? '#22C55E' : m.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#7A90AA' }}>{m.hook_rate ? `${m.hook_rate.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: '#7A90AA' }}>{m.video_avg_time_watched ? `${m.video_avg_time_watched.toFixed(0)}s` : '—'}</td>
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
            <div style={{ marginBottom: '24px', backgroundColor: '#0E1B30', border: '1px solid #1A3050', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #1A3050', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Ad Sets — {adSetRows.length}</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#22C55E20', color: '#22C55E', borderRadius: '4px' }}>CPA ≤${CPA_TARGET} 🟢</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#F59E0B20', color: '#F59E0B', borderRadius: '4px' }}>≤${CPA_BREAKEVEN} 🟡</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#EF444420', color: '#EF4444', borderRadius: '4px' }}>&gt;${CPA_BREAKEVEN} 🔴</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#7A90AA' }}>acumulado {days}d →</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '2400px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' as const, minWidth: '150px', position: 'sticky', left: 0 }}>Ad Set</th>
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
                      <th style={thSep}>Ventas {days}d</th>
                      <th style={th}>CPA {days}d</th>
                      <th style={th}>ROAS {days}d</th>
                      <th style={th}>Gasto {days}d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adSetRows.map((as: any) => (
                      <tr key={as.id} style={{ opacity: as.status === 'ACTIVE' ? 1 : 0.55 }}>
                        <td style={{ ...td, textAlign: 'left' as const, minWidth: '150px', position: 'sticky', left: 0, backgroundColor: '#0E1B30' }}>
                          <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{as.name}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'center' as const }}>{statusEmoji(as.status)}</td>
                        <td style={{ ...td, color: '#A8BCD0' }}>{as.t.impressions > 0 ? new Intl.NumberFormat('es-AR').format(as.t.impressions) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.cpm ? formatCurrency(as.t.cpm, currency) : '—'}</td>
                        <td style={{ ...td, color: ctrColor(as.t.ctr) }}>{as.t.ctr ? `${as.t.ctr.toFixed(2)}%` : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.cpc ? formatCurrency(as.t.cpc, currency) : '—'}</td>
                        <td style={{ ...td, color: '#A8BCD0' }}>{as.t.unique_link_clicks > 0 ? formatNumber(as.t.unique_link_clicks) : '—'}</td>
                        <td style={{ ...td, color: '#A8BCD0' }}>{as.t.landing_page_views > 0 ? formatNumber(as.t.landing_page_views) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.add_to_cart || '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.cost_per_atc ? formatCurrency(as.t.cost_per_atc, currency) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.checkout_initiated || '—'}</td>
                        <td style={{ ...td, color: as.t.purchases > 0 ? '#22C55E' : '#7A90AA', fontWeight: 600 }}>{as.t.purchases || '—'}</td>
                        <td style={{ ...td, color: cpaColor(as.t.cpa), fontWeight: 600 }}>{as.t.cpa ? formatCurrency(as.t.cpa, currency) : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.spend > 0 ? formatCurrency(as.t.spend, currency) : '—'}</td>
                        <td style={{ ...td, color: '#7A90AA' }}>{as.budget}</td>
                        <td style={{ ...td, color: '#A8BCD0' }}>{as.t.purchase_value > 0 ? formatCurrency(as.t.purchase_value, currency) : '—'}</td>
                        <td style={{ ...td, color: roasColor(as.t.roas) }}>{as.t.roas ? `${as.t.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.t.traf_ef ? `${as.t.traf_ef.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...td, color: as.t.conv_web ? '#22C55E' : '#7A90AA' }}>{as.t.conv_web ? `${as.t.conv_web.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...td, color: as.t.frequency && as.t.frequency > 3 ? '#F59E0B' : '#A8BCD0' }}>{as.t.frequency ? as.t.frequency.toFixed(1) : '—'}</td>
                        <td style={{ ...td, color: as.t.hook_rate ? (as.t.hook_rate >= 30 ? '#22C55E' : as.t.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : '#7A90AA' }}>{as.t.hook_rate ? `${as.t.hook_rate.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...td, color: '#7A90AA' }}>{as.t.video_avg ? `${as.t.video_avg.toFixed(0)}s` : '—'}</td>
                        <td style={{ ...sep, color: as.r?.purchases > 0 ? '#22C55E' : '#7A90AA', fontWeight: 600 }}>{as.r?.purchases || '—'}</td>
                        <td style={{ ...td, color: cpaColor(as.r?.cpa), fontWeight: 600 }}>{as.r?.cpa ? formatCurrency(as.r.cpa, currency) : '—'}</td>
                        <td style={{ ...td, color: roasColor(as.r?.roas) }}>{as.r?.roas ? `${as.r.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...td, color: '#F1F5F9' }}>{as.r?.spend > 0 ? formatCurrency(as.r.spend, currency) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alertas */}
          {(alerts.data || []).length > 0 && (
            <div style={{ backgroundColor: '#0E1B30', border: '1px solid #1A3050', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A3050' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Alertas recientes</span>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(alerts.data || []).map((a: any) => (
                  <div key={a.id} style={{ padding: '10px 14px', backgroundColor: '#060810', borderRadius: '8px', border: `1px solid ${a.severity === 'critical' ? '#EF444440' : a.severity === 'warning' ? '#F59E0B40' : '#6366F140'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#F1F5F9', lineHeight: 1.5 }}>{a.message}</div>
                      <div style={{ fontSize: '10px', color: '#7A90AA', whiteSpace: 'nowrap' as const }}>{formatDate(a.created_at?.split('T')[0] || '')}</div>
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
