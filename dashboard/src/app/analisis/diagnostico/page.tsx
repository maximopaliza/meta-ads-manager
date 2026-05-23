import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor } from '@/lib/metrics'

// ── Tokens ─────────────────────────────────────────────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#64748B'
const BORDER = '#2D3244', SURFACE = '#1A1D27', PRIMARY = '#6366F1', TEXT = '#F1F5F9'

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
    hook_rate_w:  acc.hook_rate_w  + ((m.hook_rate  || 0) * (m.impressions || 0)),
    hold_rate_w:  acc.hold_rate_w  + ((m.hold_rate  || 0) * (m.video_3s_views || 0)),
    thruplay_rate_w: acc.thruplay_rate_w + ((m.thruplay_rate || 0) * (m.impressions || 0)),
    ctr_pv_w:     acc.ctr_pv_w    + ((m.ctr_post_view || 0) * (m.video_3s_views || 0)),
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
    hook_rate:     b.impressions > 0 ? b.hook_rate_w / imp : null,
    hold_rate:     b.video_3s_views > 0 ? b.hold_rate_w / v3s : null,
    thruplay_rate: b.impressions > 0 ? b.thruplay_rate_w / imp : null,
    ctr_post_view: b.video_3s_views > 0 ? b.ctr_pv_w / v3s : null,
  }
}

// ── Root cause diagnosis ───────────────────────────────────────────────────
function diagnose(a: any, b: any) {
  const findings: { icon: string; text: string; color: string }[] = []
  if (!a || !b) return findings
  const chk = (field: string, inv = false) => dPct(a[field], b[field])

  const dImpr = chk('impressions'), dHook = chk('hook_rate')
  const dHold = chk('hold_rate'), dConvW = chk('convWeb')
  const dRoas = chk('roas'), dCpa = chk('cpa')
  const dCpm = chk('cpm'), dFreq = chk('frequency')

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

// ── Metric columns definition ──────────────────────────────────────────────
const COLS = [
  { key: 'spend',         label: 'Gasto',      fmt: (v: number, cur: string) => formatCurrency(v, cur) },
  { key: 'impressions',   label: 'Impr.',      fmt: (v: number) => formatNumber(Math.round(v)) },
  { key: 'roas',          label: 'ROAS',       fmt: (v: number) => `${v.toFixed(2)}x`,   invert: false },
  { key: 'purchases',     label: 'Ventas',     fmt: (v: number) => String(Math.round(v)), invert: false },
  { key: 'cpa',           label: 'CPA',        fmt: (v: number, cur: string) => formatCurrency(v, cur), invert: true },
  { key: 'cpm',           label: 'CPM',        fmt: (v: number, cur: string) => formatCurrency(v, cur), invert: true },
  { key: 'ctr',           label: 'CTR%',       fmt: (v: number) => `${v.toFixed(2)}%` },
  { key: 'landing_page_views', label: 'Visit. LP', fmt: (v: number) => formatNumber(Math.round(v)) },
  { key: 'add_to_cart',   label: 'ATC',        fmt: (v: number) => String(Math.round(v)) },
  { key: 'hook_rate',     label: 'Hook',       fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: 'hold_rate',     label: 'Hold',       fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: 'thruplay_rate', label: 'ThruPlay',   fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: 'ctr_post_view', label: 'CTR post-v', fmt: (v: number) => `${v.toFixed(1)}%` },
]

function metricColor(key: string, v: number | null) {
  if (v == null) return M
  if (key === 'hook_rate') return hkColor(v)
  if (key === 'hold_rate') return hlColor(v)
  if (key === 'thruplay_rate') return tpColor(v)
  if (key === 'roas') return roasColor(v)
  if (key === 'cpa') return cpaColor(v)
  if (key === 'purchases') return v > 0 ? G : M
  return TEXT
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function DiagnosticoPage({
  searchParams,
}: { searchParams: Promise<{ a?: string; b?: string }> }) {
  await headers()
  const sp = await searchParams

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const last14 = Array.from({ length: 14 }, (_, i) =>
    new Date(todayMs - i * 86400000).toISOString().split('T')[0]
  )

  const dayA = sp?.a && last14.includes(sp.a) ? sp.a : last14[0]
  const dayB = sp?.b && last14.includes(sp.b) ? sp.b : last14[1]

  const [
    accountRes, campsRes, adSetsRes, adsRes,
    mA_camp, mB_camp,
    mA_adset, mB_adset,
    mA_ad, mB_ad,
  ] = await Promise.all([
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
    supabaseAdmin.from('campaigns').select('id,name,status'),
    supabaseAdmin.from('ad_sets').select('id,name,status,campaign_id'),
    supabaseAdmin.from('ads').select('id,name,status,ad_set_id'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', dayB),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', dayB),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').eq('date', dayA),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad').eq('date', dayB),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'

  // Index metadata
  const campMeta  = new Map((campsRes.data  || []).map((x: any) => [x.id, x]))
  const adSetMeta = new Map((adSetsRes.data || []).map((x: any) => [x.id, x]))
  const adMeta    = new Map((adsRes.data    || []).map((x: any) => [x.id, x]))

  // Index metrics by object_id
  const idx = (rows: any[]) => {
    const m = new Map<string, any[]>()
    for (const r of rows) {
      if (!m.has(r.object_id)) m.set(r.object_id, [])
      m.get(r.object_id)!.push(r)
    }
    return m
  }
  const campA = idx(mA_camp.data || []), campB = idx(mB_camp.data || [])
  const asA   = idx(mA_adset.data || []), asB  = idx(mB_adset.data || [])
  const adA   = idx(mA_ad.data   || []), adB   = idx(mB_ad.data   || [])

  // Account-level aggregates
  const accA = aggMetrics(mA_camp.data || [])
  const accB = aggMetrics(mB_camp.data || [])
  const aIsBetter = (accA?.roas || 0) >= (accB?.roas || 0)
  const findings = diagnose(accA, accB)

  // Build hierarchy: campaign → ad_sets → ads
  // Only include if had spend on at least one day
  const allCampIds = new Set([
    ...(mA_camp.data || []).map((m: any) => m.object_id),
    ...(mB_camp.data || []).map((m: any) => m.object_id),
  ])

  const hierarchy = Array.from(allCampIds).map(cid => {
    const meta = campMeta.get(cid) as any
    const a = aggMetrics(campA.get(cid) || [])
    const b = aggMetrics(campB.get(cid) || [])
    if (!a?.spend && !b?.spend) return null

    // Ad sets belonging to this campaign that had activity
    const campAdSets = (adSetsRes.data || []).filter((s: any) => s.campaign_id === cid)
    const adSetRows = campAdSets.map((s: any) => {
      const sa = aggMetrics(asA.get(s.id) || [])
      const sb = aggMetrics(asB.get(s.id) || [])
      if (!sa?.spend && !sb?.spend) return null

      // Ads belonging to this ad set that had activity
      const setAds = (adsRes.data || []).filter((ad: any) => ad.ad_set_id === s.id)
      const adRows = setAds.map((ad: any) => {
        const aa = aggMetrics(adA.get(ad.id) || [])
        const ab = aggMetrics(adB.get(ad.id) || [])
        if (!aa?.spend && !ab?.spend) return null
        return { id: ad.id, name: ad.name, status: ad.status, a: aa, b: ab }
      }).filter(Boolean)

      return { id: s.id, name: s.name, status: s.status, a: sa, b: sb, ads: adRows }
    }).filter(Boolean)

    return { id: cid, name: meta?.name || cid, status: meta?.status || 'UNKNOWN', a, b, adSets: adSetRows }
  }).filter(Boolean)
    .sort((x: any, y: any) => {
      if (x.status === 'ACTIVE' && y.status !== 'ACTIVE') return -1
      if (y.status === 'ACTIVE' && x.status !== 'ACTIVE') return 1
      return (y.a?.spend || 0) - (x.a?.spend || 0)
    })

  // ── Render helpers ─────────────────────────────────────────────────────
  const thBase: any = { padding: '5px 8px', fontSize: 10, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' as const, borderBottom: `1px solid ${BORDER}`, backgroundColor: '#0e1015', whiteSpace: 'nowrap' as const }
  const tdBase: any = { padding: '6px 8px', fontSize: 11, textAlign: 'right' as const, borderBottom: `1px solid #1a1d27`, whiteSpace: 'nowrap' as const }

  // Renders a metric row: value A | value B | delta
  function MetricRow({ label, a, b, fmtFn, invert = false, colorFn }: {
    label: string; a: number | null; b: number | null
    fmtFn: (v: number, cur: string) => string
    invert?: boolean; colorFn?: (v: number | null) => string
  }) {
    const d = dPct(a, b)
    const dc = d !== null ? dColor(d, invert) : M
    const aColor = colorFn ? colorFn(a) : (a != null ? TEXT : M)
    return (
      <tr>
        <td style={{ ...tdBase, textAlign: 'left' as const, color: M, fontSize: 10 }}>{label}</td>
        <td style={{ ...tdBase, color: aColor, fontWeight: 600 }}>{a != null ? fmtFn(a, currency) : '—'}</td>
        <td style={{ ...tdBase, color: M }}>{b != null ? fmtFn(b, currency) : '—'}</td>
        <td style={{ ...tdBase, color: dc, fontWeight: 600 }}>{d !== null ? fmtD(d) : '—'}</td>
      </tr>
    )
  }

  // Compact metrics table for a given pair (a, b)
  function MetricsTable({ a, b }: { a: any; b: any }) {
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thBase, textAlign: 'left' as const, minWidth: 90 }}>Métrica</th>
            <th style={{ ...thBase, color: aIsBetter ? G : R }}>{formatDate(dayA)}</th>
            <th style={{ ...thBase }}>{formatDate(dayB)}</th>
            <th style={{ ...thBase }}>Δ</th>
          </tr>
        </thead>
        <tbody>
          <MetricRow label="Gasto"      a={a?.spend}           b={b?.spend}           fmtFn={(v, c) => formatCurrency(v, c)} />
          <MetricRow label="Impr."      a={a?.impressions}     b={b?.impressions}     fmtFn={(v) => formatNumber(Math.round(v))} />
          <MetricRow label="Ventas"     a={a?.purchases}       b={b?.purchases}       fmtFn={(v) => String(Math.round(v))} colorFn={(v) => v && v > 0 ? G : M} />
          <MetricRow label="ROAS"       a={a?.roas}            b={b?.roas}            fmtFn={(v) => `${v.toFixed(2)}x`} colorFn={roasColor} />
          <MetricRow label="CPA"        a={a?.cpa}             b={b?.cpa}             fmtFn={(v, c) => formatCurrency(v, c)} invert colorFn={cpaColor} />
          <MetricRow label="CPM"        a={a?.cpm}             b={b?.cpm}             fmtFn={(v, c) => formatCurrency(v, c)} invert />
          <MetricRow label="CTR único%" a={a?.ctr}             b={b?.ctr}             fmtFn={(v) => `${v.toFixed(2)}%`} />
          <MetricRow label="Visit. LP"  a={a?.landing_page_views} b={b?.landing_page_views} fmtFn={(v) => formatNumber(Math.round(v))} />
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
          <div style={{ marginBottom: 20, fontSize: 12, color: M }}>
            <Link href="/analisis" style={{ color: PRIMARY, textDecoration: 'none' }}>← Análisis</Link>
          </div>

          {/* ── Day selectors ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Día A', day: dayA, param: 'a', other: 'b', otherDay: dayB, better: aIsBetter },
              { label: 'Día B — referencia', day: dayB, param: 'b', other: 'a', otherDay: dayA, better: !aIsBetter },
            ].map(sel => (
              <div key={sel.param} style={{ backgroundColor: SURFACE, border: `2px solid ${sel.better ? G : R}30`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: sel.better ? G : R, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  {sel.better ? '🟢' : '🔴'} {sel.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {last14.map(d => (
                    <a key={d} href={`?${sel.param}=${d}&${sel.other}=${sel.otherDay}`} style={{
                      padding: '3px 8px', borderRadius: 5, fontSize: 11, textDecoration: 'none',
                      backgroundColor: d === sel.day ? (sel.better ? '#22C55E20' : '#EF444420') : 'transparent',
                      color: d === sel.day ? (sel.better ? G : R) : M,
                      border: `1px solid ${d === sel.day ? (sel.better ? '#22C55E50' : '#EF444450') : BORDER}`,
                      fontWeight: d === sel.day ? 700 : 400,
                    }}>
                      {formatDate(d)}{d === today ? ' ●' : ''}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Cuenta — KPIs + Diagnóstico ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Métricas cuenta */}
            <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>📊 Cuenta — todas las campañas</span>
              </div>
              <div style={{ padding: 14 }}>
                <MetricsTable a={accA} b={accB} />
              </div>
            </div>

            {/* Diagnóstico */}
            <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#151820' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>🔍 ¿Qué causó la diferencia?</span>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {findings.map((f, i) => (
                  <div key={i} style={{ padding: '10px 12px', backgroundColor: '#0F1117', borderRadius: 8, borderLeft: `3px solid ${f.color}` }}>
                    <span style={{ fontSize: 16, marginRight: 8 }}>{f.icon}</span>
                    <span style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.6 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Desglose jerárquico ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {hierarchy.length === 0 && (
              <div style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 32, textAlign: 'center', color: M }}>
                Sin datos para ninguno de los dos días seleccionados.
              </div>
            )}

            {hierarchy.map((camp: any) => {
              const statusColor = camp.status === 'ACTIVE' ? G : camp.status === 'PAUSED' ? Y : M
              return (
                <div key={camp.id} style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', borderTop: `2px solid ${statusColor}40` }}>

                  {/* ── Campaign header ── */}
                  <div style={{ padding: '10px 16px', backgroundColor: '#151820', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0, display: 'inline-block' }} />
                    <Link href={`/campaigns/${camp.id}`} style={{ fontSize: 13, fontWeight: 700, color: TEXT, textDecoration: 'none', flex: 1 }}>
                      {camp.name}
                    </Link>
                    <span style={{ fontSize: 10, color: M }}>{camp.status}</span>
                    <span style={{ fontSize: 11, color: camp.a?.purchases > 0 ? G : M, fontWeight: 600 }}>
                      {camp.a?.purchases ? `${Math.round(camp.a.purchases)} ventas (A)` : '0 ventas (A)'}
                    </span>
                    {camp.a?.roas && <span style={{ fontSize: 11, color: roasColor(camp.a.roas) }}>ROAS {camp.a.roas.toFixed(2)}x</span>}
                  </div>

                  {/* Campaign metrics */}
                  <div style={{ padding: '12px 16px', borderBottom: camp.adSets.length > 0 ? `1px solid ${BORDER}` : 'none' }}>
                    <MetricsTable a={camp.a} b={camp.b} />
                  </div>

                  {/* ── Ad sets ── */}
                  {camp.adSets.map((as: any) => {
                    const asStatusColor = as.status === 'ACTIVE' ? G : Y
                    return (
                      <div key={as.id} style={{ marginLeft: 24, borderLeft: `2px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>

                        {/* Ad set header */}
                        <div style={{ padding: '8px 14px', backgroundColor: '#13151e', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 9, color: M }}>▸ CONJUNTO</span>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: asStatusColor, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1', flex: 1 }}>{as.name}</span>
                          <span style={{ fontSize: 10, color: M }}>{as.status}</span>
                          <span style={{ fontSize: 11, color: as.a?.purchases > 0 ? G : M, fontWeight: 600 }}>
                            {as.a?.purchases ? `${Math.round(as.a.purchases)} ventas` : '—'}
                          </span>
                          {as.a?.roas && <span style={{ fontSize: 11, color: roasColor(as.a.roas) }}>{as.a.roas.toFixed(2)}x</span>}
                        </div>

                        {/* Ad set metrics */}
                        <div style={{ padding: '10px 14px', borderBottom: as.ads.length > 0 ? `1px solid ${BORDER}` : 'none' }}>
                          <MetricsTable a={as.a} b={as.b} />
                        </div>

                        {/* ── Ads ── */}
                        {as.ads.map((ad: any) => (
                          <div key={ad.id} style={{ marginLeft: 20, borderLeft: `2px solid #1e2235`, borderBottom: `1px solid #1a1d27` }}>

                            {/* Ad header */}
                            <div style={{ padding: '6px 12px', backgroundColor: '#0e1015', borderBottom: `1px solid #1a1d27`, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 9, color: '#3A4060' }}>▸ AD</span>
                              <Link href={`/ads/${ad.id}`} style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {ad.name}
                              </Link>
                              <span style={{ fontSize: 10, color: M }}>{ad.status}</span>
                              <span style={{ fontSize: 11, color: ad.a?.purchases > 0 ? G : M, fontWeight: 600 }}>
                                {ad.a?.purchases ? `${Math.round(ad.a.purchases)} ventas` : '—'}
                              </span>
                              {ad.a?.hook_rate && <span style={{ fontSize: 10, color: hkColor(ad.a.hook_rate) }}>Hook {ad.a.hook_rate.toFixed(1)}%</span>}
                              {ad.a?.roas && <span style={{ fontSize: 11, color: roasColor(ad.a.roas) }}>{ad.a.roas.toFixed(2)}x</span>}
                            </div>

                            {/* Ad metrics */}
                            <div style={{ padding: '8px 12px' }}>
                              <MetricsTable a={ad.a} b={ad.b} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

        </main>
      </div>
    </div>
  )
}
