'use client'
import { useState } from 'react'

const CPA_TARGET = 7
const CPA_BREAKEVEN = 15

function cpaColor(v: number | null) {
  if (!v) return '#64748B'
  return v <= CPA_TARGET ? '#22C55E' : v <= CPA_BREAKEVEN ? '#F59E0B' : '#EF4444'
}
function roasColor(v: number | null) {
  if (!v) return '#64748B'
  return v >= 3.5 ? '#22C55E' : v >= 1.5 ? '#F59E0B' : '#EF4444'
}
function dayQC(p: number, cpa: number | null, sp: number) {
  if (sp < 1) return { bg: 'transparent', border: '#1a1d27', txt: '#1A3050' }
  if (p >= 2 && cpa !== null && cpa <= CPA_TARGET) return { bg: '#22C55E1A', border: '#22C55E30', txt: '#22C55E' }
  if (p >= 1 || (cpa !== null && cpa <= CPA_BREAKEVEN)) return { bg: '#F59E0B1A', border: '#F59E0B30', txt: '#F59E0B' }
  if (sp > 0) return { bg: '#EF44441A', border: '#EF444430', txt: '#EF4444' }
  return { bg: 'transparent', border: '#1a1d27', txt: '#1A3050' }
}
function fc(val: number | null | undefined, currency: string) {
  if (!val) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
}
function pctFmt(a: number | null | undefined, b: number | null | undefined) {
  if (!a || !b || b === 0) return { text: '—', color: '#64748B' }
  const v = ((a - b) / b) * 100
  return { text: `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, color: v > 0 ? '#22C55E' : '#EF4444' }
}

type DayM = { purchases: number; spend: number; roas: number | null; cpa: number | null } | null
type AggM = { spend: number; purchases: number; roas: number | null; cpa: number | null } | null
type Signal = { label: string; color: string; bg: string; border: string; priority: number }

export type AdNode = {
  id: string; name: string; status: string
  signal: Signal; alerts: string[]
  days4: DayM[]; d7: AggM; prev7: AggM
}
export type AsNode = {
  id: string; name: string; status: string
  signal: Signal
  days4: DayM[]; d7: AggM; prev7: AggM
  ads: AdNode[]
}
export type CampNode = {
  id: string; name: string; status: string
  signal: Signal
  days4: DayM[]; d7: AggM; prev7: AggM
  adSets: AsNode[]
}

function DayCell({ m, currency }: { m: DayM; currency: string }) {
  const q = m ? dayQC(m.purchases, m.cpa, m.spend) : null
  if (!m || m.spend < 1 || !q) {
    return <td style={{ padding: '5px 4px', textAlign: 'center', fontSize: '11px', color: '#1A3050', borderRight: '1px solid #1a1d2740', minWidth: '50px' }}>·</td>
  }
  return (
    <td style={{ padding: '3px 3px', textAlign: 'center', borderRight: '1px solid #1a1d2740', minWidth: '50px', backgroundColor: q.bg }}>
      <div style={{ color: q.txt, fontWeight: 700, fontSize: '14px', lineHeight: 1.1 }}>{m.purchases}</div>
      <div style={{ color: '#94A3B8', fontSize: '9px' }}>{m.roas ? `${m.roas.toFixed(1)}x` : '—'}</div>
      <div style={{ color: '#64748B', fontSize: '8px' }}>{m.spend > 0 ? fc(m.spend, currency) : ''}</div>
    </td>
  )
}

function SignalBadge({ s }: { s: Signal }) {
  return (
    <span style={{
      fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px',
      color: s.color, backgroundColor: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

export default function DecisionTree({
  campaigns, last4Labels, currency,
}: {
  campaigns: CampNode[]
  last4Labels: string[]
  currency: string
}) {
  const [openC, setOpenC] = useState<Set<string>>(
    new Set(campaigns.filter(c => c.status === 'ACTIVE' && c.signal.priority <= 3).map(c => c.id))
  )
  const [openA, setOpenA] = useState<Set<string>>(new Set())

  const toggleC = (id: string) => setOpenC(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleA = (id: string) => setOpenA(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })

  const TH: any = {
    padding: '6px 8px', textAlign: 'right' as const, color: '#64748B',
    fontSize: '9px', fontWeight: 600, borderBottom: '1px solid #1A3050',
    whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em',
    backgroundColor: '#0A1422', borderRight: '1px solid #1a1d2740',
  }
  const THL: any = { ...TH, textAlign: 'left' as const }
  const TD: any = {
    padding: '6px 8px', textAlign: 'right' as const, fontSize: '11px',
    borderBottom: '1px solid #1a1d2780', borderRight: '1px solid #1a1d2740',
    whiteSpace: 'nowrap',
  }
  const TDL: any = { ...TD, textAlign: 'left' as const }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1000px' }}>
        <thead>
          <tr>
            <th style={{ ...THL, minWidth: '230px', position: 'sticky', left: 0 }}>Campaña / Conjunto / Anuncio</th>
            <th style={{ ...TH, width: '28px' }}>●</th>
            <th style={{ ...TH, minWidth: '50px' }}>{last4Labels[0]}</th>
            <th style={{ ...TH, minWidth: '50px' }}>{last4Labels[1]}</th>
            <th style={{ ...TH, minWidth: '50px' }}>{last4Labels[2]}</th>
            <th style={{ ...TH, minWidth: '50px', color: '#6366F1' }}>{last4Labels[3]} ★</th>
            <th style={TH}>Gasto 7d</th>
            <th style={TH}>ROAS 7d</th>
            <th style={TH}>CPA 7d</th>
            <th style={TH}>Ventas</th>
            <th style={TH}>vs -7d</th>
            <th style={TH}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(camp => {
            const isOpenC = openC.has(camp.id)
            const cPct = pctFmt(camp.d7?.roas, camp.prev7?.roas)
            return (
              <>
                {/* ── Campaign ── */}
                <tr
                  key={`c-${camp.id}`}
                  style={{ opacity: camp.status === 'ACTIVE' ? 1 : 0.5, cursor: 'pointer', backgroundColor: '#0E1B30' }}
                  onClick={() => toggleC(camp.id)}
                >
                  <td style={{ ...TDL, position: 'sticky', left: 0, backgroundColor: '#0E1B30', fontWeight: 700, borderLeft: `3px solid ${camp.signal.color}40` }}>
                    <span style={{ fontSize: '9px', color: '#64748B', marginRight: '6px' }}>{isOpenC ? '▼' : '▶'}</span>
                    <span style={{ color: '#F1F5F9' }}>{camp.name}</span>
                  </td>
                  <td style={{ ...TD, textAlign: 'center', fontSize: '8px' }}>
                    <span style={{ color: camp.status === 'ACTIVE' ? '#22C55E' : '#64748B' }}>●</span>
                  </td>
                  {camp.days4.map((m, i) => <DayCell key={i} m={m} currency={currency} />)}
                  <td style={TD}><span style={{ color: '#F1F5F9', fontWeight: 600 }}>{fc(camp.d7?.spend, currency)}</span></td>
                  <td style={{ ...TD, color: roasColor(camp.d7?.roas ?? null) }}>{camp.d7?.roas ? `${camp.d7.roas.toFixed(2)}x` : '—'}</td>
                  <td style={{ ...TD, color: cpaColor(camp.d7?.cpa ?? null), fontWeight: 600 }}>{fc(camp.d7?.cpa, currency)}</td>
                  <td style={{ ...TD, color: (camp.d7?.purchases ?? 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{camp.d7?.purchases || '—'}</td>
                  <td style={{ ...TD, color: cPct.color, fontWeight: 600 }}>{cPct.text}</td>
                  <td style={{ ...TD, textAlign: 'center' }}><SignalBadge s={camp.signal} /></td>
                </tr>

                {/* ── Ad Sets ── */}
                {isOpenC && camp.adSets.map(as => {
                  const isOpenA = openA.has(as.id)
                  const aPct = pctFmt(as.d7?.roas, as.prev7?.roas)
                  return (
                    <>
                      <tr
                        key={`a-${as.id}`}
                        style={{ opacity: as.status === 'ACTIVE' ? 1 : 0.5, cursor: 'pointer', backgroundColor: '#0A1422' }}
                        onClick={e => { e.stopPropagation(); toggleA(as.id) }}
                      >
                        <td style={{ ...TDL, paddingLeft: '28px', position: 'sticky', left: 0, backgroundColor: '#0A1422', borderLeft: `3px solid ${as.signal.color}25` }}>
                          <span style={{ fontSize: '8px', color: '#64748B', marginRight: '5px' }}>{isOpenA ? '▼' : '▶'}</span>
                          <span style={{ color: '#94A3B8' }}>{as.name}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontSize: '8px', backgroundColor: '#0A1422' }}>
                          <span style={{ color: as.status === 'ACTIVE' ? '#22C55E' : '#64748B' }}>●</span>
                        </td>
                        {as.days4.map((m, i) => <DayCell key={i} m={m} currency={currency} />)}
                        <td style={TD}><span style={{ color: '#94A3B8' }}>{fc(as.d7?.spend, currency)}</span></td>
                        <td style={{ ...TD, color: roasColor(as.d7?.roas ?? null) }}>{as.d7?.roas ? `${as.d7.roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ ...TD, color: cpaColor(as.d7?.cpa ?? null) }}>{fc(as.d7?.cpa, currency)}</td>
                        <td style={{ ...TD, color: (as.d7?.purchases ?? 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{as.d7?.purchases || '—'}</td>
                        <td style={{ ...TD, color: aPct.color }}>{aPct.text}</td>
                        <td style={{ ...TD, textAlign: 'center' }}><SignalBadge s={as.signal} /></td>
                      </tr>

                      {/* ── Ads ── */}
                      {isOpenA && as.ads.map(ad => {
                        const adPct = pctFmt(ad.d7?.roas, ad.prev7?.roas)
                        return (
                          <tr key={`ad-${ad.id}`} style={{ opacity: ad.status === 'ACTIVE' ? 1 : 0.5, backgroundColor: '#060810' }}>
                            <td style={{ ...TDL, paddingLeft: '52px', position: 'sticky', left: 0, backgroundColor: '#060810', borderLeft: `3px solid ${ad.signal.color}15` }}>
                              <div style={{ color: '#64748B', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                                {ad.name}
                              </div>
                              {ad.alerts.length > 0 && (
                                <div style={{ display: 'flex', gap: '3px', marginTop: '2px', flexWrap: 'wrap' }}>
                                  {ad.alerts.map((a, i) => (
                                    <span key={i} style={{ fontSize: '8px', padding: '1px 5px', backgroundColor: '#1A3050', color: '#94A3B8', borderRadius: '3px' }}>{a}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ ...TD, textAlign: 'center', fontSize: '8px', backgroundColor: '#060810' }}>
                              <span style={{ color: ad.status === 'ACTIVE' ? '#22C55E' : '#64748B' }}>●</span>
                            </td>
                            {ad.days4.map((m, i) => <DayCell key={i} m={m} currency={currency} />)}
                            <td style={TD}><span style={{ color: '#64748B' }}>{fc(ad.d7?.spend, currency)}</span></td>
                            <td style={{ ...TD, color: roasColor(ad.d7?.roas ?? null) }}>{ad.d7?.roas ? `${ad.d7.roas.toFixed(2)}x` : '—'}</td>
                            <td style={{ ...TD, color: cpaColor(ad.d7?.cpa ?? null) }}>{fc(ad.d7?.cpa, currency)}</td>
                            <td style={{ ...TD, color: (ad.d7?.purchases ?? 0) > 0 ? '#22C55E' : '#64748B', fontWeight: 600 }}>{ad.d7?.purchases || '—'}</td>
                            <td style={{ ...TD, color: adPct.color }}>{adPct.text}</td>
                            <td style={{ ...TD, textAlign: 'center' }}><SignalBadge s={ad.signal} /></td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
