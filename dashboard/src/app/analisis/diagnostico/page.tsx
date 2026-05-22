import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'
import { notFound } from 'next/navigation'

// ── Design tokens ──────────────────────────────────────────────────────────
const GREEN  = '#22C55E'
const YELLOW = '#F59E0B'
const RED    = '#EF4444'
const MUTED  = '#64748B'
const BORDER = '#2D3244'
const SURFACE = '#1A1D27'
const PRIMARY = '#6366F1'
const TEXT = '#F1F5F9'

// ── Helpers ────────────────────────────────────────────────────────────────
function deltaColor(val: number | null, invert = false) {
  if (val === null) return MUTED
  const good = invert ? val < 0 : val > 0
  return good ? GREEN : RED
}

function deltaPct(a: number | null, b: number | null): number | null {
  if (!b || !a) return null
  return ((a - b) / b) * 100
}

function fmtDelta(v: number | null) {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function hookColor(v: number | null) {
  if (!v) return MUTED
  return v >= 30 ? GREEN : v >= 15 ? YELLOW : RED
}

function holdColor(v: number | null) {
  if (!v) return MUTED
  return v >= 50 ? GREEN : v >= 30 ? YELLOW : RED
}

function thruplayColor(v: number | null) {
  if (!v) return MUTED
  return v >= 15 ? GREEN : v >= 8 ? YELLOW : RED
}

// Aggregate an array of metric rows into a single object
function aggMetrics(rows: any[]) {
  const base = rows.reduce((acc, m) => ({
    spend:              acc.spend              + (m.spend              || 0),
    purchases:          acc.purchases          + (m.purchases          || 0),
    purchase_value:     acc.purchase_value     + (m.purchase_value     || 0),
    impressions:        acc.impressions        + (m.impressions        || 0),
    link_clicks:        acc.link_clicks        + (m.link_clicks        || 0),
    unique_link_clicks: acc.unique_link_clicks + (m.unique_link_clicks || 0),
    reach:              acc.reach              + (m.reach              || 0),
    landing_page_views: acc.landing_page_views + (m.landing_page_views || 0),
    add_to_cart:        acc.add_to_cart        + (m.add_to_cart        || 0),
    checkout_initiated: acc.checkout_initiated + (m.checkout_initiated || 0),
    video_3s_views:     acc.video_3s_views     + (m.video_3s_views     || 0),
    video_thruplay:     acc.video_thruplay     + (m.video_thruplay     || 0),
    hook_rate_w:        acc.hook_rate_w        + ((m.hook_rate || 0) * (m.impressions || 0)),
    hold_rate_w:        acc.hold_rate_w        + ((m.hold_rate || 0) * (m.video_3s_views || 0)),
    thruplay_rate_w:    acc.thruplay_rate_w    + ((m.thruplay_rate || 0) * (m.impressions || 0)),
    ctr_post_view_w:    acc.ctr_post_view_w    + ((m.ctr_post_view || 0) * (m.video_3s_views || 0)),
    frequency_w:        acc.frequency_w        + ((m.frequency || 0) * (m.impressions || 0)),
  }), {
    spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
    link_clicks: 0, unique_link_clicks: 0, reach: 0,
    landing_page_views: 0, add_to_cart: 0, checkout_initiated: 0,
    video_3s_views: 0, video_thruplay: 0,
    hook_rate_w: 0, hold_rate_w: 0, thruplay_rate_w: 0, ctr_post_view_w: 0, frequency_w: 0,
  })

  const imp = base.impressions || 1
  const v3s = base.video_3s_views || 1

  return {
    ...base,
    roas:          base.spend > 0 ? base.purchase_value / base.spend : null,
    cpa:           base.purchases > 0 ? base.spend / base.purchases : null,
    ctr:           base.reach > 0 ? base.unique_link_clicks / base.reach * 100 : null,
    cpm:           base.impressions > 0 ? base.spend / base.impressions * 1000 : null,
    cpc:           base.link_clicks > 0 ? base.spend / base.link_clicks : null,
    trafEf:        base.link_clicks > 0 && base.landing_page_views > 0 ? base.landing_page_views / base.link_clicks * 100 : null,
    convWeb:       base.landing_page_views > 0 && base.purchases > 0 ? base.purchases / base.landing_page_views * 100 : null,
    hook_rate:     base.impressions > 0 ? base.hook_rate_w / imp : null,
    hold_rate:     base.video_3s_views > 0 ? base.hold_rate_w / v3s : null,
    thruplay_rate: base.impressions > 0 ? base.thruplay_rate_w / imp : null,
    ctr_post_view: base.video_3s_views > 0 ? base.ctr_post_view_w / v3s : null,
    frequency:     base.impressions > 0 ? base.frequency_w / imp : null,
  }
}

// ── Root cause diagnosis ───────────────────────────────────────────────────
function diagnose(a: any, b: any): { stage: string; icon: string; text: string; color: string }[] {
  const findings: { stage: string; icon: string; text: string; color: string }[] = []
  if (!a || !b) return findings

  const dImpr   = deltaPct(a.impressions, b.impressions)
  const dReach  = deltaPct(a.reach, b.reach)
  const dHook   = deltaPct(a.hook_rate, b.hook_rate)
  const dHold   = deltaPct(a.hold_rate, b.hold_rate)
  const dTrafEf = deltaPct(a.trafEf, b.trafEf)
  const dConvW  = deltaPct(a.convWeb, b.convWeb)
  const dCpa    = deltaPct(a.cpa, b.cpa)
  const dRoas   = deltaPct(a.roas, b.roas)
  const dSpend  = deltaPct(a.spend, b.spend)
  const dFreq   = deltaPct(a.frequency, b.frequency)
  const dCpm    = deltaPct(a.cpm, b.cpm)

  // 1. Alcance / distribución
  if (dImpr !== null && dImpr < -20) {
    findings.push({ stage: 'Alcance', icon: '📡', color: RED, text: `Impresiones cayeron ${Math.abs(dImpr).toFixed(0)}%. Meta distribuyó menos el ad — puede ser presupuesto, audiencia saturada o puja baja.` })
  } else if (dCpm !== null && dCpm > 25) {
    findings.push({ stage: 'Costo distribución', icon: '💸', color: YELLOW, text: `CPM subió ${dCpm.toFixed(0)}% — la subasta se puso más cara. El gasto fue similar pero con menos alcance.` })
  }

  // 2. Hook / creativo
  if (dHook !== null && dHook < -15) {
    findings.push({ stage: 'Creativo — Hook', icon: '🎬', color: RED, text: `Hook Rate cayó ${Math.abs(dHook).toFixed(0)}%. El primer segundo no engancha al mismo nivel. Revisar apertura del video.` })
  } else if (dHook !== null && dHook > 15 && (dConvW === null || dConvW < 0)) {
    findings.push({ stage: 'Creativo — Hook ok', icon: '✅', color: GREEN, text: `Hook Rate mejoró ${dHook.toFixed(0)}% — el video engancha bien. El problema no está en la apertura.` })
  }

  // 3. Retención
  if (dHold !== null && dHold < -20) {
    findings.push({ stage: 'Creativo — Cuerpo del video', icon: '📉', color: RED, text: `Hold Rate cayó ${Math.abs(dHold).toFixed(0)}%. Los usuarios se van antes de la mitad del video — revisar desarrollo y CTA intermedio.` })
  }

  // 4. Tráfico efectivo
  if (dTrafEf !== null && dTrafEf < -15) {
    findings.push({ stage: 'Tráfico', icon: '🌐', color: RED, text: `Tráfico efectivo (clics → LP) cayó ${Math.abs(dTrafEf).toFixed(0)}%. La landing tardó en cargar o hubo problema técnico.` })
  }

  // 5. Conversión web
  if (dConvW !== null && dConvW < -20) {
    findings.push({ stage: 'Conversión web', icon: '🛒', color: RED, text: `Tasa de conversión web cayó ${Math.abs(dConvW).toFixed(0)}%. Los visitantes llegan pero no compran — revisar precio, stock o proceso de pago.` })
  }

  // 6. Frecuencia alta
  if (dFreq !== null && dFreq > 30 && a.frequency && a.frequency > 2.5) {
    findings.push({ stage: 'Fatiga de audiencia', icon: '😴', color: YELLOW, text: `Frecuencia subió ${dFreq.toFixed(0)}% (llega a ${a.frequency.toFixed(1)}x). La audiencia ya vio el ad demasiadas veces — ampliar audiencia o rotar creativos.` })
  }

  // 7. Positivos
  if (dRoas !== null && dRoas > 20) {
    findings.push({ stage: 'ROAS', icon: '🟢', color: GREEN, text: `ROAS mejoró ${dRoas.toFixed(0)}%. El día analizado fue más rentable que la referencia.` })
  }
  if (dCpa !== null && dCpa < -20) {
    findings.push({ stage: 'CPA', icon: '🟢', color: GREEN, text: `CPA bajó ${Math.abs(dCpa).toFixed(0)}% — se consiguieron ventas más baratas.` })
  }

  if (findings.length === 0) {
    findings.push({ stage: 'Sin diferencias claras', icon: '🔍', color: MUTED, text: 'No se detectan cambios significativos (>15%) entre los dos días. Los días son similares en rendimiento.' })
  }

  return findings
}

// ── DeltaCell helper ───────────────────────────────────────────────────────
function DeltaCell({ a, b, fmt, invert = false }: {
  a: number | null; b: number | null
  fmt: (v: number) => string
  invert?: boolean
}) {
  const d = deltaPct(a, b)
  const color = d !== null ? deltaColor(d, invert) : MUTED
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: a ? TEXT : MUTED }}>{a != null ? fmt(a) : '—'}</span>
      {d !== null && (
        <span style={{ fontSize: 10, color, fontWeight: 600 }}>{fmtDelta(d)}</span>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function DiagnosticoPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  await headers()
  const sp = await searchParams

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()

  // Generar últimos 14 días disponibles
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayMs - i * 86400000)
    return d.toISOString().split('T')[0]
  })

  // Días seleccionados (defaults: hoy y ayer)
  const dayA = sp?.a && last14.includes(sp.a) ? sp.a : last14[0]
  const dayB = sp?.b && last14.includes(sp.b) ? sp.b : last14[1]

  const [accountRes, campRes, campaignsRes, adSetsRes, adsRes, mA_camp, mB_camp, mA_adset, mB_adset, mA_ad, mB_ad] = await Promise.all([
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
    supabaseAdmin.from('campaigns').select('id,name,status'),
    supabaseAdmin.from('ad_sets').select('id,name,campaign_id'),
    supabaseAdmin.from('ads').select('id,name,ad_set_id'),
    supabaseAdmin.from('ads').select('id,name,ad_set_id'),
    // Campaign metrics for day A and B
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', dayB),
    // Ad set metrics
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', dayB),
    // Ad metrics
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').eq('date', dayB),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const campMeta = new Map((campRes.data || []).map((c: any) => [c.id, c]))
  const adSetMeta = new Map((adSetsRes.data || []).map((s: any) => [s.id, s]))
  const adMeta = new Map((adsRes.data || []).map((a: any) => [a.id, a]))

  // Account-level aggregates
  const accA = aggMetrics(mA_camp.data || [])
  const accB = aggMetrics(mB_camp.data || [])

  // Campaign breakdown
  const allCampIds = new Set([
    ...(mA_camp.data || []).map((m: any) => m.object_id),
    ...(mB_camp.data || []).map((m: any) => m.object_id),
  ])

  const campRows = Array.from(allCampIds).map(id => {
    const rowsA = (mA_camp.data || []).filter((m: any) => m.object_id === id)
    const rowsB = (mB_camp.data || []).filter((m: any) => m.object_id === id)
    return {
      id,
      meta: campMeta.get(id) as any,
      a: rowsA.length ? aggMetrics(rowsA) : null,
      b: rowsB.length ? aggMetrics(rowsB) : null,
    }
  }).sort((x, y) => (y.a?.spend || 0) - (x.a?.spend || 0))

  // Ad-level breakdown (top 10 by combined spend)
  const allAdIds = new Set([
    ...(mA_ad.data || []).map((m: any) => m.object_id),
    ...(mB_ad.data || []).map((m: any) => m.object_id),
  ])

  const adRows = Array.from(allAdIds).map(id => {
    const rowsA = (mA_ad.data || []).filter((m: any) => m.object_id === id)
    const rowsB = (mB_ad.data || []).filter((m: any) => m.object_id === id)
    const a = rowsA.length ? aggMetrics(rowsA) : null
    const b = rowsB.length ? aggMetrics(rowsB) : null
    const adInfo = adMeta.get(id) as any
    const adSetInfo = adInfo?.ad_set_id ? adSetMeta.get(adInfo.ad_set_id) as any : null
    const campId = adSetInfo?.campaign_id
    const campInfo = campId ? campMeta.get(campId) as any : null
    return { id, adInfo, campName: campInfo?.name, a, b }
  })
    .filter(r => (r.a?.spend || 0) + (r.b?.spend || 0) > 0)
    .sort((x, y) => ((y.a?.spend || 0) + (y.b?.spend || 0)) - ((x.a?.spend || 0) + (x.b?.spend || 0)))
    .slice(0, 15)

  // Root cause diagnosis
  const findings = diagnose(accA, accB)

  // Day A is better or worse?
  const aIsBetter = (accA.roas || 0) >= (accB.roas || 0)

  const thStyle: any = {
    padding: '7px 10px', fontSize: 10, fontWeight: 600, color: MUTED,
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820',
    textAlign: 'right' as const,
  }
  const tdStyle: any = {
    padding: '8px 10px', fontSize: 11,
    borderBottom: `1px solid ${BORDER}`,
    textAlign: 'right' as const, color: '#94A3B8',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header
          title="Diagnóstico de Día"
          subtitle="Compará dos días para entender qué causó la diferencia"
        />
        <main style={{ padding: '20px 16px', maxWidth: 1400 }}>

          {/* ── Breadcrumb ── */}
          <div style={{ marginBottom: 20, fontSize: 12, color: MUTED }}>
            <Link href="/analisis" style={{ color: PRIMARY, textDecoration: 'none' }}>← Análisis</Link>
            <span style={{ marginLeft: 8 }}>· Diagnóstico</span>
          </div>

          {/* ── Day selectors ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Day A */}
            <div style={{ backgroundColor: SURFACE, border: `2px solid ${aIsBetter ? GREEN : RED}30`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: aIsBetter ? GREEN : RED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {aIsBetter ? '🟢' : '🔴'} Día A — {aIsBetter ? 'mejor' : 'peor'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {last14.map(d => (
                  <a
                    key={d}
                    href={`?a=${d}&b=${dayB}`}
                    style={{
                      padding: '3px 8px', borderRadius: 5, fontSize: 11, textDecoration: 'none',
                      backgroundColor: d === dayA ? (aIsBetter ? '#22C55E20' : '#EF444420') : 'transparent',
                      color: d === dayA ? (aIsBetter ? GREEN : RED) : MUTED,
                      border: `1px solid ${d === dayA ? (aIsBetter ? '#22C55E50' : '#EF444450') : BORDER}`,
                      fontWeight: d === dayA ? 700 : 400,
                    }}
                  >
                    {formatDate(d)}{d === today ? ' (hoy)' : ''}
                  </a>
                ))}
              </div>
            </div>
            {/* Day B */}
            <div style={{ backgroundColor: SURFACE, border: `2px solid ${!aIsBetter ? GREEN : RED}30`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: !aIsBetter ? GREEN : RED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {!aIsBetter ? '🟢' : '🔴'} Día B — {!aIsBetter ? 'mejor' : 'peor'} · referencia
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {last14.map(d => (
                  <a
                    key={d}
                    href={`?a=${dayA}&b=${d}`}
                    style={{
                      padding: '3px 8px', borderRadius: 5, fontSize: 11, textDecoration: 'none',
                      backgroundColor: d === dayB ? (!aIsBetter ? '#22C55E20' : '#EF444420') : 'transparent',
                      color: d === dayB ? (!aIsBetter ? GREEN : RED) : MUTED,
                      border: `1px solid ${d === dayB ? (!aIsBetter ? '#22C55E50' : '#EF444450') : BORDER}`,
                      fontWeight: d === dayB ? 700 : 400,
                    }}
                  >
                    {formatDate(d)}{d === today ? ' (hoy)' : ''}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── Account KPIs comparación ── */}
          <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 14 }}>
              Cuenta — {formatDate(dayA)} vs {formatDate(dayB)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Ventas',      a: accA.purchases,       b: accB.purchases,       fmt: (v: number) => String(Math.round(v)) },
                { label: 'ROAS',        a: accA.roas,            b: accB.roas,            fmt: (v: number) => `${v.toFixed(2)}x` },
                { label: 'CPA',         a: accA.cpa,             b: accB.cpa,             fmt: (v: number) => formatCurrency(v, currency), invert: true },
                { label: 'Gasto',       a: accA.spend,           b: accB.spend,           fmt: (v: number) => formatCurrency(v, currency) },
                { label: 'Impresiones', a: accA.impressions,     b: accB.impressions,     fmt: (v: number) => formatNumber(Math.round(v)) },
                { label: 'Hook Rate',   a: accA.hook_rate,       b: accB.hook_rate,       fmt: (v: number) => `${v.toFixed(1)}%` },
                { label: 'CTR único',   a: accA.ctr,             b: accB.ctr,             fmt: (v: number) => `${v.toFixed(2)}%` },
                { label: 'Conv. web',   a: accA.convWeb,         b: accB.convWeb,         fmt: (v: number) => `${v.toFixed(1)}%` },
              ].map(kpi => {
                const d = deltaPct(kpi.a, kpi.b)
                const color = d !== null ? deltaColor(d, kpi.invert) : MUTED
                return (
                  <div key={kpi.label} style={{ backgroundColor: '#0F1117', borderRadius: 8, padding: '10px 12px', border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: kpi.a != null ? TEXT : MUTED }}>
                      {kpi.a != null ? kpi.fmt(kpi.a) : '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                      {d !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>{fmtDelta(d)}</span>
                      )}
                      <span style={{ fontSize: 10, color: MUTED }}>
                        ref: {kpi.b != null ? kpi.fmt(kpi.b) : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Diagnóstico automático ── */}
          <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>🔍 ¿Qué causó la diferencia?</span>
              <span style={{ fontSize: 10, color: MUTED }}>análisis automático</span>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {findings.map((f, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  backgroundColor: '#0F1117',
                  borderRadius: 8,
                  borderLeft: `3px solid ${f.color}`,
                  border: `1px solid ${f.color}25`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{f.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: f.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.stage}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.6 }}>{f.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Funnel comparación ── */}
          <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>📊 Funnel — dónde se pierde el tráfico</span>
            </div>
            <div style={{ padding: 16 }}>
              {[
                { label: 'Impresiones',  a: accA.impressions,        b: accB.impressions,        fmt: (v: number) => formatNumber(Math.round(v)) },
                { label: 'Alcance',      a: accA.reach,              b: accB.reach,              fmt: (v: number) => formatNumber(Math.round(v)) },
                { label: 'Clics únicos', a: accA.unique_link_clicks, b: accB.unique_link_clicks, fmt: (v: number) => formatNumber(Math.round(v)) },
                { label: 'Visitas LP',   a: accA.landing_page_views, b: accB.landing_page_views, fmt: (v: number) => formatNumber(Math.round(v)) },
                { label: 'ATC',          a: accA.add_to_cart,        b: accB.add_to_cart,        fmt: (v: number) => String(Math.round(v)) },
                { label: 'Pagos inic.',  a: accA.checkout_initiated, b: accB.checkout_initiated, fmt: (v: number) => String(Math.round(v)) },
                { label: 'Ventas',       a: accA.purchases,          b: accB.purchases,          fmt: (v: number) => String(Math.round(v)) },
              ].map((step, idx, arr) => {
                const maxVal = Math.max(step.a || 0, step.b || 0, 1)
                const wA = ((step.a || 0) / maxVal) * 100
                const wB = ((step.b || 0) / maxVal) * 100
                const d = deltaPct(step.a, step.b)
                const color = d !== null ? deltaColor(d) : MUTED
                return (
                  <div key={step.label} style={{ marginBottom: idx < arr.length - 1 ? 10 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: MUTED, width: 80, flexShrink: 0, textAlign: 'right' as const }}>{step.label}</span>
                      <div style={{ flex: 1, position: 'relative', height: 18 }}>
                        {/* Bar B (referencia) */}
                        <div style={{
                          position: 'absolute', top: 4, left: 0,
                          width: `${wB}%`, height: 10,
                          backgroundColor: 'rgba(100,116,139,0.25)', borderRadius: 5,
                        }} />
                        {/* Bar A */}
                        <div style={{
                          position: 'absolute', top: 4, left: 0,
                          width: `${wA}%`, height: 10,
                          backgroundColor: d !== null && d >= 0 ? '#22C55E60' : '#EF444460',
                          borderRadius: 5,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: TEXT, width: 64, textAlign: 'right' as const, flexShrink: 0 }}>
                        {step.a != null ? step.fmt(step.a) : '—'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color, width: 44, textAlign: 'right' as const, flexShrink: 0 }}>
                        {d !== null ? fmtDelta(d) : '—'}
                      </span>
                      <span style={{ fontSize: 10, color: MUTED, width: 56, flexShrink: 0 }}>
                        ref: {step.b != null ? step.fmt(step.b) : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Por campaña ── */}
          {campRows.length > 0 && (
            <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>🗂 Por campaña</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left' as const, minWidth: 180 }}>Campaña</th>
                      <th style={thStyle}>Ventas A</th>
                      <th style={thStyle}>Ventas B</th>
                      <th style={thStyle}>Δ Ventas</th>
                      <th style={thStyle}>ROAS A</th>
                      <th style={thStyle}>ROAS B</th>
                      <th style={thStyle}>Gasto A</th>
                      <th style={thStyle}>Hook A</th>
                      <th style={thStyle}>Hook B</th>
                      <th style={thStyle}>Δ Hook</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campRows.map(row => {
                      const dV = deltaPct(row.a?.purchases ?? null, row.b?.purchases ?? null)
                      const dR = deltaPct(row.a?.roas ?? null, row.b?.roas ?? null)
                      const dH = deltaPct(row.a?.hook_rate ?? null, row.b?.hook_rate ?? null)
                      return (
                        <tr key={row.id}>
                          <td style={{ ...tdStyle, textAlign: 'left' as const }}>
                            <Link href={`/campaigns/${row.id}`} style={{ color: PRIMARY, textDecoration: 'none', fontWeight: 500 }}>
                              {row.meta?.name || row.id}
                            </Link>
                          </td>
                          <td style={{ ...tdStyle, color: row.a?.purchases ? GREEN : MUTED, fontWeight: 600 }}>
                            {row.a?.purchases != null ? Math.round(row.a.purchases) : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: MUTED }}>
                            {row.b?.purchases != null ? Math.round(row.b.purchases) : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: dV !== null ? deltaColor(dV) : MUTED, fontWeight: 600 }}>
                            {fmtDelta(dV)}
                          </td>
                          <td style={{ ...tdStyle, color: roasColor(row.a?.roas ?? null) }}>
                            {row.a?.roas ? `${row.a.roas.toFixed(2)}x` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: MUTED }}>
                            {row.b?.roas ? `${row.b.roas.toFixed(2)}x` : '—'}
                          </td>
                          <td style={tdStyle}>{row.a?.spend ? formatCurrency(row.a.spend, currency) : '—'}</td>
                          <td style={{ ...tdStyle, color: hookColor(row.a?.hook_rate ?? null) }}>
                            {row.a?.hook_rate ? `${row.a.hook_rate.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: MUTED }}>
                            {row.b?.hook_rate ? `${row.b.hook_rate.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: dH !== null ? deltaColor(dH) : MUTED, fontWeight: 600 }}>
                            {fmtDelta(dH)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Por ad ── */}
          {adRows.length > 0 && (
            <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>🎬 Por ad — top 15 por gasto combinado</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left' as const, minWidth: 160 }}>Ad</th>
                      <th style={{ ...thStyle, textAlign: 'left' as const, minWidth: 120 }}>Campaña</th>
                      <th style={thStyle}>Gasto A</th>
                      <th style={thStyle}>ROAS A</th>
                      <th style={thStyle}>Δ ROAS</th>
                      <th style={thStyle}>Hook A</th>
                      <th style={thStyle}>Δ Hook</th>
                      <th style={thStyle}>Hold A</th>
                      <th style={thStyle}>Ventas A</th>
                      <th style={thStyle}>Ventas B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adRows.map(row => {
                      const dR = deltaPct(row.a?.roas ?? null, row.b?.roas ?? null)
                      const dH = deltaPct(row.a?.hook_rate ?? null, row.b?.hook_rate ?? null)
                      return (
                        <tr key={row.id}>
                          <td style={{ ...tdStyle, textAlign: 'left' as const }}>
                            <Link href={`/ads/${row.id}`} style={{ color: TEXT, textDecoration: 'none', fontWeight: 500 }}>
                              {row.adInfo?.name || row.id}
                            </Link>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'left' as const, color: MUTED }}>
                            {row.campName || '—'}
                          </td>
                          <td style={tdStyle}>{row.a?.spend ? formatCurrency(row.a.spend, currency) : '—'}</td>
                          <td style={{ ...tdStyle, color: roasColor(row.a?.roas ?? null) }}>
                            {row.a?.roas ? `${row.a.roas.toFixed(2)}x` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: dR !== null ? deltaColor(dR) : MUTED, fontWeight: 600 }}>
                            {fmtDelta(dR)}
                          </td>
                          <td style={{ ...tdStyle, color: hookColor(row.a?.hook_rate ?? null) }}>
                            {row.a?.hook_rate ? `${row.a.hook_rate.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: dH !== null ? deltaColor(dH) : MUTED, fontWeight: 600 }}>
                            {fmtDelta(dH)}
                          </td>
                          <td style={{ ...tdStyle, color: holdColor(row.a?.hold_rate ?? null) }}>
                            {row.a?.hold_rate ? `${row.a.hold_rate.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: row.a?.purchases ? GREEN : MUTED, fontWeight: 600 }}>
                            {row.a?.purchases != null ? Math.round(row.a.purchases) : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: MUTED }}>
                            {row.b?.purchases != null ? Math.round(row.b.purchases) : '—'}
                          </td>
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
