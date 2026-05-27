import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, CPA_TARGET, CPA_BREAKEVEN } from '@/lib/metrics'
import DecisionCalendar from '@/components/dashboard/DecisionCalendar'
import DiagnosticoTree from '@/components/dashboard/DiagnosticoTree'
import type { CampDiag, AsDiag, AdDiag, MetricsDiag } from '@/components/dashboard/DiagnosticoTree'

// ── Tokens ─────────────────────────────────────────────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#64748B'
const BORDER = '#2D3244', SURFACE = '#1A1D27', TEXT = '#F1F5F9'

// ── Helpers ────────────────────────────────────────────────────────────────
function dPct(a: number | null, b: number | null) {
  if (!b || a == null) return null
  return ((a - b) / b) * 100
}
function fmtD(v: number | null) {
  if (v === null) return ''
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}
function dColor(v: number | null, invert = false) {
  if (v === null) return M
  return (invert ? v < 0 : v > 0) ? G : R
}
function hkColor(v: number | null) { return !v ? M : v >= 30 ? G : v >= 15 ? Y : R }
function hlColor(v: number | null) { return !v ? M : v >= 50 ? G : v >= 30 ? Y : R }
function tpColor(v: number | null) { return !v ? M : v >= 15 ? G : v >= 8 ? Y : R }

function aggMetrics(rows: any[]) {
  if (!rows.length) return null
  const b = rows.reduce((acc, m) => ({
    spend:              acc.spend              + (m.spend              || 0),
    purchases:          acc.purchases          + (m.purchases          || 0),
    purchase_value:     acc.purchase_value     + (m.purchase_value     || 0),
    impressions:        acc.impressions        + (m.impressions        || 0),
    link_clicks:        acc.link_clicks        + (m.link_clicks        || 0),
    unique_link_clicks: acc.unique_link_clicks + (m.unique_link_clicks || 0),
    reach:              acc.reach              + (m.reach              || 0),
    landing_page_views: acc.landing_page_views + (m.landing_page_views || 0),
    add_to_cart:        acc.add_to_cart        + (m.add_to_cart        || 0),
    video_3s_views:     acc.video_3s_views     + (m.video_3s_views     || 0),
    hook_rate_w:     acc.hook_rate_w     + ((m.hook_rate      || 0) * (m.impressions     || 0)),
    hold_rate_w:     acc.hold_rate_w     + ((m.hold_rate      || 0) * (m.video_3s_views  || 0)),
    thruplay_rate_w: acc.thruplay_rate_w + ((m.thruplay_rate  || 0) * (m.impressions     || 0)),
    ctr_pv_w:        acc.ctr_pv_w        + ((m.ctr_post_view  || 0) * (m.video_3s_views  || 0)),
  }), {
    spend: 0, purchases: 0, purchase_value: 0, impressions: 0,
    link_clicks: 0, unique_link_clicks: 0, reach: 0, landing_page_views: 0,
    add_to_cart: 0, video_3s_views: 0,
    hook_rate_w: 0, hold_rate_w: 0, thruplay_rate_w: 0, ctr_pv_w: 0,
  })
  const imp = b.impressions || 1
  const v3s = b.video_3s_views || 1
  return {
    ...b,
    roas:          b.spend > 0 ? b.purchase_value / b.spend : null,
    cpa:           b.purchases > 0 ? b.spend / b.purchases : null,
    ctr:           b.reach > 0 ? b.unique_link_clicks / b.reach * 100 : null,
    cpm:           b.impressions > 0 ? b.spend / b.impressions * 1000 : null,
    trafEf:        b.link_clicks > 0 && b.landing_page_views > 0 ? b.landing_page_views / b.link_clicks * 100 : null,
    convWeb:       b.landing_page_views > 0 && b.purchases > 0 ? b.purchases / b.landing_page_views * 100 : null,
    hook_rate:     b.impressions   > 0 ? b.hook_rate_w     / imp : null,
    hold_rate:     b.video_3s_views > 0 ? b.hold_rate_w    / v3s : null,
    thruplay_rate: b.impressions   > 0 ? b.thruplay_rate_w / imp : null,
    ctr_post_view: b.video_3s_views > 0 ? b.ctr_pv_w       / v3s : null,
  }
}

function toMetricsDiag(m: any): MetricsDiag {
  if (!m) return null
  return {
    spend: m.spend || 0, purchases: m.purchases || 0, impressions: m.impressions || 0,
    roas: m.roas, cpa: m.cpa, ctr: m.ctr, cpm: m.cpm,
    hook_rate: m.hook_rate, hold_rate: m.hold_rate,
    thruplay_rate: m.thruplay_rate, ctr_post_view: m.ctr_post_view,
    landing_page_views: m.landing_page_views || 0, add_to_cart: m.add_to_cart || 0,
    trafEf: m.trafEf, convWeb: m.convWeb,
  }
}

// ── Root cause diagnosis ────────────────────────────────────────────────────
function diagnose(a: any, b: any) {
  const findings: { icon: string; text: string; color: string }[] = []
  if (!a || !b) return findings

  const dImpr = dPct(a.impressions, b.impressions)
  const dHook = dPct(a.hook_rate, b.hook_rate)
  const dHold = dPct(a.hold_rate, b.hold_rate)
  const dConvW = dPct(a.convWeb, b.convWeb)
  const dRoas = dPct(a.roas, b.roas)
  const dCpa  = dPct(a.cpa, b.cpa)
  const dCpm  = dPct(a.cpm, b.cpm)
  const dFreq = dPct(a.frequency, b.frequency)

  if (dImpr !== null && dImpr < -20)
    findings.push({ icon: '📡', color: R, text: `Impresiones cayeron ${Math.abs(dImpr).toFixed(0)}% — budget bajo o audiencia saturada.` })
  else if (dCpm !== null && dCpm > 25)
    findings.push({ icon: '💸', color: Y, text: `CPM subió ${dCpm.toFixed(0)}% — subasta más cara, mismo gasto con menos alcance.` })
  if (dHook !== null && dHook < -15)
    findings.push({ icon: '🎬', color: R, text: `Hook Rate cayó ${Math.abs(dHook).toFixed(0)}% — el primer segundo no engancha. Cambiar apertura.` })
  if (dHold !== null && dHold < -20)
    findings.push({ icon: '📉', color: R, text: `Hold Rate cayó ${Math.abs(dHold).toFixed(0)}% — cuerpo del video no retiene. Revisar desarrollo.` })
  if (dConvW !== null && dConvW < -20)
    findings.push({ icon: '🛒', color: R, text: `Conv. web cayó ${Math.abs(dConvW).toFixed(0)}% — mismo tráfico, menos compras. Revisar precio/stock/checkout.` })
  if (dFreq !== null && dFreq > 30 && a.frequency > 2.5)
    findings.push({ icon: '😴', color: Y, text: `Frecuencia ${a.frequency?.toFixed(1)}x (+${dFreq.toFixed(0)}%) — fatiga. Rotar creativos o ampliar audiencia.` })
  if (dRoas !== null && dRoas > 20)
    findings.push({ icon: '🟢', color: G, text: `ROAS mejoró ${dRoas.toFixed(0)}% — día analizado más rentable.` })
  if (dCpa !== null && dCpa < -20)
    findings.push({ icon: '🟢', color: G, text: `CPA bajó ${Math.abs(dCpa).toFixed(0)}% — ventas más baratas.` })
  if (!findings.length)
    findings.push({ icon: '🔍', color: M, text: 'No se detectan cambios significativos entre los dos días.' })
  return findings
}

// ── Day quality (para calendario) ──────────────────────────────────────────
function dayQuality(d: { spend: number; purchases: number; cpa: number | null }): 'good' | 'ok' | 'bad' | 'empty' {
  if (!d || (d.spend || 0) < 5) return 'empty'
  if ((d.purchases || 0) >= 2 && d.cpa !== null && d.cpa <= CPA_TARGET) return 'good'
  if ((d.purchases || 0) >= 1 || (d.cpa !== null && d.cpa <= CPA_BREAKEVEN)) return 'ok'
  return 'bad'
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function DiagnosticoPage({
  searchParams,
}: { searchParams: Promise<{ a?: string; b?: string }> }) {
  await headers()
  const sp = await searchParams

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()

  // 180-day window for calendar
  const cal180start = new Date(todayMs - 179 * 86400000).toISOString().split('T')[0]
  const calDates = Array.from({ length: 180 }, (_, i) =>
    new Date(todayMs - (179 - i) * 86400000).toISOString().split('T')[0]
  )

  // Validate selected days against 180d window
  const dayA = sp?.a && sp.a >= cal180start && sp.a <= today ? sp.a : today
  const dayB = sp?.b && sp.b >= cal180start && sp.b <= today ? sp.b : new Date(todayMs - 86400000).toISOString().split('T')[0]

  const [
    accountRes, campsRes, adSetsRes, adsRes,
    mCal,
    mA_camp, mB_camp,
    mA_adset, mB_adset,
    mA_ad, mB_ad,
  ] = await Promise.all([
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
    supabaseAdmin.from('campaigns').select('id,name,status'),
    supabaseAdmin.from('ad_sets').select('id,name,status,campaign_id'),
    supabaseAdmin.from('ads').select('id,name,status,ad_set_id'),
    // 180 días para el calendario
    supabaseAdmin.from('metrics').select('date,object_id,spend,purchases,purchase_value')
      .eq('object_type', 'campaign').gte('date', cal180start).lte('date', today),
    // métricas de día A y B
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', dayB),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', dayB),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').eq('date', dayB),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'

  // ── Calendar data ─────────────────────────────────────────────────────────
  const byDate = new Map<string, any[]>()
  for (const m of (mCal.data || [])) {
    if (!byDate.has(m.date)) byDate.set(m.date, [])
    byDate.get(m.date)!.push(m)
  }
  const calDays = calDates.map(d => {
    const rows = byDate.get(d) || []
    if (rows.length === 0) return { date: d, quality: 'empty' as const, spend: 0, purchases: 0, cpa: null, roas: null }
    const spend = rows.reduce((s: number, m: any) => s + (m.spend || 0), 0)
    const purchases = rows.reduce((s: number, m: any) => s + (m.purchases || 0), 0)
    const pv = rows.reduce((s: number, m: any) => s + (m.purchase_value || 0), 0)
    const cpa = purchases > 0 ? spend / purchases : null
    const roas = spend > 0 ? pv / spend : null
    return { date: d, quality: dayQuality({ spend, purchases, cpa }), spend, purchases, cpa, roas }
  })

  // ── Index metrics ─────────────────────────────────────────────────────────
  const campMeta  = new Map((campsRes.data  || []).map((x: any) => [x.id, x]))
  const adSetMeta = new Map((adSetsRes.data || []).map((x: any) => [x.id, x]))

  const idxRows = (rows: any[]) => {
    const m = new Map<string, any[]>()
    for (const r of rows) {
      if (!m.has(r.object_id)) m.set(r.object_id, [])
      m.get(r.object_id)!.push(r)
    }
    return m
  }
  const campA = idxRows(mA_camp.data || []), campB = idxRows(mB_camp.data || [])
  const asA   = idxRows(mA_adset.data || []), asB  = idxRows(mB_adset.data || [])
  const adA   = idxRows(mA_ad.data   || []), adB   = idxRows(mB_ad.data   || [])

  // ── Account-level aggregates + diagnosis ──────────────────────────────────
  const accA = aggMetrics(mA_camp.data || [])
  const accB = aggMetrics(mB_camp.data || [])
  const aIsBetter = (accA?.roas || 0) >= (accB?.roas || 0)
  const findings = diagnose(accA, accB)

  const labelA = formatDate(dayA)
  const labelB = formatDate(dayB)

  // ── Build hierarchy ────────────────────────────────────────────────────────
  const allCampIds = new Set([
    ...(mA_camp.data || []).map((m: any) => m.object_id),
    ...(mB_camp.data || []).map((m: any) => m.object_id),
  ])

  const campTree: CampDiag[] = Array.from(allCampIds).map(cid => {
    const meta = campMeta.get(cid) as any
    const a = aggMetrics(campA.get(cid) || [])
    const b = aggMetrics(campB.get(cid) || [])
    if (!a?.spend && !b?.spend) return null

    const campAdSets = (adSetsRes.data || []).filter((s: any) => s.campaign_id === cid)
    const asNodes: AsDiag[] = campAdSets.map((s: any) => {
      const sa = aggMetrics(asA.get(s.id) || [])
      const sb = aggMetrics(asB.get(s.id) || [])
      if (!sa?.spend && !sb?.spend) return null

      const setAds = (adsRes.data || []).filter((ad: any) => ad.ad_set_id === s.id)
      const adNodes: AdDiag[] = setAds.map((ad: any) => {
        const aa = aggMetrics(adA.get(ad.id) || [])
        const ab = aggMetrics(adB.get(ad.id) || [])
        if (!aa?.spend && !ab?.spend) return null
        return { id: ad.id, name: ad.name, status: ad.status, a: toMetricsDiag(aa), b: toMetricsDiag(ab) }
      }).filter(Boolean) as AdDiag[]

      return { id: s.id, name: s.name, status: s.status, a: toMetricsDiag(sa), b: toMetricsDiag(sb), ads: adNodes }
    }).filter(Boolean) as AsDiag[]

    return {
      id: cid, name: meta?.name || cid, status: meta?.status || 'UNKNOWN',
      a: toMetricsDiag(a), b: toMetricsDiag(b), adSets: asNodes,
    }
  }).filter(Boolean).sort((x: any, y: any) => {
    if (x.status === 'ACTIVE' && y.status !== 'ACTIVE') return -1
    if (y.status === 'ACTIVE' && x.status !== 'ACTIVE') return 1
    return (y.a?.spend || 0) - (x.a?.spend || 0)
  }) as CampDiag[]

  // ── Render helpers ─────────────────────────────────────────────────────────
  const thBase: any = { padding: '5px 8px', fontSize: 10, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' as const, borderBottom: `1px solid ${BORDER}`, backgroundColor: '#0e1015', whiteSpace: 'nowrap' as const }
  const tdBase: any = { padding: '6px 8px', fontSize: 11, textAlign: 'right' as const, borderBottom: '1px solid #1a1d27', whiteSpace: 'nowrap' as const }

  function MetricRow({ label, a, b, fmtFn, invert = false, colorFn }: {
    label: string; a: number | null; b: number | null
    fmtFn: (v: number, cur: string) => string
    invert?: boolean; colorFn?: (v: number | null) => string
  }) {
    const d = dPct(a, b)
    const dc = d !== null ? dColor(d, invert) : M
    const aColor = colorFn ? colorFn(a) : (a != null ? TEXT : M)
    const bColor = colorFn ? colorFn(b) : (b != null ? TEXT : M)
    return (
      <tr>
        <td style={{ ...tdBase, textAlign: 'left' as const, color: M, fontSize: 10 }}>{label}</td>
        <td style={{ ...tdBase, color: aColor, fontWeight: 600 }}>{a != null ? fmtFn(a, currency) : '—'}</td>
        <td style={{ ...tdBase, color: bColor, fontWeight: 500 }}>{b != null ? fmtFn(b, currency) : '—'}</td>
        <td style={{ ...tdBase, color: dc, fontWeight: 600 }}>{d !== null ? fmtD(d) : '—'}</td>
      </tr>
    )
  }

  function MetricsTable({ a, b }: { a: any; b: any }) {
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thBase, textAlign: 'left' as const, minWidth: 90 }}>Métrica</th>
            <th style={{ ...thBase, color: aIsBetter ? G : R }}>{labelA}</th>
            <th style={{ ...thBase }}>{labelB}</th>
            <th style={{ ...thBase }}>Δ</th>
          </tr>
        </thead>
        <tbody>
          <MetricRow label="Gasto"      a={a?.spend}           b={b?.spend}           fmtFn={(v, c) => formatCurrency(v, c)} />
          <MetricRow label="Impr."      a={a?.impressions}     b={b?.impressions}     fmtFn={(v) => String(Math.round(v))} />
          <MetricRow label="Ventas"     a={a?.purchases}       b={b?.purchases}       fmtFn={(v) => String(Math.round(v))} colorFn={(v) => v && v > 0 ? G : M} />
          <MetricRow label="ROAS"       a={a?.roas}            b={b?.roas}            fmtFn={(v) => `${v.toFixed(2)}x`} colorFn={roasColor} />
          <MetricRow label="CPA"        a={a?.cpa}             b={b?.cpa}             fmtFn={(v, c) => formatCurrency(v, c)} invert colorFn={cpaColor} />
          <MetricRow label="CPM"        a={a?.cpm}             b={b?.cpm}             fmtFn={(v, c) => formatCurrency(v, c)} invert />
          <MetricRow label="CTR único%" a={a?.ctr}             b={b?.ctr}             fmtFn={(v) => `${v.toFixed(2)}%`} />
          <MetricRow label="Visit. LP"  a={a?.landing_page_views} b={b?.landing_page_views} fmtFn={(v) => String(Math.round(v))} />
          <MetricRow label="ATC"        a={a?.add_to_cart}     b={b?.add_to_cart}     fmtFn={(v) => String(Math.round(v))} />
          <MetricRow label="Hook Rate"  a={a?.hook_rate}       b={b?.hook_rate}       fmtFn={(v) => `${v.toFixed(1)}%`} colorFn={hkColor} />
          <MetricRow label="Hold Rate"  a={a?.hold_rate}       b={b?.hold_rate}       fmtFn={(v) => `${v.toFixed(1)}%`} colorFn={hlColor} />
          <MetricRow label="ThruPlay%"  a={a?.thruplay_rate}   b={b?.thruplay_rate}   fmtFn={(v) => `${v.toFixed(1)}%`} colorFn={tpColor} />
          <MetricRow label="CTR post-v" a={a?.ctr_post_view}   b={b?.ctr_post_view}   fmtFn={(v) => `${v.toFixed(1)}%`} />
          <MetricRow label="Conv. web%" a={a?.convWeb}         b={b?.convWeb}         fmtFn={(v) => `${v.toFixed(1)}%`} />
        </tbody>
      </table>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Diagnóstico de Día" subtitle="Comparación profunda entre dos días" />
        <main style={{ padding: '20px 16px', maxWidth: 1400 }}>

          {/* Breadcrumb */}
          <div style={{ marginBottom: 16, fontSize: 12, color: M }}>
            <Link href="/analisis" style={{ color: '#6366F1', textDecoration: 'none' }}>← Análisis</Link>
          </div>

          {/* ── Calendario selector ── */}
          <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>📅 Seleccionar días a comparar</span>
              <span style={{ fontSize: 11, color: M, marginLeft: 10 }}>6 meses · 🟢 CPA≤$7 · 🟡 ≤$15 · 🔴 sin ventas con gasto</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <DecisionCalendar
                days={calDays}
                currency={currency}
                mode="twodays"
                dayA={dayA}
                dayB={dayB}
              />
            </div>
          </div>

          {/* ── Cuenta — KPIs + Diagnóstico (apilados verticalmente) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
            {/* Métricas cuenta */}
            <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>📊 Cuenta — todas las campañas</span>
                <span style={{ fontSize: 11, color: aIsBetter ? G : R, fontWeight: 600 }}>
                  {aIsBetter ? '🔴' : '🟢'} {aIsBetter ? labelA : labelB} mejor día
                </span>
              </div>
              <div style={{ padding: 14, overflowX: 'auto' }}>
                <MetricsTable a={accA} b={accB} />
              </div>
            </div>

            {/* Diagnóstico */}
            <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>🔍 ¿Qué causó la diferencia?</span>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {findings.map((f, i) => (
                  <div key={i} style={{ padding: '10px 12px', backgroundColor: '#0F1117', borderRadius: 8, borderLeft: `3px solid ${f.color}` }}>
                    <span style={{ fontSize: 16, marginRight: 8 }}>{f.icon}</span>
                    <span style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.6 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Árbol colapsable Campaña → Conjunto → Anuncio ── */}
          <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>🎯 Desglose Campaña → Conjunto → Anuncio</span>
              <span style={{ fontSize: 11, color: M, marginLeft: 10 }}>Clic en campaña o conjunto para expandir</span>
            </div>
            <div style={{ padding: 16 }}>
              <DiagnosticoTree
                hierarchy={campTree}
                currency={currency}
                labelA={labelA}
                labelB={labelB}
                aIsBetter={aIsBetter}
              />
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
