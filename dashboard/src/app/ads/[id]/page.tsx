import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'
import VideoRetentionFunnel from '@/components/dashboard/VideoRetentionFunnel'
import { notFound } from 'next/navigation'

const BORDER = '#1A3050'
const SURFACE = '#0E1B30'
const MUTED = '#64748B'

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div style={{
      backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#F1F5F9' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await headers()
  const { id } = await params

  // Fetch ad info + hierarchy
  const { data: ad, error } = await supabaseAdmin
    .from('ads')
    .select('*, ad_sets(name, campaign_id, campaigns(id, name))')
    .eq('id', id)
    .single()

  if (error || !ad) notFound()

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const since30 = new Date(todayMs - 29 * 86400000).toISOString().split('T')[0]

  const [todayM, histM, accountRes] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_id', id).eq('object_type', 'ad').eq('date', today).single(),
    supabaseAdmin.from('metrics').select('*').eq('object_id', id).eq('object_type', 'ad').gte('date', since30).order('date', { ascending: false }),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const tm = todayM.data as any
  const hist = (histM.data || []) as any[]

  // Acumulado 30d
  const agg30 = hist.reduce((acc: any, m: any) => ({
    spend: acc.spend + (m.spend || 0),
    purchases: acc.purchases + (m.purchases || 0),
    purchase_value: acc.purchase_value + (m.purchase_value || 0),
    impressions: acc.impressions + (m.impressions || 0),
  }), { spend: 0, purchases: 0, purchase_value: 0, impressions: 0 })

  const roas30 = agg30.spend > 0 ? agg30.purchase_value / agg30.spend : null
  const cpa30 = agg30.purchases > 0 ? agg30.spend / agg30.purchases : null

  // Mejor día (por ROAS) para comparar en el funnel
  const bestDay = hist.reduce((best: any, m: any) => {
    const r = m.spend > 0 ? m.purchase_value / m.spend : 0
    const br = best?.spend > 0 ? best.purchase_value / best.spend : 0
    return r > br ? m : best
  }, null)

  const isBestToday = bestDay?.date === today

  // Métricas de hoy para el funnel
  const todayMetrics = {
    impressions: tm?.impressions,
    video_3s_views: tm?.video_3s_views,
    video_p25_watched: tm?.video_p25_watched,
    video_p50_watched: tm?.video_p50_watched,
    video_p75_watched: tm?.video_p75_watched,
    video_p95_watched: tm?.video_p95_watched,
    video_thruplay: tm?.video_thruplay,
    hook_rate: tm?.hook_rate,
    hold_rate: tm?.hold_rate,
    thruplay_rate: tm?.thruplay_rate,
    ctr_post_view: tm?.ctr_post_view,
    video_avg_time_watched: tm?.video_avg_time_watched,
    unique_link_clicks: tm?.unique_link_clicks,
  }

  const bestMetrics = bestDay ? {
    impressions: bestDay.impressions,
    video_3s_views: bestDay.video_3s_views,
    video_p25_watched: bestDay.video_p25_watched,
    video_p50_watched: bestDay.video_p50_watched,
    video_p75_watched: bestDay.video_p75_watched,
    video_p95_watched: bestDay.video_p95_watched,
    video_thruplay: bestDay.video_thruplay,
    hook_rate: bestDay.hook_rate,
    hold_rate: bestDay.hold_rate,
    thruplay_rate: bestDay.thruplay_rate,
    ctr_post_view: bestDay.ctr_post_view,
    video_avg_time_watched: bestDay.video_avg_time_watched,
    unique_link_clicks: bestDay.unique_link_clicks,
  } : null

  const adSet = ad.ad_sets as any
  const campaign = adSet?.campaigns as any

  const tdStyle: any = { padding: '8px 10px', fontSize: '11px', borderBottom: `1px solid ${BORDER}`, color: '#94A3B8' }
  const thStyle: any = { ...tdStyle, color: MUTED, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: '#151820' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header
          title={ad.name}
          subtitle={
            `${statusEmoji(ad.status)} ${ad.status} · ` +
            (adSet?.name ? `${adSet.name} · ` : '') +
            (campaign?.name || '')
          }
        />
        <main style={{ padding: '20px 16px', maxWidth: 1400 }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, fontSize: 12, color: MUTED }}>
            <Link href="/ads" style={{ color: '#6366F1', textDecoration: 'none' }}>← Todos los ads</Link>
            {campaign && (
              <>
                <span>·</span>
                <Link href={`/campaigns/${campaign.id}`} style={{ color: '#6366F1', textDecoration: 'none' }}>
                  {campaign.name}
                </Link>
              </>
            )}
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard
              label="ROAS hoy"
              value={tm?.roas ? `${tm.roas.toFixed(2)}x` : '—'}
              color={roasColor(tm?.roas)}
            />
            <StatCard
              label="CPA hoy"
              value={tm?.cpa ? formatCurrency(tm.cpa, currency) : (tm?.purchases === 0 ? 'Sin ventas' : '—')}
              color={cpaColor(tm?.cpa)}
            />
            <StatCard
              label="Gasto hoy"
              value={tm?.spend > 0 ? formatCurrency(tm.spend, currency) : '—'}
            />
            <StatCard
              label="ROAS 30d"
              value={roas30 ? `${roas30.toFixed(2)}x` : '—'}
              sub={`${agg30.purchases} ventas · ${formatCurrency(agg30.spend, currency)} gasto`}
              color={roasColor(roas30)}
            />
            <StatCard
              label="CPA 30d"
              value={cpa30 ? formatCurrency(cpa30, currency) : '—'}
              color={cpaColor(cpa30)}
            />
          </div>

          {/* Video funnel section */}
          <div style={{ marginBottom: 20 }}>
            {tm?.impressions ? (
              <div style={{ display: 'grid', gridTemplateColumns: bestMetrics && !isBestToday ? '1fr 1fr' : '1fr', gap: 16 }}>
                <VideoRetentionFunnel
                  metrics={todayMetrics}
                  compareMetrics={bestMetrics && !isBestToday ? bestMetrics : undefined}
                  label="Hoy"
                  compareLabel={bestDay && !isBestToday ? `Mejor día (${formatDate(bestDay.date)})` : undefined}
                />
                {/* Si hoy ya es el mejor día, mostrar igual el componente sin comparación */}
              </div>
            ) : (
              <div style={{
                backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
                borderRadius: 10, padding: 24, textAlign: 'center' as const, color: MUTED, fontSize: 13,
              }}>
                Sin métricas para hoy — el bot sincroniza cada 15 minutos.
              </div>
            )}
          </div>

          {/* Histórico últimos 30 días */}
          <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9' }}>
                📅 Historial — últimos 30 días
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' as const }}>Fecha</th>
                    <th style={thStyle}>Impresiones</th>
                    <th style={thStyle}>Hook %</th>
                    <th style={thStyle}>Hold %</th>
                    <th style={thStyle}>ThruPlay %</th>
                    <th style={thStyle}>CTR post-v</th>
                    <th style={thStyle}>Video avg</th>
                    <th style={thStyle}>Gasto</th>
                    <th style={thStyle}>Ventas</th>
                    <th style={thStyle}>CPA</th>
                    <th style={thStyle}>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ ...tdStyle, textAlign: 'center' as const, color: MUTED, padding: 20 }}>
                        Sin datos históricos
                      </td>
                    </tr>
                  ) : hist.map((m: any) => {
                    const roas = m.spend > 0 ? m.purchase_value / m.spend : null
                    const cpa = m.purchases > 0 ? m.spend / m.purchases : null
                    return (
                      <tr key={m.date}>
                        <td style={{ ...tdStyle, textAlign: 'left' as const, color: '#F1F5F9', fontWeight: m.date === today ? 700 : 400 }}>
                          {formatDate(m.date)}{m.date === today ? ' ●' : ''}
                        </td>
                        <td style={tdStyle}>{m.impressions > 0 ? formatNumber(m.impressions) : '—'}</td>
                        <td style={{ ...tdStyle, color: m.hook_rate ? (m.hook_rate >= 30 ? '#22C55E' : m.hook_rate >= 15 ? '#F59E0B' : '#EF4444') : MUTED }}>
                          {m.hook_rate ? `${m.hook_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...tdStyle, color: m.hold_rate ? (m.hold_rate >= 50 ? '#22C55E' : m.hold_rate >= 30 ? '#F59E0B' : '#EF4444') : MUTED }}>
                          {m.hold_rate ? `${m.hold_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...tdStyle, color: m.thruplay_rate ? (m.thruplay_rate >= 15 ? '#22C55E' : m.thruplay_rate >= 8 ? '#F59E0B' : '#EF4444') : MUTED }}>
                          {m.thruplay_rate ? `${m.thruplay_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...tdStyle, color: m.ctr_post_view ? (m.ctr_post_view >= 4 ? '#22C55E' : m.ctr_post_view >= 2 ? '#F59E0B' : '#EF4444') : MUTED }}>
                          {m.ctr_post_view ? `${m.ctr_post_view.toFixed(1)}%` : '—'}
                        </td>
                        <td style={tdStyle}>{m.video_avg_time_watched ? `${m.video_avg_time_watched.toFixed(0)}s` : '—'}</td>
                        <td style={tdStyle}>{m.spend > 0 ? formatCurrency(m.spend, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: m.purchases > 0 ? '#22C55E' : MUTED, fontWeight: 600 }}>{m.purchases || '—'}</td>
                        <td style={{ ...tdStyle, color: cpaColor(cpa), fontWeight: 600 }}>{cpa ? formatCurrency(cpa, currency) : '—'}</td>
                        <td style={{ ...tdStyle, color: roasColor(roas) }}>{roas ? `${roas.toFixed(2)}x` : '—'}</td>
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
