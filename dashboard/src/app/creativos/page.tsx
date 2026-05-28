import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import RangeSelector from '@/components/dashboard/RangeSelector'
import { Suspense } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'

// ── Helpers ─────────────────────────────────────────────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#7A90AA', TEXT = '#E8EDF5'
const SURFACE = '#0C0F1A', BORDER = '#161A2C'

function hkColor(v: number | null) { return !v ? M : v >= 30 ? G : v >= 15 ? Y : R }
function freqColor(v: number | null) { return !v ? M : v < 2.5 ? G : v < 3.5 ? Y : R }

function healthScore(m: any): { label: string; color: string; bg: string; border: string; priority: number } {
  if (!m || m.spend < 1) return { label: '— Sin datos', color: M, bg: SURFACE, border: BORDER, priority: 0 }
  if (m.spend > 50 && m.purchases === 0)
    return { label: '⛔ Pausar', color: R, bg: '#EF444412', border: '#EF444435', priority: 1 }
  if (m.cpa !== null && m.cpa > CPA_BREAKEVEN * 1.5)
    return { label: '⛔ Pausar', color: R, bg: '#EF444412', border: '#EF444435', priority: 1 }
  if (m.cpa !== null && m.cpa > CPA_BREAKEVEN)
    return { label: '⬇ Bajar', color: R, bg: '#EF444412', border: '#EF444435', priority: 2 }
  if (m.frequency !== null && m.frequency > 3.5 && (m.cpa === null || m.cpa > CPA_TARGET))
    return { label: '😴 Fatiga', color: Y, bg: '#F59E0B12', border: '#F59E0B35', priority: 2 }
  if (m.roas !== null && m.roas >= 3.5 && m.cpa !== null && m.cpa <= CPA_TARGET)
    return { label: '🚀 Escalar', color: G, bg: '#22C55E12', border: '#22C55E35', priority: 5 }
  if (m.cpa !== null && m.cpa <= CPA_TARGET)
    return { label: '✅ Bueno', color: G, bg: '#22C55E12', border: '#22C55E35', priority: 4 }
  if (m.roas !== null && m.roas >= 1.5)
    return { label: '🟡 OK', color: Y, bg: '#F59E0B12', border: '#F59E0B35', priority: 3 }
  if (m.spend > 20)
    return { label: '⚠ Monit.', color: Y, bg: '#F59E0B12', border: '#F59E0B35', priority: 2 }
  return { label: '— Sin datos', color: M, bg: SURFACE, border: BORDER, priority: 0 }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function CreativosPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await headers()
  const sp = await searchParams
  const today = await getLatestDate()
  const { rangeStart, rangeEnd, days, label } = resolveDateRange(sp, today, 7)

  const rangeDays = Math.max(1, Math.round((new Date(rangeEnd + 'T12:00:00Z').getTime() - new Date(rangeStart + 'T12:00:00Z').getTime()) / 86400000) + 1)
  const prevEnd   = new Date(new Date(rangeStart + 'T12:00:00Z').getTime() - 86400000).toISOString().split('T')[0]
  const prevStart = new Date(new Date(rangeStart + 'T12:00:00Z').getTime() - rangeDays * 86400000).toISOString().split('T')[0]

  const [adsRes, rangeM, prevM, accountRes] = await Promise.all([
    supabaseAdmin.from('ads').select('*, ad_sets(name, status, campaign_id, campaigns(name, status))'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').gte('date', rangeStart).lte('date', rangeEnd),
    supabaseAdmin.from('metrics').select('object_id,spend,purchases,purchase_value,impressions').eq('object_type', 'ad').gte('date', prevStart).lte('date', prevEnd),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const ZERO = () => ({ spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0, video_3s_views: 0, freq_w: 0, hook_w: 0, hold_w: 0, thruplay_w: 0, ctr_pv_w: 0 })
  const rangeAgg = new Map<string, any>()
  for (const m of rangeM.data || []) {
    const e = rangeAgg.get(m.object_id) || ZERO()
    const imp = m.impressions || 0
    rangeAgg.set(m.object_id, {
      spend:              e.spend              + (m.spend || 0),
      purchases:          e.purchases          + (m.purchases || 0),
      purchase_value:     e.purchase_value     + (m.purchase_value || 0),
      impressions:        e.impressions        + imp,
      link_clicks:        e.link_clicks        + (m.link_clicks || 0),
      unique_link_clicks: e.unique_link_clicks + (m.unique_link_clicks || 0),
      reach:              e.reach              + (m.reach || 0),
      landing_page_views: e.landing_page_views + (m.landing_page_views || 0),
      add_to_cart:        e.add_to_cart        + (m.add_to_cart || 0),
      checkout_initiated: e.checkout_initiated + (m.checkout_initiated || 0),
      video_3s_views:     e.video_3s_views     + (m.video_3s_views || 0),
      freq_w:     e.freq_w     + (m.frequency || 0) * imp,
      hook_w:     e.hook_w     + (m.hook_rate || 0) * imp,
      hold_w:     e.hold_w     + (m.hold_rate || 0) * imp,
      thruplay_w: e.thruplay_w + (m.thruplay_rate || 0) * imp,
      ctr_pv_w:   e.ctr_pv_w  + (m.ctr_post_view || 0) * imp,
    })
  }

  const prevAgg = new Map<string, any>()
  for (const m of prevM.data || []) {
    const e = prevAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0 }
    prevAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0), purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0), impressions: e.impressions + (m.impressions || 0),
    })
  }

  function derive(raw: any) {
    if (!raw || raw.spend < 0.01) return null
    const imp = raw.impressions || 0
    return {
      spend: raw.spend, purchases: raw.purchases, purchase_value: raw.purchase_value,
      impressions: imp, link_clicks: raw.link_clicks || 0,
      landing_page_views: raw.landing_page_views || 0,
      add_to_cart: raw.add_to_cart || 0, checkout_initiated: raw.checkout_initiated || 0,
      roas:          raw.spend > 0 ? raw.purchase_value / raw.spend : null,
      cpa:           raw.purchases > 0 ? raw.spend / raw.purchases : null,
      cpm:           imp > 0 ? raw.spend / imp * 1000 : null,
      ctr:           raw.reach > 0 && raw.unique_link_clicks > 0 ? raw.unique_link_clicks / raw.reach * 100 : null,
      traf_ef:       raw.link_clicks > 0 && raw.landing_page_views > 0 ? raw.landing_page_views / raw.link_clicks * 100 : null,
      conv_web:      raw.landing_page_views > 0 && raw.purchases > 0 ? raw.purchases / raw.landing_page_views * 100 : null,
      atc_rate:      raw.landing_page_views > 0 && raw.add_to_cart > 0 ? raw.add_to_cart / raw.landing_page_views * 100 : null,
      frequency:     imp > 0 ? raw.freq_w / imp : null,
      hook_rate:     imp > 0 ? raw.hook_w / imp : null,
      hold_rate:     imp > 0 ? raw.hold_w / imp : null,
      thruplay_rate: imp > 0 ? raw.thruplay_w / imp : null,
      ctr_post_view: imp > 0 ? raw.ctr_pv_w / imp : null,
    }
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows = (adsRes.data || []).map((ad: any) => {
    const campActive = ad.ad_sets?.campaigns?.status === 'ACTIVE'
    const asActive   = ad.ad_sets?.status === 'ACTIVE'
    const adActive   = ad.status === 'ACTIVE'
    const effectiveActive = campActive && asActive && adActive
    const t = derive(rangeAgg.get(ad.id))
    const score = healthScore(t)
    const campName = ad.ad_sets?.campaigns?.name || ''
    const asName   = ad.ad_sets?.name || ''
    const thumbnail = ad.thumbnail_url || ad.creative_thumbnail_url || null
    return { ...ad, t, score, campName, asName, effectiveActive, thumbnail }
  }).filter((r: any) => r.t || r.effectiveActive)
    .sort((a: any, b: any) => {
      // Escalar y Bueno primero, luego por gasto
      if (a.score.priority !== b.score.priority) return b.score.priority - a.score.priority
      if (a.effectiveActive && !b.effectiveActive) return -1
      if (b.effectiveActive && !a.effectiveActive) return 1
      return (b.t?.spend || 0) - (a.t?.spend || 0)
    })

  // ── Semáforo counts ───────────────────────────────────────────────────────
  const scoreCount = {
    escalar: rows.filter((r: any) => r.score.priority === 5).length,
    bueno:   rows.filter((r: any) => r.score.priority === 4).length,
    ok:      rows.filter((r: any) => r.score.priority === 3).length,
    revisar: rows.filter((r: any) => r.score.priority <= 2 && r.score.priority > 0).length,
  }

  // ── Scoreboard ─────────────────────────────────────────────────────────────
  const withData = rows.filter((r: any) => r.t)
  const bestRoas  = [...withData].filter((r: any) => r.t.roas).sort((a: any, b: any) => b.t.roas - a.t.roas)[0]
  const bestCpa   = [...withData].filter((r: any) => r.t.cpa).sort((a: any, b: any) => a.t.cpa - b.t.cpa)[0]
  const bestSales = [...withData].sort((a: any, b: any) => b.t.purchases - a.t.purchases)[0]
  const bestHook  = [...withData].filter((r: any) => r.t.hook_rate).sort((a: any, b: any) => b.t.hook_rate - a.t.hook_rate)[0]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#070911' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Creativos" subtitle={`${rows.length} anuncios · ${label}`} />
        <main style={{ padding: '20px', maxWidth: '1800px' }}>

          {/* ── Período + RangeSelector ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: M }}>Período:</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: TEXT }}>{label}</span>
              <span style={{ fontSize: '10px', color: '#252B3D' }}>({rangeStart} → {rangeEnd})</span>
            </div>
            <Suspense fallback={null}><RangeSelector /></Suspense>
          </div>

          {/* ── Semáforo ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: '🚀 Escalar', count: scoreCount.escalar, color: G, border: '#22C55E20' },
              { label: '✅ Bueno',   count: scoreCount.bueno,   color: G, border: '#22C55E15' },
              { label: '🟡 OK',      count: scoreCount.ok,      color: Y, border: '#F59E0B20' },
              { label: '⛔ Revisar', count: scoreCount.revisar, color: R, border: '#EF444420' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: SURFACE, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</div>
                <div style={{ fontSize: '11px', color: s.color, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Scoreboard ── */}
          {(bestRoas || bestCpa || bestSales || bestHook) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              {[
                bestRoas  && { icon: '📈', label: 'Mejor ROAS',  name: bestRoas.name,  value: `${bestRoas.t.roas.toFixed(2)}x`,                  color: roasColor(bestRoas.t.roas) },
                bestCpa   && { icon: '💰', label: 'Menor CPA',   name: bestCpa.name,   value: formatCurrency(bestCpa.t.cpa, currency),            color: cpaColor(bestCpa.t.cpa) },
                bestSales && { icon: '🛒', label: 'Más ventas',  name: bestSales.name, value: `${bestSales.t.purchases} ventas`,                  color: G },
                bestHook  && { icon: '🎬', label: 'Mejor Hook',  name: bestHook.name,  value: `${bestHook.t.hook_rate.toFixed(1)}%`,               color: hkColor(bestHook.t.hook_rate) },
              ].filter(Boolean).map((s: any) => (
                <div key={s.label} style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '9px', color: M, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '5px' }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: s.color, lineHeight: 1.1, marginBottom: '4px' }}>{s.value}</div>
                  <div style={{ fontSize: '10px', color: '#4A6080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Grilla de creativos ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {rows.map((row: any) => {
              const t = row.t
              const isActive = row.effectiveActive

              return (
                <div
                  key={row.id}
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${row.score.border || BORDER}`,
                    borderRadius: '14px',
                    overflow: 'hidden',
                    opacity: isActive ? 1 : 0.55,
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                >
                  {/* ── Portada ── */}
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#080A14', overflow: 'hidden', flexShrink: 0 }}>
                    {row.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.thumbnail}
                        alt={row.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      /* Placeholder cuando no hay imagen */
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #0A0D18 0%, #0F1225 100%)' }}>
                        <span style={{ fontSize: '32px', opacity: 0.2 }}>🎬</span>
                        <span style={{ fontSize: '9px', color: '#1E2438', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Sin portada</span>
                      </div>
                    )}

                    {/* Status badge */}
                    <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                      <span style={{
                        fontSize: '8px', fontWeight: 700, padding: '3px 7px', borderRadius: '5px',
                        color: row.score.color, backgroundColor: '#07091199',
                        border: `1px solid ${row.score.border}`,
                        backdropFilter: 'blur(4px)',
                      }}>
                        {row.score.label}
                      </span>
                    </div>

                    {/* Active / Paused badge */}
                    <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                      <span style={{
                        fontSize: '8px', fontWeight: 600, padding: '3px 7px', borderRadius: '5px',
                        color: isActive ? G : M,
                        backgroundColor: '#07091199',
                        border: `1px solid ${isActive ? '#22C55E30' : '#1E2438'}`,
                        backdropFilter: 'blur(4px)',
                      }}>
                        {isActive ? '● Activo' : '⏸ Pausado'}
                      </span>
                    </div>

                    {/* Hook rate chip si hay dato */}
                    {t?.hook_rate != null && (
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, padding: '3px 7px', borderRadius: '5px',
                          color: hkColor(t.hook_rate), backgroundColor: '#070911BB',
                          border: `1px solid ${hkColor(t.hook_rate)}40`,
                          backdropFilter: 'blur(4px)',
                        }}>
                          Hook {t.hook_rate.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Info ── */}
                  <div style={{ padding: '12px 12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {/* Ad name */}
                    <div style={{ fontSize: '12px', fontWeight: 700, color: TEXT, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                      {row.name}
                    </div>
                    {/* Ad Set */}
                    <div style={{ fontSize: '10px', color: '#7A90AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginTop: '2px' }}>
                      <span style={{ color: '#2D3458', marginRight: '4px' }}>Conj.</span>{row.asName}
                    </div>
                    {/* Campaign */}
                    <div style={{ fontSize: '10px', color: '#4A6080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      <span style={{ marginRight: '4px' }}>Camp.</span>{row.campName}
                    </div>
                  </div>

                  {/* ── Métricas principales ── */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    {[
                      { label: 'Ventas', value: t?.purchases ?? null, fmt: (v: number) => String(v), color: (t?.purchases || 0) > 0 ? G : M },
                      { label: 'CPA',    value: t?.cpa ?? null,       fmt: (v: number) => formatCurrency(v, currency), color: cpaColor(t?.cpa ?? null) },
                      { label: 'Gasto',  value: t?.spend ?? null,     fmt: (v: number) => formatCurrency(v, currency), color: TEXT },
                      { label: 'ROAS',   value: t?.roas ?? null,      fmt: (v: number) => `${v.toFixed(2)}x`, color: roasColor(t?.roas ?? null) },
                    ].map((kpi, i) => (
                      <div
                        key={kpi.label}
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center' as const,
                          borderRight: i < 3 ? `1px solid ${BORDER}` : 'none',
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>
                          {kpi.value != null ? kpi.fmt(kpi.value) : '—'}
                        </div>
                        <div style={{ fontSize: '8px', color: M, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '3px' }}>
                          {kpi.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: M, fontSize: '13px' }}>
              Sin anuncios con datos en el período seleccionado.
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
