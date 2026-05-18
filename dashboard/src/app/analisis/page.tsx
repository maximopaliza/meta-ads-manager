import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import RangeSelector from '@/components/dashboard/RangeSelector'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'

export default async function AnalisisPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await headers()
  const sp = await searchParams
  const days = Math.min(90, Math.max(1, Number(sp?.days || 14)))

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const rangeStart = new Date(todayMs - days * 86400000).toISOString().split('T')[0]

  const [metricsRes, campaignsRes, accountRes, alertsRes] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', rangeStart).order('date', { ascending: false }),
    supabaseAdmin.from('campaigns').select('id,name,status'),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
    supabaseAdmin.from('alerts').select('*').order('created_at', { ascending: false }).limit(20),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const campaigns = new Map((campaignsRes.data || []).map((c: any) => [c.id, c]))
  const allMetrics = metricsRes.data || []

  // --- Day-by-day aggregation (all campaigns) ---
  const dayMap = new Map<string, any>()
  for (const m of allMetrics) {
    const e = dayMap.get(m.date) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, clicks: 0, add_to_cart: 0 }
    dayMap.set(m.date, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      clicks: e.clicks + (m.clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
    })
  }
  const dailyRows = Array.from(dayMap.entries())
    .map(([date, d]) => {
      const lc = d.link_clicks || d.clicks || 0
      const cpa = d.purchases > 0 ? d.spend / d.purchases : null
      const roas = d.spend > 0 ? d.purchase_value / d.spend : null
      const ctr = d.impressions > 0 && lc > 0 ? lc / d.impressions * 100 : null
      const cpm = d.impressions > 0 ? d.spend / d.impressions * 1000 : null
      return { date, ...d, cpa, roas, ctr, cpm }
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  // --- Campaign aggregation for the range ---
  const campaignAgg = new Map<string, any>()
  for (const m of allMetrics) {
    const e = campaignAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, clicks: 0, add_to_cart: 0, days_active: 0 }
    campaignAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      clicks: e.clicks + (m.clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
      days_active: e.days_active + (m.spend > 0 ? 1 : 0),
    })
  }

  const campaignRows = Array.from(campaignAgg.entries())
    .map(([id, d]) => {
      const lc = d.link_clicks || d.clicks || 0
      const cpa = d.purchases > 0 ? d.spend / d.purchases : null
      const roas = d.spend > 0 ? d.purchase_value / d.spend : null
      const ctr = d.impressions > 0 && lc > 0 ? lc / d.impressions * 100 : null
      const cpm = d.impressions > 0 ? d.spend / d.impressions * 1000 : null
      const avg_daily_spend = d.days_active > 0 ? d.spend / d.days_active : 0
      const c = campaigns.get(id) as any
      return {
        id,
        name: c?.name || id,
        status: c?.status || 'UNKNOWN',
        ...d, cpa, roas, ctr, cpm, avg_daily_spend,
      }
    })
    .sort((a, b) => b.spend - a.spend)

  // --- Totals for the range ---
  const total = dailyRows.reduce((acc, d) => ({
    spend: acc.spend + d.spend,
    purchases: acc.purchases + d.purchases,
    purchase_value: acc.purchase_value + d.purchase_value,
    add_to_cart: acc.add_to_cart + d.add_to_cart,
  }), { spend: 0, purchases: 0, purchase_value: 0, add_to_cart: 0 })

  const totalCpa = total.purchases > 0 ? total.spend / total.purchases : null
  const totalRoas = total.spend > 0 ? total.purchase_value / total.spend : null
  const atcConversion = total.add_to_cart > 0 ? (total.purchases / total.add_to_cart * 100) : null

  // Best/worst days
  const daysWithPurchases = dailyRows.filter(d => d.purchases > 0)
  const bestDay = daysWithPurchases.length > 0 ? daysWithPurchases.reduce((a, b) => (b.roas ?? 0) > (a.roas ?? 0) ? b : a) : null
  const worstDay = daysWithPurchases.length > 0 ? daysWithPurchases.reduce((a, b) => (b.cpa ?? 999) < (a.cpa ?? 999) ? b : a) : null

  // Alerts
  const criticalAlerts = (alertsRes.data || []).filter((a: any) => a.severity === 'critical' && !a.sent_to_telegram)
  const recentAlerts = alertsRes.data || []

  const thStyle: any = { padding: '8px 12px', textAlign: 'right', color: '#64748B', fontSize: '11px', fontWeight: 500, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' }
  const tdStyle: any = { padding: '9px 12px', textAlign: 'right', fontSize: '12px', borderBottom: '1px solid #1a1d27' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Análisis" subtitle={`Tendencias y rendimiento · últimos ${days} días`} />
        <main style={{ padding: '28px 32px', maxWidth: '1400px' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <RangeSelector />
          </div>

          {/* Alertas críticas pendientes */}
          {criticalAlerts.length > 0 && (
            <div style={{ marginBottom: '20px', backgroundColor: '#EF444410', border: '1px solid #EF444440', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#EF4444', marginBottom: '6px' }}>🚨 {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? 's' : ''} crítica{criticalAlerts.length > 1 ? 's' : ''} pendiente{criticalAlerts.length > 1 ? 's' : ''}</div>
              {criticalAlerts.slice(0, 3).map((a: any) => (
                <div key={a.id} style={{ fontSize: '12px', color: '#F1F5F9', marginTop: '4px' }}>• {a.message}</div>
              ))}
            </div>
          )}

          {/* KPIs resumen del período */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: `Gasto total ${days}d`, value: total.spend > 0 ? formatCurrency(total.spend, currency) : '—', color: '#F1F5F9' },
              { label: 'Resultados totales', value: total.purchases > 0 ? String(total.purchases) : '—', color: total.purchases > 0 ? '#22C55E' : '#64748B' },
              { label: 'CPA promedio', value: totalCpa ? formatCurrency(totalCpa, currency) : '—', color: cpaColor(totalCpa) },
              { label: 'ROAS promedio', value: totalRoas ? `${totalRoas.toFixed(2)}x` : '—', color: roasColor(totalRoas) },
              { label: 'ATC totales', value: total.add_to_cart > 0 ? String(total.add_to_cart) : '—', color: '#F1F5F9' },
              { label: 'ATC→Compra', value: atcConversion ? `${atcConversion.toFixed(1)}%` : '—', color: atcConversion && atcConversion >= 5 ? '#22C55E' : atcConversion ? '#F59E0B' : '#64748B' },
            ].map(kpi => (
              <div key={kpi.label} style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>{kpi.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Mejor/peor día */}
          {(bestDay || worstDay) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              {bestDay && (
                <div style={{ backgroundColor: '#22C55E10', border: '1px solid #22C55E30', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#22C55E', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>🏆 Mejor día ({days}d)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#F1F5F9', marginBottom: '6px' }}>{formatDate(bestDay.date)}</div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#22C55E' }}>ROAS {bestDay.roas?.toFixed(2)}x</span>
                    <span style={{ color: cpaColor(bestDay.cpa) }}>CPA {bestDay.cpa ? formatCurrency(bestDay.cpa, currency) : '—'}</span>
                    <span style={{ color: '#F1F5F9' }}>{bestDay.purchases} ventas</span>
                    <span style={{ color: '#64748B' }}>{formatCurrency(bestDay.spend, currency)} gastado</span>
                  </div>
                </div>
              )}
              {worstDay && (
                <div style={{ backgroundColor: '#EF444410', border: '1px solid #EF444430', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>📉 Peor día CPA ({days}d)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#F1F5F9', marginBottom: '6px' }}>{formatDate(worstDay.date)}</div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
                    <span style={{ color: roasColor(worstDay.roas) }}>ROAS {worstDay.roas?.toFixed(2)}x</span>
                    <span style={{ color: cpaColor(worstDay.cpa) }}>CPA {worstDay.cpa ? formatCurrency(worstDay.cpa, currency) : '—'}</span>
                    <span style={{ color: '#F1F5F9' }}>{worstDay.purchases} ventas</span>
                    <span style={{ color: '#64748B' }}>{formatCurrency(worstDay.spend, currency)} gastado</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabla día por día */}
          <div style={{ marginBottom: '24px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Día por día — todas las campañas</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Fecha</th>
                    <th style={thStyle}>Gasto</th>
                    <th style={thStyle}>Ventas</th>
                    <th style={thStyle}>CPA</th>
                    <th style={thStyle}>ROAS</th>
                    <th style={thStyle}>CTR</th>
                    <th style={thStyle}>CPM</th>
                    <th style={thStyle}>ATC</th>
                    <th style={thStyle}>ATC→Compra</th>
                    <th style={thStyle}>Impresiones</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((d) => {
                    const conv = d.add_to_cart > 0 ? d.purchases / d.add_to_cart * 100 : null
                    const isToday = d.date === today
                    return (
                      <tr key={d.date} style={{ backgroundColor: isToday ? '#6366F108' : 'transparent' }}>
                        <td style={{ ...tdStyle, textAlign: 'left', color: '#F1F5F9', fontWeight: isToday ? 700 : 500 }}>
                          {formatDate(d.date)} {isToday && <span style={{ fontSize: '10px', color: '#6366F1', marginLeft: '4px' }}>HOY</span>}
                        </td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{d.spend > 0 ? formatCurrency(d.spend, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: d.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: d.purchases > 0 ? 600 : 400 }}>{d.purchases || '—'}</td>
                        <td style={{ ...tdStyle, color: cpaColor(d.cpa), fontWeight: 600 }}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: roasColor(d.roas) }}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...tdStyle, color: ctrColor(d.ctr) }}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: '#F1F5F9' }}>{d.add_to_cart || '—'}</td>
                        <td style={{ ...tdStyle, color: conv && conv >= 5 ? '#22C55E' : conv ? '#F59E0B' : '#64748B' }}>{conv ? `${conv.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...tdStyle, color: '#64748B' }}>{d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ranking campañas por el período */}
          <div style={{ marginBottom: '24px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Ranking campañas — {days}d acumulado</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Campaña</th>
                    <th style={thStyle}>Gasto</th>
                    <th style={thStyle}>Ventas</th>
                    <th style={thStyle}>CPA</th>
                    <th style={thStyle}>ROAS</th>
                    <th style={thStyle}>CTR</th>
                    <th style={thStyle}>CPM</th>
                    <th style={thStyle}>ATC</th>
                    <th style={thStyle}>Días activo</th>
                    <th style={thStyle}>Gasto/día</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.map((c, i) => (
                    <tr key={c.id} style={{ opacity: c.status === 'ACTIVE' ? 1 : 0.6 }}>
                      <td style={{ ...tdStyle, textAlign: 'left', color: '#64748B', fontWeight: 600, width: '32px' }}>#{i + 1}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', maxWidth: '200px' }}>
                        <a href={`/campaigns/${c.id}`} style={{ color: '#F1F5F9', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </a>
                      </td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{c.spend > 0 ? formatCurrency(c.spend, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: c.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: c.purchases > 0 ? 600 : 400 }}>{c.purchases || '—'}</td>
                      <td style={{ ...tdStyle, color: cpaColor(c.cpa), fontWeight: 600 }}>{c.cpa ? formatCurrency(c.cpa, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: roasColor(c.roas) }}>{c.roas ? `${c.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...tdStyle, color: ctrColor(c.ctr) }}>{c.ctr ? `${c.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{c.cpm ? formatCurrency(c.cpm, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{c.add_to_cart || '—'}</td>
                      <td style={{ ...tdStyle, color: '#64748B' }}>{c.days_active}</td>
                      <td style={{ ...tdStyle, color: '#64748B' }}>{c.avg_daily_spend > 0 ? formatCurrency(c.avg_daily_spend, currency) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alertas IA recientes */}
          {recentAlerts.length > 0 && (
            <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>Análisis IA — alertas recientes</span>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentAlerts.map((a: any) => (
                  <div key={a.id} style={{
                    padding: '12px 14px',
                    backgroundColor: '#0F1117',
                    borderRadius: '8px',
                    border: `1px solid ${a.severity === 'critical' ? '#EF444440' : a.severity === 'warning' ? '#F59E0B40' : '#6366F140'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: a.severity === 'critical' ? '#EF444420' : a.severity === 'warning' ? '#F59E0B20' : '#6366F120', color: a.severity === 'critical' ? '#EF4444' : a.severity === 'warning' ? '#F59E0B' : '#6366F1' }}>
                          {a.severity?.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748B' }}>{a.type}</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>{formatDate(a.created_at?.split('T')[0] || '')}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#F1F5F9', lineHeight: 1.6 }}>{a.message}</div>
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
