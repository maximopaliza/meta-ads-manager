'use client'
import { useState } from 'react'

// ── Inline color helpers (no server-only imports) ───────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#64748B', TEXT = '#F1F5F9'

function roasColor(v: number | null) { return !v ? M : v >= 3.5 ? G : v >= 1.5 ? Y : R }
function cpaColor(v: number | null)  { return !v ? M : v <= 7 ? G : v <= 15 ? Y : R }
function hkColor(v: number | null)   { return !v ? M : v >= 30 ? G : v >= 15 ? Y : R }
function hlColor(v: number | null)   { return !v ? M : v >= 50 ? G : v >= 30 ? Y : R }
function tpColor(v: number | null)   { return !v ? M : v >= 15 ? G : v >= 8 ? Y : R }

function fc(v: number | null | undefined, currency: string) {
  if (!v) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function fn(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-AR').format(Math.round(v))
}
function dPct(a: number | null | undefined, b: number | null | undefined) {
  if (!b || a == null) return null
  return ((a - b) / b) * 100
}
function fmtD(v: number | null) {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}
function dColor(v: number | null, invert = false) {
  if (v === null) return M
  return (invert ? v < 0 : v > 0) ? G : R
}

// ── Types ───────────────────────────────────────────────────────────────────
export type MetricsDiag = {
  spend: number; purchases: number; impressions: number
  roas: number | null; cpa: number | null; ctr: number | null; cpm: number | null
  hook_rate: number | null; hold_rate: number | null
  thruplay_rate: number | null; ctr_post_view: number | null
  landing_page_views: number; add_to_cart: number
  trafEf: number | null; convWeb: number | null
} | null

export type AdDiag   = { id: string; name: string; status: string; a: MetricsDiag; b: MetricsDiag }
export type AsDiag   = { id: string; name: string; status: string; a: MetricsDiag; b: MetricsDiag; ads: AdDiag[] }
export type CampDiag = { id: string; name: string; status: string; a: MetricsDiag; b: MetricsDiag; adSets: AsDiag[] }

// ── Metrics table ───────────────────────────────────────────────────────────
function MetricsTable({ a, b, currency, labelA, labelB, aIsBetter }: {
  a: MetricsDiag; b: MetricsDiag; currency: string
  labelA: string; labelB: string; aIsBetter: boolean
}) {
  const TH: any = { padding: '4px 8px', fontSize: 9, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' as const, borderBottom: '1px solid #1a1d27', backgroundColor: '#0e1015', whiteSpace: 'nowrap' as const }
  const TD: any = { padding: '5px 8px', fontSize: 11, textAlign: 'right' as const, borderBottom: '1px solid #1a1d27', whiteSpace: 'nowrap' as const }

  function Row({ label, av, bv, fmt, invert = false, colorFn }: {
    label: string; av: number | null | undefined; bv: number | null | undefined
    fmt: (v: number) => string; invert?: boolean; colorFn?: (v: number | null) => string
  }) {
    const d  = dPct(av, bv)
    const dc = d !== null ? dColor(d, invert) : M
    const ac = colorFn ? colorFn(av ?? null) : (av != null ? TEXT : M)
    const bc = colorFn ? colorFn(bv ?? null) : (bv != null ? TEXT : M)
    return (
      <tr>
        <td style={{ ...TD, textAlign: 'left' as const, color: M, fontSize: 10 }}>{label}</td>
        <td style={{ ...TD, color: ac, fontWeight: 600 }}>{av != null ? fmt(av) : '—'}</td>
        <td style={{ ...TD, color: bc, fontWeight: 500 }}>{bv != null ? fmt(bv) : '—'}</td>
        <td style={{ ...TD, color: dc, fontWeight: 600 }}>{fmtD(d)}</td>
      </tr>
    )
  }

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={{ ...TH, textAlign: 'left' as const, minWidth: 90 }}>Métrica</th>
          <th style={{ ...TH, color: aIsBetter ? G : R }}>{labelA}</th>
          <th style={TH}>{labelB}</th>
          <th style={TH}>Δ</th>
        </tr>
      </thead>
      <tbody>
        <Row label="Gasto"      av={a?.spend}              bv={b?.spend}              fmt={v => fc(v, currency)} />
        <Row label="Impr."      av={a?.impressions}        bv={b?.impressions}        fmt={v => fn(v)} />
        <Row label="Ventas"     av={a?.purchases}          bv={b?.purchases}          fmt={v => String(Math.round(v))} colorFn={v => v && v > 0 ? G : M} />
        <Row label="ROAS"       av={a?.roas}               bv={b?.roas}               fmt={v => `${v.toFixed(2)}x`} colorFn={roasColor} />
        <Row label="CPA"        av={a?.cpa}                bv={b?.cpa}                fmt={v => fc(v, currency)} invert colorFn={cpaColor} />
        <Row label="CPM"        av={a?.cpm}                bv={b?.cpm}                fmt={v => fc(v, currency)} invert />
        <Row label="CTR único%" av={a?.ctr}                bv={b?.ctr}                fmt={v => `${v.toFixed(2)}%`} />
        <Row label="Visit. LP"  av={a?.landing_page_views} bv={b?.landing_page_views} fmt={v => fn(v)} />
        <Row label="ATC"        av={a?.add_to_cart}        bv={b?.add_to_cart}        fmt={v => String(Math.round(v))} />
        <Row label="Hook Rate"  av={a?.hook_rate}          bv={b?.hook_rate}          fmt={v => `${v.toFixed(1)}%`} colorFn={hkColor} />
        <Row label="Hold Rate"  av={a?.hold_rate}          bv={b?.hold_rate}          fmt={v => `${v.toFixed(1)}%`} colorFn={hlColor} />
        <Row label="ThruPlay%"  av={a?.thruplay_rate}      bv={b?.thruplay_rate}      fmt={v => `${v.toFixed(1)}%`} colorFn={tpColor} />
        <Row label="CTR post-v" av={a?.ctr_post_view}      bv={b?.ctr_post_view}      fmt={v => `${v.toFixed(1)}%`} />
        <Row label="Conv. web%" av={a?.convWeb}            bv={b?.convWeb}            fmt={v => `${v.toFixed(1)}%`} />
      </tbody>
    </table>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function DiagnosticoTree({ hierarchy, currency, labelA, labelB, aIsBetter }: {
  hierarchy: CampDiag[]
  currency: string
  labelA: string
  labelB: string
  aIsBetter: boolean
}) {
  const [openC, setOpenC] = useState<Set<string>>(new Set())
  const [openA, setOpenA] = useState<Set<string>>(new Set())

  const toggleC = (id: string) => setOpenC(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleA = (id: string) => setOpenA(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })

  if (hierarchy.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: M }}>
        Sin datos para ninguno de los dos días seleccionados.
      </div>
    )
  }

  const BORDER = '#2D3244'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {hierarchy.map((camp: CampDiag) => {
        const isOpen = openC.has(camp.id)
        const isActive = camp.status === 'ACTIVE'
        const hadSpend = (camp.a?.spend || 0) + (camp.b?.spend || 0) > 0
        const warnPaused = !isActive && hadSpend   // pausada ahora pero tuvo gasto en el período
        const sc = isActive ? G : Y
        return (
          <div key={camp.id} style={{ backgroundColor: '#1A1D27', border: `1px solid ${warnPaused ? '#F59E0B40' : BORDER}`, borderRadius: 12, overflow: 'hidden', borderTop: `2px solid ${sc}40` }}>

            {/* ── Campaign header ── */}
            <div
              onClick={() => toggleC(camp.id)}
              style={{ padding: '10px 16px', backgroundColor: '#151820', borderBottom: isOpen ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 9, color: M, width: 12, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sc, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1 }}>{camp.name}</span>
              {warnPaused && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, backgroundColor: '#F59E0B20', color: Y, border: '1px solid #F59E0B40', whiteSpace: 'nowrap' as const }}>
                  ⚠ Pausada ahora
                </span>
              )}
              {!camp.a?.spend && (camp.b?.spend || 0) > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, backgroundColor: '#6366F120', color: '#818CF8', border: '1px solid #6366F140', whiteSpace: 'nowrap' as const }}>
                  Solo en B
                </span>
              )}
              {!camp.b?.spend && (camp.a?.spend || 0) > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, backgroundColor: '#6366F120', color: '#818CF8', border: '1px solid #6366F140', whiteSpace: 'nowrap' as const }}>
                  Solo en A
                </span>
              )}
              <span style={{ fontSize: 11, color: camp.a?.purchases && camp.a.purchases > 0 ? G : M, fontWeight: 600 }}>
                {camp.a?.purchases ? `${Math.round(camp.a.purchases)} ventas (A)` : '0 ventas (A)'}
              </span>
              {camp.a?.roas != null && (
                <span style={{ fontSize: 11, color: roasColor(camp.a.roas) }}>ROAS {camp.a.roas.toFixed(2)}x</span>
              )}
            </div>

            {/* Campaign metrics */}
            {isOpen && (
              <>
                <div style={{ padding: '12px 16px', borderBottom: camp.adSets.length > 0 ? `1px solid ${BORDER}` : 'none' }}>
                  <MetricsTable a={camp.a} b={camp.b} currency={currency} labelA={labelA} labelB={labelB} aIsBetter={aIsBetter} />
                </div>

                {/* ── Ad sets ── */}
                {camp.adSets.map((as: AsDiag) => {
                  const isAsOpen = openA.has(as.id)
                  const asActive = as.status === 'ACTIVE'
                  const asHadSpend = (as.a?.spend || 0) + (as.b?.spend || 0) > 0
                  const asWarn = !asActive && asHadSpend
                  const asc = asActive ? G : Y
                  return (
                    <div key={as.id} style={{ marginLeft: 24, borderLeft: `2px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
                      <div
                        onClick={e => { e.stopPropagation(); toggleA(as.id) }}
                        style={{ padding: '8px 14px', backgroundColor: '#13151e', borderBottom: isAsOpen ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 8, color: M, width: 10, flexShrink: 0 }}>{isAsOpen ? '▼' : '▶'}</span>
                        <span style={{ fontSize: 9, color: M }}>CONJUNTO</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: asc, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1', flex: 1 }}>{as.name}</span>
                        {asWarn && (
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, backgroundColor: '#F59E0B18', color: Y, border: '1px solid #F59E0B30' }}>⚠ Pausado</span>
                        )}
                        {!as.a?.spend && (as.b?.spend || 0) > 0 && (
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, backgroundColor: '#6366F118', color: '#818CF8', border: '1px solid #6366F130' }}>Solo B</span>
                        )}
                        {!as.b?.spend && (as.a?.spend || 0) > 0 && (
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, backgroundColor: '#6366F118', color: '#818CF8', border: '1px solid #6366F130' }}>Solo A</span>
                        )}
                        <span style={{ fontSize: 11, color: as.a?.purchases && as.a.purchases > 0 ? G : M, fontWeight: 600 }}>
                          {as.a?.purchases ? `${Math.round(as.a.purchases)} ventas` : '—'}
                        </span>
                        {as.a?.roas != null && (
                          <span style={{ fontSize: 11, color: roasColor(as.a.roas) }}>{as.a.roas.toFixed(2)}x</span>
                        )}
                      </div>

                      {isAsOpen && (
                        <>
                          <div style={{ padding: '10px 14px', borderBottom: as.ads.length > 0 ? `1px solid ${BORDER}` : 'none' }}>
                            <MetricsTable a={as.a} b={as.b} currency={currency} labelA={labelA} labelB={labelB} aIsBetter={aIsBetter} />
                          </div>

                          {/* ── Ads ── */}
                          {as.ads.map((ad: AdDiag) => (
                            <div key={ad.id} style={{ marginLeft: 20, borderLeft: '2px solid #1e2235', borderBottom: '1px solid #1a1d27' }}>
                              <div style={{ padding: '6px 12px', backgroundColor: '#0e1015', borderBottom: '1px solid #1a1d27', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 9, color: '#3A4060' }}>AD</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{ad.name}</span>
                                <span style={{ fontSize: 10, color: M }}>{ad.status}</span>
                                <span style={{ fontSize: 11, color: ad.a?.purchases && ad.a.purchases > 0 ? G : M, fontWeight: 600 }}>
                                  {ad.a?.purchases ? `${Math.round(ad.a.purchases)} ventas` : '—'}
                                </span>
                                {ad.a?.hook_rate != null && (
                                  <span style={{ fontSize: 10, color: hkColor(ad.a.hook_rate) }}>Hook {ad.a.hook_rate.toFixed(1)}%</span>
                                )}
                                {ad.a?.roas != null && (
                                  <span style={{ fontSize: 11, color: roasColor(ad.a.roas) }}>{ad.a.roas.toFixed(2)}x</span>
                                )}
                              </div>
                              <div style={{ padding: '8px 12px' }}>
                                <MetricsTable a={ad.a} b={ad.b} currency={currency} labelA={labelA} labelB={labelB} aIsBetter={aIsBetter} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
