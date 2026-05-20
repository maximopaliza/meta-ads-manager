import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'
import RangeSelector from '@/components/dashboard/RangeSelector'

function agg(rows: any[]) {
  return rows.reduce((acc, m) => ({
    spend: acc.spend + (m.spend || 0),
    purchases: acc.purchases + (m.purchases || 0),
    purchase_value: acc.purchase_value + (m.purchase_value || 0),
    impressions: acc.impressions + (m.impressions || 0),
    link_clicks: acc.link_clicks + (m.link_clicks || 0),
    unique_link_clicks: acc.unique_link_clicks + (m.unique_link_clicks || 0),
    reach: acc.reach + (m.reach || 0),
    landing_page_views: acc.landing_page_views + (m.landing_page_views || 0),
    add_to_cart: acc.add_to_cart + (m.add_to_cart || 0),
    checkout_initiated: acc.checkout_initiated + (m.checkout_initiated || 0),
  }), { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0 })
}

function derive(d: any) {
  return {
    ...d,
    cpa: d.purchases > 0 ? d.spend / d.purchases : null,
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    ctr: d.reach > 0 && d.unique_link_clicks > 0 ? d.unique_link_clicks / d.reach * 100 : null,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : null,
    cpc: d.link_clicks > 0 ? d.spend / d.link_clicks : null,
    trafEf: d.link_clicks > 0 && d.landing_page_views > 0 ? d.landing_page_views / d.link_clicks * 100 : null,
    convWeb: d.landing_page_views > 0 && d.purchases > 0 ? d.purchases / d.landing_page_views * 100 : null,
  }
}

function pct(a: number, b: number) {
  if (!b) return null
  return ((a - b) / b) * 100
}

function wkArrow(v: number | null, invert = false) {
  if (v === null) return { sym: '—', color: '#64748B' }
  const good = invert ? v < 0 : v > 0
  return { sym: v > 0 ? '▲' : '▼', color: good ? '#22C55E' : '#EF4444' }
}

export default async function AnalisisPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; view?: string }> }) {
  await headers()
  const sp = await searchParams
  const view = sp?.view || 'summary'

  const today = await getLatestDate()
  const { rangeStart, rangeEnd, days } = resolveDateRange(sp, today, 14)
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const week1Start = new Date(todayMs - 6 * 86400000).toISOString().split('T')[0]
  const week2Start = new Date(todayMs - 13 * 86400000).toISOString().split('T')[0]
  const week2End = new Date(todayMs - 7 * 86400000).toISOString().split('T')[0]

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

  // Day-by-day rows for the full range
  const dayMap = new Map<string, any>()
  for (const m of mRange.data || []) {
    const e = dayMap.get(m.date) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0 }
    dayMap.set(m.date, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach: e.reach + (m.reach || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
    })
  }
  const dailyRows = Array.from(dayMap.entries())
    .map(([date, d]) => derive({ date, ...d }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const last4Days = dailyRows.slice(0, 4)

  // Campaign breakdown
  const campAgg = new Map<string, any>()
  for (const m of mRange.data || []) {
    const e = campAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0, days_active: 0 }
    campAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach: e.reach + (m.reach || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      days_active: e.days_active + (m.spend > 0 ? 1 : 0),
    })
  }
  const campaignRows = Array.from(campAgg.entries())
    .map(([id, d]) => {
      const c = campaignMeta.get(id) as any
      return { id, name: c?.name || id, status: c?.status || 'UNKNOWN', days_active: d.days_active, ...derive(d) }
    })
    .sort((a, b) => b.spend - a.spend)

  // Semaphore
  const tp = todayData.purchases
  const tc = todayData.cpa
  const ts = todayData.spend
  let sem: 'green' | 'yellow' | 'red' = 'yellow'
  let semText = ''
  if (tp >= 2 && tc !== null && tc <= CPA_TARGET) {
    sem = 'green'; semText = `${tp} ventas a ${formatCurrency(tc, currency)} CPA — bajo objetivo. Escalar presupuesto.`
  } else if (tp >= 2 && tc !== null && tc <= CPA_BREAKEVEN) {
    sem = 'green'; semText = `${tp} ventas a ${formatCurrency(tc, currency)} CPA — dentro del breakeven. Mantener.`
  } else if (tp === 1) {
    sem = 'yellow'; semText = `1 venta a ${tc ? formatCurrency(tc, currency) : '?'} CPA. Insuficiente para evaluar. Monitorear.`
  } else if (tp === 0 && ts < 50) {
    sem = 'yellow'; semText = `Sin ventas. Gasto bajo (${formatCurrency(ts, currency)}). Esperar más datos.`
  } else if (tp === 0 && ts >= 50) {
    sem = 'red'; semText = `Sin ventas con ${formatCurrency(ts, currency)} gastado. Revisar creativos urgente.`
  } else if (tc !== null && tc > CPA_BREAKEVEN) {
    sem = 'red'; semText = `CPA ${formatCurrency(tc, currency)} supera breakeven (${formatCurrency(CPA_BREAKEVEN, currency)}). Pausar o ajustar.`
  } else {
    semText = `Datos insuficientes. Monitorear.`
  }

  const semColor = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' }
  const semBg = { green: '#22C55E0D', yellow: '#F59E0B0D', red: '#EF44440D' }
  const semBorder = { green: '#22C55E30', yellow: '#F59E0B30', red: '#EF444430' }
  const semEmoji = { green: '🟢', yellow: '🟡', red: '🔴' }

  // Funnel (last 7d)
  const funnelSteps = [
    { label: 'Impresiones', value: week1Data.impressions, fmt: (v: number) => new Intl.NumberFormat('es-AR').format(Math.round(v)), rate: null },
    { label: 'Clics únicos', value: week1Data.unique_link_clicks, fmt: (v: number) => formatNumber(v), rate: week1Data.ctr ? `CTR ${week1Data.ctr.toFixed(2)}%` : null },
    { label: 'Visitas LP', value: week1Data.landing_page_views, fmt: (v: number) => formatNumber(v), rate: week1Data.trafEf ? `Tráf.ef. ${week1Data.trafEf.toFixed(1)}%` : null },
    { label: 'ATC', value: week1Data.add_to_cart, fmt: (v: number) => String(Math.round(v)), rate: week1Data.landing_page_views > 0 && week1Data.add_to_cart > 0 ? `${(week1Data.add_to_cart / week1Data.landing_page_views * 100).toFixed(1)}% LP` : null },
    { label: 'Pagos inic.', value: week1Data.checkout_initiated, fmt: (v: number) => String(Math.round(v)), rate: week1Data.add_to_cart > 0 && week1Data.checkout_initiated > 0 ? `${(week1Data.checkout_initiated / week1Data.add_to_cart * 100).toFixed(1)}% ATC` : null },
    { label: 'Ventas', value: week1Data.purchases, fmt: (v: number) => String(Math.round(v)), rate: week1Data.convWeb ? `Conv. ${week1Data.convWeb.toFixed(1)}%` : null },
  ]
  const funnelMax = funnelSteps[0].value || 1

  // Week comparison
  const wkItems = [
    { label: 'Ventas', w1: week1Data.purchases, w2: week2Data.purchases, fmt: (v: number) => String(Math.round(v)), p: pct(week1Data.purchases, week2Data.purchases), inv: false },
    { label: 'CPA', w1: week1Data.cpa ?? 0, w2: week2Data.cpa ?? 0, fmt: (v: number) => v ? formatCurrency(v, currency) : '—', p: pct(week1Data.cpa ?? 0, week2Data.cpa ?? 0), inv: true },
    { label: 'ROAS', w1: week1Data.roas ?? 0, w2: week2Data.roas ?? 0, fmt: (v: number) => v ? `${v.toFixed(2)}x` : '—', p: pct(week1Data.roas ?? 0, week2Data.roas ?? 0), inv: false },
    { label: 'Gasto', w1: week1Data.spend, w2: week2Data.spend, fmt: (v: number) => formatCurrency(v, currency), p: pct(week1Data.spend, week2Data.spend), inv: false },
    { label: 'ATC', w1: week1Data.add_to_cart, w2: week2Data.add_to_cart, fmt: (v: number) => String(Math.round(v)), p: pct(week1Data.add_to_cart, week2Data.add_to_cart), inv: false },
    { label: 'Valor conv.', w1: week1Data.purchase_value, w2: week2Data.purchase_value, fmt: (v: number) => v ? formatCurrency(v, currency) : '—', p: pct(week1Data.purchase_value, week2Data.purchase_value), inv: false },
  ]

  const th: any = { padding: '7px 8px', textAlign: 'right' as const, color: '#64748B', fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#151820' }
  const td: any = { padding: '7px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }

  const dayAnalyses = dayAnalysisRes.data || []
  const recentAlerts = alertsRes.data || []

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1, minWidth: 0 }}>
        <Header title="Análisis" subtitle={`Rendimiento · ${today}`} />
        <main style={{ padding: '20px 16px', maxWidth: '100%' }}>

          {/* Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' as const, gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['summary', 'table'] as const).map(v => (
                <a key={v} href={`?view=${v}&days=${days}`} style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', backgroundColor: view === v ? '#6366F1' : 'transparent', color: view === v ? '#fff' : '#64748B', border: `1px solid ${view === v ? '#6366F1' : '#2D3244'}` }}>
                  {v === 'summary' ? 'Resumen' : 'Tabla completa'}
                </a>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[7, 14, 30].map(d => (
                <a key={d} href={`?view=${view}&days=${d}`} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', textDecoration: 'none', backgroundColor: days === d ? '#6366F110' : 'transparent', color: days === d ? '#6366F1' : '#64748B', border: `1px solid ${days === d ? '#6366F1' : '#2D3244'}` }}>
                  {d}d
                </a>
              ))}
            </div>
          </div>

          {view === 'summary' ? (
            <>
              {/* 1. Estado de hoy */}
              <div style={{ marginBottom: '20px', backgroundColor: semBg[sem], border: `1px solid ${semBorder[sem]}`, borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '11px', color: semColor[sem], fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '6px' }}>
                  {semEmoji[sem]} Estado de hoy — {today}
                </div>
                <div style={{ fontSize: '15px', color: '#F1F5F9', marginBottom: '16px', lineHeight: 1.5 }}>{semText}</div>
                <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' as const }}>
                  {[
                    { label: 'Ventas', value: tp > 0 ? String(tp) : '—', color: tp > 0 ? '#22C55E' : '#64748B' },
                    { label: 'CPA', value: tc ? formatCurrency(tc, currency) : '—', color: cpaColor(tc) },
                    { label: 'Gasto', value: ts > 0 ? formatCurrency(ts, currency) : '—', color: '#F1F5F9' },
                    { label: 'ROAS', value: todayData.roas ? `${todayData.roas.toFixed(2)}x` : '—', color: roasColor(todayData.roas) },
                    { label: 'ATC', value: todayData.add_to_cart > 0 ? String(todayData.add_to_cart) : '—', color: todayData.add_to_cart > 0 ? '#F1F5F9' : '#64748B' },
                    { label: 'Pagos inic.', value: todayData.checkout_initiated > 0 ? String(todayData.checkout_initiated) : '—', color: todayData.checkout_initiated > 0 ? '#F1F5F9' : '#64748B' },
                    { label: 'Valor conv.', value: todayData.purchase_value > 0 ? formatCurrency(todayData.purchase_value, currency) : '—', color: '#94A3B8' },
                  ].map(kpi => (
                    <div key={kpi.label}>
                      <div style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '2px' }}>{kpi.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Últimos 4 días */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Últimos 4 días</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>Objetivo CPA ${CPA_TARGET} · breakeven ${CPA_BREAKEVEN}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '750px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left' as const }}>Fecha</th>
                        <th style={th}>Ventas</th>
                        <th style={th}>CPA</th>
                        <th style={th}>Gasto</th>
                        <th style={th}>Valor conv.</th>
                        <th style={th}>ROAS</th>
                        <th style={th}>ATC</th>
                        <th style={th}>Pagos inic.</th>
                        <th style={th}>Impresiones</th>
                        <th style={th}>CTR único</th>
                        <th style={th}>Señal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {last4Days.map((d: any) => {
                        const isToday = d.date === today
                        let signal = '—'
                        let signalColor = '#64748B'
                        if (d.purchases >= 2 && d.cpa !== null && d.cpa <= CPA_TARGET) { signal = '↑ Escalar'; signalColor = '#22C55E' }
                        else if (d.purchases >= 1 && d.cpa !== null && d.cpa <= CPA_BREAKEVEN) { signal = '= Mantener'; signalColor = '#F59E0B' }
                        else if (d.purchases === 0 && d.spend > 30) { signal = '↓ Pausar?'; signalColor = '#EF4444' }
                        else if (d.cpa !== null && d.cpa > CPA_BREAKEVEN) { signal = '↓ Ajustar'; signalColor = '#EF4444' }
                        return (
                          <tr key={d.date} style={{ backgroundColor: isToday ? '#6366F108' : 'transparent' }}>
                            <td style={{ ...td, textAlign: 'left' as const, color: '#F1F5F9', fontWeight: isToday ? 700 : 400 }}>
                              {formatDate(d.date)}
                              {isToday && <span style={{ fontSize: '9px', color: '#6366F1', marginLeft: '6px', padding: '1px 5px', backgroundColor: '#6366F120', borderRadius: '3px' }}>HOY</span>}
                            </td>
                            <td style={{ ...td, color: d.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d.purchases || '—'}</td>
                            <td style={{ ...td, color: cpaColor(d.cpa), fontWeight: 600 }}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
                            <td style={{ ...td, color: '#F1F5F9' }}>{d.spend > 0 ? formatCurrency(d.spend, currency) : '—'}</td>
                            <td style={{ ...td, color: '#94A3B8' }}>{d.purchase_value > 0 ? formatCurrency(d.purchase_value, currency) : '—'}</td>
                            <td style={{ ...td, color: roasColor(d.roas) }}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
                            <td style={{ ...td, color: '#F1F5F9' }}>{d.add_to_cart || '—'}</td>
                            <td style={{ ...td, color: '#F1F5F9' }}>{d.checkout_initiated || '—'}</td>
                            <td style={{ ...td, color: '#94A3B8' }}>{d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—'}</td>
                            <td style={{ ...td, color: ctrColor(d.ctr) }}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
                            <td style={{ ...td, color: signalColor, fontWeight: 600, fontSize: '10px', textAlign: 'left' as const }}>{signal}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Semana vs semana */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Esta semana vs semana pasada</span>
                  <span style={{ fontSize: '10px', color: '#64748B', marginLeft: '8px' }}>últimos 7d vs 7d anteriores</span>
                </div>
                <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                  {wkItems.map(item => {
                    const a = wkArrow(item.p, item.inv)
                    return (
                      <div key={item.label} style={{ backgroundColor: '#0F1117', borderRadius: '8px', padding: '12px', border: '1px solid #2D3244' }}>
                        <div style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '5px' }}>{item.label}</div>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: '#F1F5F9', marginBottom: '5px' }}>{item.fmt(item.w1)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: '11px', color: a.color, fontWeight: 600 }}>{a.sym} {item.p !== null ? `${Math.abs(item.p).toFixed(1)}%` : '—'}</span>
                          <span style={{ fontSize: '10px', color: '#64748B' }}>ant. {item.fmt(item.w2)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 4. Embudo visual */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Embudo de conversión — últimos 7d</span>
                </div>
                <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'flex-end', gap: '4px', overflowX: 'auto' }}>
                  {funnelSteps.map((step, i) => {
                    const barH = Math.max(20, Math.round((step.value / funnelMax) * 110))
                    const isLast = i === funnelSteps.length - 1
                    return (
                      <div key={step.label} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1, minWidth: '90px' }}>
                        <div style={{ fontSize: '9px', color: '#6366F1', marginBottom: '4px', fontWeight: 600, height: '14px', textAlign: 'center' as const }}>{step.rate || ''}</div>
                        <div style={{ width: '64%', height: `${barH}px`, backgroundColor: isLast ? '#22C55E' : '#6366F1', borderRadius: '4px 4px 0 0', opacity: isLast ? 0.9 : 0.5 + i * 0.07 }} />
                        <div style={{ fontSize: '13px', fontWeight: 700, color: isLast ? '#22C55E' : '#F1F5F9', marginTop: '6px' }}>
                          {step.value > 0 ? step.fmt(step.value) : '—'}
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748B', textAlign: 'center' as const, marginTop: '2px' }}>{step.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 5. Por campaña */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Por campaña — últimos {days}d</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '860px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left' as const, minWidth: '180px' }}>Campaña</th>
                        <th style={th}>Est.</th>
                        <th style={th}>Gasto</th>
                        <th style={th}>Ventas</th>
                        <th style={th}>CPA</th>
                        <th style={th}>Valor conv.</th>
                        <th style={th}>ROAS</th>
                        <th style={th}>ATC</th>
                        <th style={th}>Pagos inic.</th>
                        <th style={th}>CTR único</th>
                        <th style={th}>CPM</th>
                        <th style={th}>Días activo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRows.map((c: any) => (
                        <tr key={c.id} style={{ opacity: c.status === 'ACTIVE' ? 1 : 0.6 }}>
                          <td style={{ ...td, textAlign: 'left' as const, minWidth: '180px' }}>
                            <Link href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</Link>
                          </td>
                          <td style={{ ...td, textAlign: 'center' as const }}>{c.status === 'ACTIVE' ? '🟢' : c.status === 'PAUSED' ? '⏸' : '⚫'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{c.spend > 0 ? formatCurrency(c.spend, currency) : '—'}</td>
                          <td style={{ ...td, color: c.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{c.purchases || '—'}</td>
                          <td style={{ ...td, color: cpaColor(c.cpa), fontWeight: 600 }}>{c.cpa ? formatCurrency(c.cpa, currency) : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{c.purchase_value > 0 ? formatCurrency(c.purchase_value, currency) : '—'}</td>
                          <td style={{ ...td, color: roasColor(c.roas) }}>{c.roas ? `${c.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{c.add_to_cart || '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{c.checkout_initiated || '—'}</td>
                          <td style={{ ...td, color: ctrColor(c.ctr) }}>{c.ctr ? `${c.ctr.toFixed(2)}%` : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{c.cpm ? formatCurrency(c.cpm, currency) : '—'}</td>
                          <td style={{ ...td, color: '#64748B' }}>{c.days_active}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 6. Señales IA */}
              {dayAnalyses.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: '#6366F1', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '10px' }}>Señales IA</div>
                  {dayAnalyses.map((a: any) => (
                    <div key={a.id} style={{ backgroundColor: '#1A1D27', border: '1px solid #6366F130', borderRadius: '12px', padding: '18px 20px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>{a.title}</div>
                        <div style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' as const, marginLeft: '12px' }}>{formatDate(a.created_at?.split('T')[0] || '')}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: 1.8, whiteSpace: 'pre-line' as const }}>{a.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Alertas recientes */}
              {recentAlerts.length > 0 && (
                <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Alertas recientes</span>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    {recentAlerts.slice(0, 5).map((a: any) => (
                      <div key={a.id} style={{ padding: '10px 12px', backgroundColor: '#0F1117', borderRadius: '8px', border: `1px solid ${a.severity === 'critical' ? '#EF444440' : a.severity === 'warning' ? '#F59E0B40' : '#6366F140'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: a.severity === 'critical' ? '#EF444420' : a.severity === 'warning' ? '#F59E0B20' : '#6366F120', color: a.severity === 'critical' ? '#EF4444' : a.severity === 'warning' ? '#F59E0B' : '#6366F1' }}>
                            {a.severity?.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' as const }}>{formatDate(a.created_at?.split('T')[0] || '')}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#F1F5F9', lineHeight: 1.6 }}>{a.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 7. Tabla completa */
            <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3244' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Tabla día por día — últimos {days}d · todas las campañas</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1500px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' as const, position: 'sticky', left: 0 }}>Fecha</th>
                      <th style={th}>Impresiones</th>
                      <th style={th}>CPM</th>
                      <th style={th}>CTR único</th>
                      <th style={th}>CPC</th>
                      <th style={th}>Clics únicos</th>
                      <th style={th}>Visitas LP</th>
                      <th style={th}>ATC</th>
                      <th style={th}>Costo/ATC</th>
                      <th style={th}>Pagos inic.</th>
                      <th style={th}>Ventas</th>
                      <th style={th}>CPA</th>
                      <th style={th}>Gasto</th>
                      <th style={th}>Valor conv.</th>
                      <th style={th}>ROAS</th>
                      <th style={th}>Tráf. ef.</th>
                      <th style={th}>Conv. WEB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((d: any) => {
                      const isToday = d.date === today
                      const costPerAtc = d.add_to_cart > 0 ? d.spend / d.add_to_cart : null
                      return (
                        <tr key={d.date} style={{ backgroundColor: isToday ? '#6366F108' : 'transparent' }}>
                          <td style={{ ...td, textAlign: 'left' as const, color: '#F1F5F9', fontWeight: isToday ? 700 : 400, position: 'sticky', left: 0, backgroundColor: isToday ? '#1e2030' : '#1A1D27' }}>
                            {formatDate(d.date)}{isToday && <span style={{ fontSize: '9px', color: '#6366F1', marginLeft: '6px' }}>HOY</span>}
                          </td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
                          <td style={{ ...td, color: ctrColor(d.ctr) }}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{d.cpc ? formatCurrency(d.cpc, currency) : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.unique_link_clicks > 0 ? d.unique_link_clicks : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.landing_page_views > 0 ? d.landing_page_views : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{d.add_to_cart || '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{costPerAtc ? formatCurrency(costPerAtc, currency) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{d.checkout_initiated || '—'}</td>
                          <td style={{ ...td, color: d.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{d.purchases || '—'}</td>
                          <td style={{ ...td, color: cpaColor(d.cpa), fontWeight: 600 }}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{d.spend > 0 ? formatCurrency(d.spend, currency) : '—'}</td>
                          <td style={{ ...td, color: '#94A3B8' }}>{d.purchase_value > 0 ? formatCurrency(d.purchase_value, currency) : '—'}</td>
                          <td style={{ ...td, color: roasColor(d.roas) }}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
                          <td style={{ ...td, color: '#F1F5F9' }}>{d.trafEf ? `${d.trafEf.toFixed(1)}%` : '—'}</td>
                          <td style={{ ...td, color: d.convWeb ? '#22C55E' : '#64748B' }}>{d.convWeb ? `${d.convWeb.toFixed(1)}%` : '—'}</td>
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
