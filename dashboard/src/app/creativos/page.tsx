import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import RangeSelector from '@/components/dashboard/RangeSelector'
import { Suspense } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET, resolveDateRange } from '@/lib/metrics'

// ── Helpers ─────────────────────────────────────────────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#64748B', TEXT = '#F1F5F9'

function hkColor(v: number | null) { return !v ? M : v >= 30 ? G : v >= 15 ? Y : R }
function hlColor(v: number | null) { return !v ? M : v >= 50 ? G : v >= 30 ? Y : R }
function tpColor(v: number | null) { return !v ? M : v >= 15 ? G : v >= 8 ? Y : R }
function freqColor(v: number | null) { return !v ? M : v < 2.5 ? G : v < 3.5 ? Y : R }

function healthScore(m: any): { label: string; color: string; bg: string; border: string; priority: number } {
  if (!m || m.spend < 1) return { label: '— Sin datos', color: M, bg: '#1A1D27', border: '#2D3244', priority: 0 }
  if (m.spend > 50 && m.purchases === 0)
    return { label: '⛔ Pausar', color: R, bg: '#EF444415', border: '#EF444440', priority: 1 }
  if (m.cpa !== null && m.cpa > CPA_BREAKEVEN * 1.5)
    return { label: '⛔ Pausar', color: R, bg: '#EF444415', border: '#EF444440', priority: 1 }
  if (m.cpa !== null && m.cpa > CPA_BREAKEVEN)
    return { label: '⬇ Bajar', color: R, bg: '#EF444415', border: '#EF444440', priority: 2 }
  if (m.frequency !== null && m.frequency > 3.5 && (m.cpa === null || m.cpa > CPA_TARGET))
    return { label: '😴 Fatiga', color: Y, bg: '#F59E0B15', border: '#F59E0B40', priority: 2 }
  if (m.roas !== null && m.roas >= 3.5 && m.cpa !== null && m.cpa <= CPA_TARGET)
    return { label: '🚀 Escalar', color: G, bg: '#22C55E15', border: '#22C55E40', priority: 5 }
  if (m.cpa !== null && m.cpa <= CPA_TARGET)
    return { label: '✅ Bueno', color: G, bg: '#22C55E15', border: '#22C55E40', priority: 4 }
  if (m.roas !== null && m.roas >= 1.5)
    return { label: '🟡 OK', color: Y, bg: '#F59E0B15', border: '#F59E0B40', priority: 3 }
  if (m.spend > 20)
    return { label: '⚠ Monit.', color: Y, bg: '#F59E0B15', border: '#F59E0B40', priority: 2 }
  return { label: '— Sin datos', color: M, bg: '#1A1D27', border: '#2D3244', priority: 0 }
}

function pctFmt(a: number | null, b: number | null, invert = false) {
  if (!a || !b || b === 0) return { text: '—', color: M }
  const v = ((a - b) / b) * 100
  const good = invert ? v < 0 : v > 0
  return { text: `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, color: good ? G : R }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function CreativosPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await headers()
  const sp = await searchParams
  const today = await getLatestDate()
  const { rangeStart, rangeEnd, days, label } = resolveDateRange(sp, today, 7)
  const todayMs = new Date(today + 'T12:00:00Z').getTime()

  // Previous period for trend
  const rangeDays = Math.max(1, Math.round((new Date(rangeEnd + 'T12:00:00Z').getTime() - new Date(rangeStart + 'T12:00:00Z').getTime()) / 86400000) + 1)
  const prevEnd   = new Date(new Date(rangeStart + 'T12:00:00Z').getTime() - 86400000).toISOString().split('T')[0]
  const prevStart = new Date(new Date(rangeStart + 'T12:00:00Z').getTime() - rangeDays * 86400000).toISOString().split('T')[0]

  const [adsRes, rangeM, prevM, accountRes] = await Promise.all([
    supabaseAdmin.from('ads').select('*, ad_sets(name, campaign_id, campaigns(name))'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').gte('date', rangeStart).lte('date', rangeEnd),
    supabaseAdmin.from('metrics').select('object_id,spend,purchases,purchase_value,impressions').eq('object_type', 'ad').gte('date', prevStart).lte('date', prevEnd),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'

  // ── Aggregate current period ──────────────────────────────────────────────
  const ZERO = () => ({ spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0, video_3s_views: 0, freq_w: 0, hook_w: 0, hold_w: 0, thruplay_w: 0, ctr_pv_w: 0 })
  const rangeAgg = new Map<string, any>()
  for (const m of rangeM.data || []) {
    const e = rangeAgg.get(m.object_id) || ZERO()
    const imp = m.impressions || 0
    const v3s = m.video_3s_views || 0
    rangeAgg.set(m.object_id, {
      spend:             e.spend             + (m.spend || 0),
      purchases:         e.purchases         + (m.purchases || 0),
      purchase_value:    e.purchase_value    + (m.purchase_value || 0),
      impressions:       e.impressions       + imp,
      link_clicks:       e.link_clicks       + (m.link_clicks || 0),
      unique_link_clicks:e.unique_link_clicks+ (m.unique_link_clicks || 0),
      reach:             e.reach             + (m.reach || 0),
      landing_page_views:e.landing_page_views+ (m.landing_page_views || 0),
      add_to_cart:       e.add_to_cart       + (m.add_to_cart || 0),
      checkout_initiated:e.checkout_initiated+ (m.checkout_initiated || 0),
      video_3s_views:    e.video_3s_views    + v3s,
      freq_w:    e.freq_w    + (m.frequency || 0) * imp,
      hook_w:    e.hook_w    + (m.hook_rate || 0) * imp,
      hold_w:    e.hold_w    + (m.hold_rate || 0) * imp,
      thruplay_w:e.thruplay_w+ (m.thruplay_rate || 0) * imp,
      ctr_pv_w:  e.ctr_pv_w + (m.ctr_post_view || 0) * imp,
    })
  }

  // ── Aggregate previous period ─────────────────────────────────────────────
  const prevAgg = new Map<string, any>()
  for (const m of prevM.data || []) {
    const e = prevAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0 }
    prevAgg.set(m.object_id, {
      spend:          e.spend          + (m.spend || 0),
      purchases:      e.purchases      + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions:    e.impressions    + (m.impressions || 0),
    })
  }

  function derive(raw: any) {
    if (!raw || raw.spend < 0.01) return null
    const imp = raw.impressions || 0
    return {
      spend:             raw.spend,
      purchases:         raw.purchases,
      purchase_value:    raw.purchase_value,
      impressions:       imp,
      link_clicks:       raw.link_clicks || 0,
      landing_page_views:raw.landing_page_views || 0,
      add_to_cart:       raw.add_to_cart || 0,
      checkout_initiated:raw.checkout_initiated || 0,
      video_3s_views:    raw.video_3s_views || 0,
      roas:     raw.spend > 0 ? raw.purchase_value / raw.spend : null,
      cpa:      raw.purchases > 0 ? raw.spend / raw.purchases : null,
      cpm:      imp > 0 ? raw.spend / imp * 1000 : null,
      ctr:      raw.reach > 0 && raw.unique_link_clicks > 0 ? raw.unique_link_clicks / raw.reach * 100 : null,
      traf_ef:  raw.link_clicks > 0 && raw.landing_page_views > 0 ? raw.landing_page_views / raw.link_clicks * 100 : null,
      conv_web: raw.landing_page_views > 0 && raw.purchases > 0 ? raw.purchases / raw.landing_page_views * 100 : null,
      atc_rate: raw.landing_page_views > 0 && raw.add_to_cart > 0 ? raw.add_to_cart / raw.landing_page_views * 100 : null,
      frequency:    imp > 0 ? raw.freq_w / imp : null,
      hook_rate:    imp > 0 ? raw.hook_w / imp : null,
      hold_rate:    imp > 0 ? raw.hold_w / imp : null,
      thruplay_rate:imp > 0 ? raw.thruplay_w / imp : null,
      ctr_post_view:imp > 0 ? raw.ctr_pv_w / imp : null,
    }
  }

  function derivePrev(raw: any) {
    if (!raw || raw.spend < 0.01) return null
    return {
      spend: raw.spend, purchases: raw.purchases,
      roas: raw.spend > 0 ? raw.purchase_value / raw.spend : null,
      cpa: raw.purchases > 0 ? raw.spend / raw.purchases : null,
    }
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows = (adsRes.data || []).map((ad: any) => {
    const t = derive(rangeAgg.get(ad.id))
    const p = derivePrev(prevAgg.get(ad.id))
    const score = healthScore(t)
    const campName = ad.ad_sets?.campaigns?.name || ''
    const asName   = ad.ad_sets?.name || ''
    return { ...ad, t, p, score, campName, asName }
  }).filter((r: any) => r.t || r.status === 'ACTIVE')
    .sort((a: any, b: any) => (b.t?.spend || 0) - (a.t?.spend || 0))

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRaw = ZERO()
  for (const v of rangeAgg.values()) {
    totalRaw.spend             += v.spend;          totalRaw.purchases       += v.purchases
    totalRaw.purchase_value    += v.purchase_value; totalRaw.impressions     += v.impressions
    totalRaw.link_clicks       += v.link_clicks;    totalRaw.unique_link_clicks += v.unique_link_clicks
    totalRaw.reach             += v.reach;          totalRaw.landing_page_views += v.landing_page_views
    totalRaw.add_to_cart       += v.add_to_cart;    totalRaw.checkout_initiated += v.checkout_initiated
    totalRaw.video_3s_views    += v.video_3s_views; totalRaw.freq_w          += v.freq_w
    totalRaw.hook_w            += v.hook_w;         totalRaw.hold_w          += v.hold_w
    totalRaw.thruplay_w        += v.thruplay_w;     totalRaw.ctr_pv_w        += v.ctr_pv_w
  }
  const totals = derive(totalRaw)

  // ── Scoreboard ─────────────────────────────────────────────────────────────
  const withData = rows.filter((r: any) => r.t)
  const bestRoas  = withData.filter((r: any) => r.t.roas).sort((a: any, b: any) => b.t.roas - a.t.roas)[0]
  const bestCpa   = withData.filter((r: any) => r.t.cpa).sort((a: any, b: any) => a.t.cpa - b.t.cpa)[0]
  const bestSales = withData.sort((a: any, b: any) => b.t.purchases - a.t.purchases)[0]
  const bestHook  = withData.filter((r: any) => r.t.hook_rate).sort((a: any, b: any) => b.t.hook_rate - a.t.hook_rate)[0]

  const scoreCount = {
    escalar: rows.filter((r: any) => r.score.priority === 5).length,
    bueno:   rows.filter((r: any) => r.score.priority === 4).length,
    ok:      rows.filter((r: any) => r.score.priority === 3).length,
    revisar: rows.filter((r: any) => r.score.priority <= 2 && r.score.priority > 0).length,
  }

  // ── Fatigue alerts ─────────────────────────────────────────────────────────
  const fatigueAds = rows.filter((r: any) => r.t?.frequency && r.t.frequency >= 2.5 && r.status === 'ACTIVE')
    .sort((a: any, b: any) => (b.t?.frequency || 0) - (a.t?.frequency || 0))
    .slice(0, 6)

  // ── Top ads for funnel ─────────────────────────────────────────────────────
  const topFunnel = rows.filter((r: any) => r.t?.impressions > 0).slice(0, 6)

  // ── Styles ────────────────────────────────────────────────────────────────
  const CARD: any = { backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }
  const TH: any = { padding: '6px 8px', textAlign: 'right' as const, color: M, fontSize: '9px', fontWeight: 700, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em', backgroundColor: '#13151F' }
  const THL: any = { ...TH, textAlign: 'left' as const }
  const TD: any = { padding: '6px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1A1D2780', whiteSpace: 'nowrap' as const }
  const TDL: any = { ...TD, textAlign: 'left' as const }
  const TF: any = { ...TD, fontWeight: 700, backgroundColor: '#0F1117', color: TEXT, borderBottom: '2px solid #6366F1' }
  const TFL: any = { ...TF, textAlign: 'left' as const }

  function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
    return (
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #2D3244', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg,#6366F130,#6366F118)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: TEXT }}>{title}</h2>
          {sub && <p style={{ margin: '2px 0 0', fontSize: '10px', color: M }}>{sub}</p>}
        </div>
      </div>
    )
  }

  function ScoreCard({ icon, label, name, value, valueColor }: { icon: string; label: string; name: string; value: string; valueColor?: string }) {
    return (
      <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '10px', padding: '14px 16px' }}>
        <div style={{ fontSize: '9px', fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{icon} {label}</div>
        <div style={{ fontSize: '22px', fontWeight: 800, color: valueColor || G, lineHeight: 1.1, marginBottom: '4px' }}>{value}</div>
        <div style={{ fontSize: '10px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Análisis de Creativos" subtitle={`${rows.length} anuncios · ${label} · ordenados por gasto`} />
        <main style={{ padding: '20px', maxWidth: '1700px' }}>

          {/* Range selector */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <Suspense fallback={null}><RangeSelector /></Suspense>
          </div>

          {/* ── Semáforo resumen ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: '🚀 Escalar',  count: scoreCount.escalar, color: G, bg: '#22C55E15' },
              { label: '✅ Bueno',    count: scoreCount.bueno,   color: G, bg: '#22C55E10' },
              { label: '🟡 OK',       count: scoreCount.ok,      color: Y, bg: '#F59E0B15' },
              { label: '⛔ Revisar',  count: scoreCount.revisar, color: R, bg: '#EF444415' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: s.bg, border: `1px solid ${s.color}30`, borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '11px', color: s.color, fontWeight: 700, marginBottom: '6px' }}>{s.label}</div>
                <div style={{ fontSize: '30px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</div>
                <div style={{ fontSize: '10px', color: M, marginTop: '3px' }}>anuncios</div>
              </div>
            ))}
          </div>

          {/* ── Scoreboard ───────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {bestRoas  && <ScoreCard icon="📈" label="Mejor ROAS"   name={bestRoas.name}  value={`${bestRoas.t.roas.toFixed(2)}x`}  valueColor={roasColor(bestRoas.t.roas)} />}
            {bestCpa   && <ScoreCard icon="💰" label="Menor CPA"    name={bestCpa.name}   value={formatCurrency(bestCpa.t.cpa, currency)}  valueColor={cpaColor(bestCpa.t.cpa)} />}
            {bestSales && <ScoreCard icon="🛒" label="Más ventas"   name={bestSales.name} value={`${bestSales.t.purchases} ventas`} valueColor={G} />}
            {bestHook  && <ScoreCard icon="🎬" label="Mejor hook"   name={bestHook.name}  value={`${bestHook.t.hook_rate.toFixed(1)}%`}   valueColor={hkColor(bestHook.t.hook_rate)} />}
          </div>

          {/* ── Tabla principal ───────────────────────────────────────────── */}
          <div style={CARD}>
            <SectionHeader icon="📊" title="Ranking de anuncios" sub="Todos los ads ordenados por gasto · semáforo automático · comparado vs período anterior" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1300px' }}>
                <thead>
                  <tr>
                    <th style={{ ...THL, minWidth: '220px', position: 'sticky', left: 0, backgroundColor: '#13151F' }}>Anuncio</th>
                    <th style={{ ...TH, width: '90px' }}>Estado</th>
                    <th style={TH}>Gasto</th>
                    <th style={TH}>ROAS</th>
                    <th style={TH}>CPA</th>
                    <th style={TH}>Ventas</th>
                    <th style={TH}>CPM</th>
                    <th style={TH}>CTR%</th>
                    <th style={{ ...TH, borderLeft: '1px solid #2D3244' }}>Hook%</th>
                    <th style={TH}>Hold%</th>
                    <th style={TH}>ThruPlay</th>
                    <th style={{ ...TH, borderLeft: '1px solid #2D3244' }}>Frec.</th>
                    <th style={{ ...TH, borderLeft: '1px solid #2D3244' }}>vs ant.</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Totales */}
                  {totals && (
                    <tr>
                      <td style={{ ...TFL, position: 'sticky', left: 0 }}>Total / Promedio</td>
                      <td style={TF}></td>
                      <td style={TF}>{formatCurrency(totals.spend, currency)}</td>
                      <td style={{ ...TF, color: roasColor(totals.roas) }}>{totals.roas ? `${totals.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...TF, color: cpaColor(totals.cpa) }}>{totals.cpa ? formatCurrency(totals.cpa, currency) : '—'}</td>
                      <td style={{ ...TF, color: totals.purchases > 0 ? G : M }}>{totals.purchases || '—'}</td>
                      <td style={TF}>{totals.cpm ? formatCurrency(totals.cpm, currency) : '—'}</td>
                      <td style={TF}>{totals.ctr ? `${totals.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ ...TF, borderLeft: '1px solid #2D3244', color: hkColor(totals.hook_rate) }}>{totals.hook_rate ? `${totals.hook_rate.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...TF, color: hlColor(totals.hold_rate) }}>{totals.hold_rate ? `${totals.hold_rate.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...TF, color: tpColor(totals.thruplay_rate) }}>{totals.thruplay_rate ? `${totals.thruplay_rate.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...TF, borderLeft: '1px solid #2D3244', color: freqColor(totals.frequency) }}>{totals.frequency ? totals.frequency.toFixed(1) : '—'}</td>
                      <td style={{ ...TF, borderLeft: '1px solid #2D3244' }}>—</td>
                    </tr>
                  )}

                  {rows.map((row: any) => {
                    const t = row.t
                    const p = row.p
                    const roasPct = pctFmt(t?.roas, p?.roas)
                    const cpaPct  = pctFmt(t?.cpa,  p?.cpa, true)
                    const isActive = row.status === 'ACTIVE'
                    return (
                      <tr key={row.id} style={{ opacity: isActive ? 1 : 0.55, backgroundColor: 'transparent' }} className="tr-hover">
                        <td style={{ ...TDL, position: 'sticky', left: 0, backgroundColor: '#1A1D27' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap', color: row.score.color, backgroundColor: row.score.bg, border: `1px solid ${row.score.border}`, marginTop: '1px', flexShrink: 0 }}>
                              {row.score.label}
                            </span>
                            <div>
                              <div style={{ color: TEXT, fontSize: '11px', fontWeight: 500, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{row.name}</div>
                              <div style={{ color: M, fontSize: '9px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{row.campName}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' as const }}>
                          <span style={{ fontSize: '9px', color: isActive ? G : M, fontWeight: 600 }}>
                            {isActive ? '● Activo' : '⏸ Pausado'}
                          </span>
                        </td>
                        <td style={{ ...TD, color: TEXT, fontWeight: 600 }}>{t ? formatCurrency(t.spend, currency) : '—'}</td>
                        <td style={{ ...TD, color: roasColor(t?.roas ?? null) }}>{t?.roas ? `${t.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...TD, color: cpaColor(t?.cpa ?? null), fontWeight: 600 }}>{t?.cpa ? formatCurrency(t.cpa, currency) : t?.spend ? <span style={{ color: R }}>Sin ventas</span> : '—'}</td>
                        <td style={{ ...TD, color: (t?.purchases || 0) > 0 ? G : M, fontWeight: 600 }}>{t?.purchases || '—'}</td>
                        <td style={{ ...TD, color: M }}>{t?.cpm ? formatCurrency(t.cpm, currency) : '—'}</td>
                        <td style={{ ...TD, color: M }}>{t?.ctr ? `${t.ctr.toFixed(2)}%` : '—'}</td>
                        <td style={{ ...TD, borderLeft: '1px solid #2D3244', color: hkColor(t?.hook_rate ?? null) }}>{t?.hook_rate ? `${t.hook_rate.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...TD, color: hlColor(t?.hold_rate ?? null) }}>{t?.hold_rate ? `${t.hold_rate.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...TD, color: tpColor(t?.thruplay_rate ?? null) }}>{t?.thruplay_rate ? `${t.thruplay_rate.toFixed(1)}%` : '—'}</td>
                        <td style={{ ...TD, borderLeft: '1px solid #2D3244', color: freqColor(t?.frequency ?? null), fontWeight: (t?.frequency || 0) > 3 ? 700 : 400 }}>
                          {t?.frequency ? t.frequency.toFixed(1) : '—'}
                          {(t?.frequency || 0) > 3.5 && <span style={{ color: R, fontSize: '8px', marginLeft: '2px' }}>▲</span>}
                        </td>
                        <td style={{ ...TD, borderLeft: '1px solid #2D3244' }}>
                          {p ? (
                            <div>
                              <div style={{ color: roasPct.color, fontSize: '10px', fontWeight: 600 }}>{roasPct.text} ROAS</div>
                              <div style={{ color: cpaPct.color, fontSize: '10px' }}>{cpaPct.text} CPA</div>
                            </div>
                          ) : <span style={{ color: M }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Embudo de conversión ──────────────────────────────────────── */}
          {topFunnel.length > 0 && (
            <div style={CARD}>
              <SectionHeader icon="🔽" title="Embudo de conversión — top anuncios" sub="Dónde pierde cada anuncio: problema de creativo (hook/hold bajo) vs problema de landing (ATC/conv bajo)" />
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {topFunnel.map((row: any) => {
                  const t = row.t
                  if (!t) return null
                  const imp = t.impressions || 0
                  const v3s = t.hook_rate ? imp * t.hook_rate / 100 : (t.video_3s_views || 0)
                  const lc  = t.link_clicks || 0
                  const lpv = t.landing_page_views || 0
                  const atc = t.add_to_cart || 0
                  const pur = t.purchases || 0

                  const pct = (n: number) => imp > 0 ? Math.max(2, (n / imp) * 100) : 0

                  const steps = [
                    { label: 'Impr.', value: imp,  pctW: 100, color: '#6366F1', fmt: formatNumber },
                    { label: '3s view', value: Math.round(v3s), pctW: pct(v3s), color: hkColor(t.hook_rate), fmt: formatNumber, rate: t.hook_rate ? `Hook ${t.hook_rate.toFixed(1)}%` : null },
                    { label: 'Click', value: lc,  pctW: pct(lc),  color: '#818CF8', fmt: formatNumber, rate: lc && imp ? `CTR ${(lc/imp*100).toFixed(1)}%` : null },
                    { label: 'LP View', value: lpv, pctW: pct(lpv), color: Y, fmt: formatNumber, rate: t.traf_ef ? `Tráf. ${t.traf_ef.toFixed(0)}%` : null },
                    { label: 'ATC', value: atc, pctW: pct(atc), color: '#FB923C', fmt: formatNumber, rate: t.atc_rate ? `${t.atc_rate.toFixed(1)}%` : null },
                    { label: 'Compra', value: pur, pctW: pct(pur), color: G, fmt: (v: number) => String(v), rate: t.conv_web ? `Conv ${t.conv_web.toFixed(1)}%` : null },
                  ]

                  return (
                    <div key={row.id} style={{ backgroundColor: '#13151F', borderRadius: '8px', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, color: row.score.color, backgroundColor: row.score.bg, border: `1px solid ${row.score.border}` }}>
                          {row.score.label}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{row.name}</span>
                        <span style={{ fontSize: '10px', color: M }}>{formatCurrency(t.spend, currency)} gastado</span>
                        {t.roas && <span style={{ fontSize: '11px', fontWeight: 700, color: roasColor(t.roas) }}>ROAS {t.roas.toFixed(2)}x</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        {steps.map((s, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <div style={{ width: '100%', backgroundColor: '#1A1D27', borderRadius: '3px', height: '48px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                              <div style={{ width: '100%', height: `${s.pctW}%`, backgroundColor: s.color, borderRadius: '3px', transition: 'height 0.3s', minHeight: s.value > 0 ? '3px' : 0 }} />
                            </div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: s.color }}>{s.value > 0 ? s.fmt(s.value) : '—'}</div>
                            <div style={{ fontSize: '9px', color: M }}>{s.label}</div>
                            {s.rate && <div style={{ fontSize: '8px', color: '#4A5268', textAlign: 'center' }}>{s.rate}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Detector de fatiga ────────────────────────────────────────── */}
          {fatigueAds.length > 0 && (
            <div style={CARD}>
              <SectionHeader icon="😴" title="Detector de fatiga creativa" sub="Ads activos con frecuencia ≥ 2.5 — audiencia sobreexpuesta, CTR en riesgo de caer" />
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {fatigueAds.map((row: any) => {
                  const t = row.t
                  const level = (t?.frequency || 0) >= 3.5 ? { label: 'Fatiga alta', color: R, bg: '#EF444415', border: '#EF444440' }
                              : { label: 'Fatiga media', color: Y, bg: '#F59E0B15', border: '#F59E0B40' }
                  return (
                    <div key={row.id} style={{ backgroundColor: level.bg, border: `1px solid ${level.border}`, borderRadius: '8px', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: level.color }}>{level.label}</span>
                        <span style={{ fontSize: '20px', fontWeight: 800, color: level.color }}>{t?.frequency?.toFixed(1)}x</span>
                      </div>
                      <div style={{ fontSize: '10px', color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginBottom: '6px' }}>{row.name}</div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '10px' }}>
                        <span style={{ color: hkColor(t?.hook_rate ?? null) }}>Hook {t?.hook_rate?.toFixed(1) ?? '—'}%</span>
                        <span style={{ color: M }}>·</span>
                        <span style={{ color: M }}>CTR {t?.ctr?.toFixed(2) ?? '—'}%</span>
                        <span style={{ color: M }}>·</span>
                        <span style={{ color: cpaColor(t?.cpa ?? null) }}>CPA {t?.cpa ? formatCurrency(t.cpa, currency) : '—'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Leyenda ───────────────────────────────────────────────────── */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', fontSize: '11px', color: M }}>
              <div>
                <div style={{ fontWeight: 700, color: '#94A3B8', marginBottom: '8px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Semáforo</div>
                {[
                  { s: '🚀 Escalar', d: 'ROAS ≥ 3.5x + CPA ≤ $7', c: G },
                  { s: '✅ Bueno',   d: 'CPA ≤ $7',                c: G },
                  { s: '🟡 OK',      d: 'ROAS ≥ 1.5x',             c: Y },
                  { s: '⬇ Bajar',   d: 'CPA $15–$22',             c: R },
                  { s: '⛔ Pausar',  d: '>$50 sin ventas o CPA>$22',c: R },
                  { s: '😴 Fatiga',  d: 'Frecuencia > 3.5x',       c: Y },
                ].map(({ s, d, c }) => (
                  <div key={s} style={{ marginBottom: '4px', display: 'flex', gap: '5px' }}>
                    <span style={{ color: c, fontWeight: 600, whiteSpace: 'nowrap' }}>{s}</span>
                    <span style={{ color: '#4A5268' }}>— {d}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#94A3B8', marginBottom: '8px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Creativos</div>
                {[
                  { m: 'Hook Rate',   d: '≥30% excelente · ≥15% ok · <15% cambiar' },
                  { m: 'Hold Rate',   d: '≥50% excelente · ≥30% ok · <30% revisar' },
                  { m: 'ThruPlay%',  d: '≥15% excelente · ≥8% ok · <8% problema' },
                  { m: 'Frecuencia', d: '<2.5 ok · 2.5–3.5 atención · >3.5 fatiga' },
                ].map(({ m, d }) => (
                  <div key={m} style={{ marginBottom: '4px' }}>
                    <span style={{ color: TEXT, fontWeight: 500 }}>{m}</span>
                    <span style={{ color: '#4A5268' }}> — {d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
