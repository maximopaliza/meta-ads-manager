'use client'

import { useState, useCallback } from 'react'

// ── Color helpers ────────────────────────────────────────────────────────────
const G = '#22C55E', Y = '#F59E0B', R = '#EF4444', M = '#7A90AA', TEXT = '#E8EDF5'
const SURFACE = '#0C0F1A', BORDER = '#1A4080'

const CPA_TARGET    = 7
const CPA_BREAKEVEN = 15

function cpaColor(v: number | null) {
  if (!v) return M
  return v <= CPA_TARGET ? G : v <= CPA_BREAKEVEN ? Y : R
}
function roasColor(v: number | null) {
  if (!v) return M
  return v >= 3.5 ? G : v >= 1.5 ? Y : R
}
function hkColor(v: number | null) { return !v ? M : v >= 30 ? G : v >= 15 ? Y : R }
function freqColor(v: number | null) { return !v ? M : v < 2.5 ? G : v < 3.5 ? Y : R }

function fmt(v: number | null, type: string, currency: string): string {
  if (v == null) return '—'
  const curr = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const pct  = (n: number) => `${n.toFixed(1)}%`
  const num  = (n: number) => new Intl.NumberFormat('es-AR').format(Math.round(n))
  switch (type) {
    case 'currency': return curr(v)
    case 'pct':     return pct(v)
    case 'num':     return num(v)
    case 'x':       return `${v.toFixed(2)}x`
    case 's':       return `${v.toFixed(0)}s`
    default:        return String(v)
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
interface AdRow {
  id: string
  name: string
  status: string
  effectiveActive: boolean
  thumbnail: string | null
  score: { label: string; color: string; bg: string; border: string; priority: number }
  campName: string
  asName: string
  adSetId: string
  campId: string
  // Budget info
  budgetCents: number | null       // current daily budget in cents
  budgetObjectId: string           // ad_set or campaign id
  budgetObjectType: 'ad_set' | 'campaign'
  isCBO: boolean
  // Metrics
  t: {
    spend: number; purchases: number; purchase_value: number; impressions: number
    unique_link_clicks: number; landing_page_views: number; add_to_cart: number
    checkout_initiated: number; cpm: number | null; ctr: number | null; cpc: number | null
    cost_per_atc: number | null; cpa: number | null; roas: number | null
    traf_ef: number | null; conv_web: number | null; frequency: number | null
    hook_rate: number | null; video_avg: number | null; hold_rate: number | null
    thruplay_rate: number | null; ctr_post_view: number | null
  } | null
}

interface Props {
  rows: AdRow[]
  currency: string
  totalSpend: number
  totalPurchases: number
  totalRoas: number | null
  totalCpa: number | null
  scoreCount: { escalar: number; bueno: number; ok: number; revisar: number }
  rangeStart: string
  rangeEnd: string
  label: string
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000080', backdropFilter: 'blur(4px)' }}>
      <div style={{ backgroundColor: '#0E1B30', border: '1px solid #1A4080', borderRadius: '14px', padding: '24px 28px', maxWidth: '380px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: '14px', color: TEXT, marginBottom: '20px', lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #1A4080', backgroundColor: 'transparent', color: M, fontSize: '13px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#6366F1', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            ✅ Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ad Card ───────────────────────────────────────────────────────────────────
function AdCard({ row, currency, onStatusChange, onBudgetChange }: {
  row: AdRow
  currency: string
  onStatusChange: (adId: string, action: 'pause' | 'activate') => void
  onBudgetChange: (row: AdRow, newCents: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [budgetEdit, setBudgetEdit] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const t = row.t
  const budgetDisplay = row.budgetCents != null ? (row.budgetCents / 100).toFixed(2) : null

  const startBudgetEdit = () => {
    if (row.budgetCents == null) return
    setBudgetEdit((row.budgetCents / 100).toFixed(2))
  }
  const cancelBudgetEdit = () => setBudgetEdit(null)
  const saveBudgetEdit = () => {
    if (budgetEdit == null) return
    const newCents = Math.round(parseFloat(budgetEdit) * 100)
    if (isNaN(newCents) || newCents < 100) return
    onBudgetChange(row, newCents)
    setBudgetEdit(null)
  }
  const adjustBudget = (deltaCents: number) => {
    if (row.budgetCents == null) return
    const newCents = Math.max(100, row.budgetCents + deltaCents)
    onBudgetChange(row, newCents)
  }

  // All metrics definition
  const allMetrics = t ? [
    { label: 'Impr.',      value: t.impressions,           type: 'num',      color: '#A8BCD0' },
    { label: 'CPM',        value: t.cpm,                   type: 'currency', color: '#A8BCD0' },
    { label: 'CTR único',  value: t.ctr,                   type: 'pct',      color: '#A8BCD0' },
    { label: 'Clics',      value: t.unique_link_clicks,    type: 'num',      color: '#A8BCD0' },
    { label: 'CPC',        value: t.cpc,                   type: 'currency', color: '#A8BCD0' },
    { label: 'Visit. LP',  value: t.landing_page_views,    type: 'num',      color: '#A8BCD0' },
    { label: 'Tráf. ef.',  value: t.traf_ef,               type: 'pct',      color: '#A8BCD0' },
    { label: 'Conv. web',  value: t.conv_web,              type: 'pct',      color: '#A8BCD0' },
    { label: 'Hook Rate',  value: t.hook_rate,             type: 'pct',      color: hkColor(t.hook_rate) },
    { label: 'Hold Rate',  value: t.hold_rate,             type: 'pct',      color: '#A8BCD0' },
    { label: 'Thruplay',   value: t.thruplay_rate,         type: 'pct',      color: '#A8BCD0' },
    { label: 'Frecuencia', value: t.frequency,             type: 'num',      color: freqColor(t.frequency) },
    { label: 'Video avg',  value: t.video_avg,             type: 's',        color: '#A8BCD0' },
    { label: 'ATC',        value: t.add_to_cart,           type: 'num',      color: '#A8BCD0' },
    { label: 'Costo ATC',  value: t.cost_per_atc,          type: 'currency', color: '#A8BCD0' },
    { label: 'Pagos',      value: t.checkout_initiated,    type: 'num',      color: '#A8BCD0' },
  ] : []

  return (
    <div style={{
      backgroundColor: SURFACE,
      border: `1px solid ${row.score.border || BORDER}`,
      borderRadius: '14px',
      overflow: 'hidden',
      opacity: row.effectiveActive ? 1 : 0.6,
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* ── Portada ── */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#050810', overflow: 'hidden', flexShrink: 0 }}>
        {row.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.thumbnail}
            alt={row.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #0A0D18 0%, #0F1225 100%)' }}>
            <span style={{ fontSize: '32px', opacity: 0.2 }}>🎬</span>
            <span style={{ fontSize: '9px', color: '#2A3560', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sin portada</span>
          </div>
        )}

        {/* Status badge */}
        <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
          <span style={{ fontSize: '8px', fontWeight: 700, padding: '3px 7px', borderRadius: '5px', color: row.score.color, backgroundColor: '#07091199', border: `1px solid ${row.score.border}`, backdropFilter: 'blur(4px)' }}>
            {row.score.label}
          </span>
        </div>

        {/* Active badge */}
        <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
          <span style={{ fontSize: '8px', fontWeight: 600, padding: '3px 7px', borderRadius: '5px', color: row.effectiveActive ? G : M, backgroundColor: '#07091199', border: `1px solid ${row.effectiveActive ? '#22C55E30' : '#1E2438'}`, backdropFilter: 'blur(4px)' }}>
            {row.effectiveActive ? '● Activo' : '⏸ Pausado'}
          </span>
        </div>

        {/* Hook chip */}
        {t?.hook_rate != null && (
          <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, padding: '3px 7px', borderRadius: '5px', color: hkColor(t.hook_rate), backgroundColor: '#070911BB', border: `1px solid ${hkColor(t.hook_rate)}40`, backdropFilter: 'blur(4px)' }}>
              Hook {t.hook_rate.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: TEXT, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
          {row.name}
        </div>
        <div style={{ fontSize: '10px', color: '#5A7090', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#2D3458', marginRight: '4px' }}>Conj.</span>{row.asName}
        </div>
        <div style={{ fontSize: '10px', color: '#3A5070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ marginRight: '4px' }}>Camp.</span>{row.campName}
        </div>
      </div>

      {/* ── Budget control ── */}
      <div style={{ padding: '6px 12px', borderTop: `1px solid #0E1520`, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '9px', color: '#3A5272', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          {row.isCBO ? 'CBO' : 'Conj.'}
        </span>
        {budgetEdit != null ? (
          <>
            <span style={{ fontSize: '9px', color: M, marginRight: '2px' }}>{currency}</span>
            <input
              type="number"
              value={budgetEdit}
              onChange={e => setBudgetEdit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveBudgetEdit(); if (e.key === 'Escape') cancelBudgetEdit() }}
              style={{ flex: 1, minWidth: 0, backgroundColor: '#0A1628', border: '1px solid #2A60C0', borderRadius: '6px', color: TEXT, fontSize: '12px', padding: '3px 6px', outline: 'none' }}
              autoFocus
            />
            <button onClick={saveBudgetEdit} style={{ padding: '3px 8px', borderRadius: '5px', border: 'none', backgroundColor: '#22C55E', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>✓</button>
            <button onClick={cancelBudgetEdit} style={{ padding: '3px 6px', borderRadius: '5px', border: 'none', backgroundColor: '#1A1D27', color: M, fontSize: '11px', cursor: 'pointer' }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => adjustBudget(-500)} title="−5 unidades" style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #1A4080', backgroundColor: 'transparent', color: M, fontSize: '14px', cursor: row.budgetCents ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
            <div onClick={startBudgetEdit} title="Clic para editar" style={{ flex: 1, textAlign: 'center', fontSize: '11px', fontWeight: 700, color: budgetDisplay ? TEXT : M, cursor: 'pointer', padding: '2px 0' }}>
              {budgetDisplay ? `${currency} ${budgetDisplay}/día` : 'Sin presupuesto'}
            </div>
            <button onClick={() => adjustBudget(500)} title="+5 unidades" style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #1A4080', backgroundColor: 'transparent', color: M, fontSize: '14px', cursor: row.budgetCents ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
          </>
        )}
      </div>

      {/* ── Métricas principales ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Ventas', value: t?.purchases ?? null, color: (t?.purchases || 0) > 0 ? G : M, display: t?.purchases != null ? String(t.purchases) : '—' },
          { label: 'CPA',    value: t?.cpa ?? null,       color: cpaColor(t?.cpa ?? null),          display: fmt(t?.cpa ?? null, 'currency', currency) },
          { label: 'Gasto',  value: t?.spend ?? null,     color: TEXT,                               display: fmt(t?.spend ?? null, 'currency', currency) },
          { label: 'ROAS',   value: t?.roas ?? null,      color: roasColor(t?.roas ?? null),         display: fmt(t?.roas ?? null, 'x', currency) },
        ].map((kpi, i) => (
          <div key={kpi.label} style={{ padding: '9px 6px', textAlign: 'center', borderRight: i < 3 ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.display}</div>
            <div style={{ fontSize: '8px', color: M, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* ── Controles ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, display: 'flex', gap: '6px', padding: '8px 10px', alignItems: 'center' }}>
        {/* Toggle pause/active */}
        <button
          onClick={() => onStatusChange(row.id, row.status === 'ACTIVE' ? 'pause' : 'activate')}
          disabled={loading}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: '7px',
            border: `1px solid ${row.status === 'ACTIVE' ? '#EF444440' : '#22C55E40'}`,
            backgroundColor: row.status === 'ACTIVE' ? '#EF444410' : '#22C55E10',
            color: row.status === 'ACTIVE' ? R : G,
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          {row.status === 'ACTIVE' ? '⏸ Pausar' : '▶ Activar'}
        </button>

        {/* Expand metrics */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: '6px 10px',
            borderRadius: '7px',
            border: `1px solid ${expanded ? '#6366F140' : '#1A4080'}`,
            backgroundColor: expanded ? '#6366F115' : 'transparent',
            color: expanded ? '#818CF8' : M,
            fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {expanded ? '▲ Ocultar' : '▼ Métricas'}
        </button>
      </div>

      {/* ── Panel expandible con todas las métricas ── */}
      {expanded && t && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 12px', backgroundColor: '#080D1C' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {allMetrics.map(m => (
              <div key={m.label} style={{ backgroundColor: '#0E1828', borderRadius: '6px', padding: '7px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: m.color, lineHeight: 1 }}>
                  {m.type === 'num'      ? fmt(typeof m.value === 'number' ? m.value : null, 'num', currency)
                  : m.type === 'currency' ? fmt(typeof m.value === 'number' ? m.value : null, 'currency', currency)
                  : m.type === 'pct'     ? fmt(typeof m.value === 'number' ? m.value : null, 'pct', currency)
                  : m.type === 'x'       ? fmt(typeof m.value === 'number' ? m.value : null, 'x', currency)
                  : m.type === 's'       ? fmt(typeof m.value === 'number' ? m.value : null, 's', currency)
                  : '—'}
                </div>
                <div style={{ fontSize: '8px', color: '#3A5272', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '3px' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main grid component ───────────────────────────────────────────────────────
export default function CreativosGrid({ rows: initialRows, currency, totalSpend, totalPurchases, totalRoas, totalCpa, scoreCount, rangeStart, rangeEnd, label }: Props) {
  const [rows, setRows] = useState<AdRow[]>(initialRows)
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const handleStatusChange = useCallback((adId: string, action: 'pause' | 'activate') => {
    const row = rows.find(r => r.id === adId)
    if (!row) return
    const msg = action === 'pause'
      ? `¿Pausar el anuncio "${row.name}"?`
      : `¿Activar el anuncio "${row.name}"?`

    setConfirm({
      message: msg,
      onConfirm: async () => {
        setConfirm(null)
        const res = await fetch('/api/meta/ad-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adId, action }),
        })
        const data = await res.json()
        if (data.ok) {
          setRows(prev => prev.map(r => r.id === adId ? { ...r, status: data.status, effectiveActive: data.status === 'ACTIVE' } : r))
          showToast(action === 'pause' ? 'Anuncio pausado ✓' : 'Anuncio activado ✓', true)
        } else {
          showToast(`Error: ${data.error}`, false)
        }
      }
    })
  }, [rows])

  const handleBudgetChange = useCallback((row: AdRow, newCents: number) => {
    const newDisplay = (newCents / 100).toFixed(2)
    const msg = `¿Cambiar presupuesto diario de "${row.isCBO ? row.campName : row.asName}" a ${currency} ${newDisplay}/día?`

    setConfirm({
      message: msg,
      onConfirm: async () => {
        setConfirm(null)
        const res = await fetch('/api/meta/budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectId: row.budgetObjectId, objectType: row.budgetObjectType, newBudgetCents: newCents }),
        })
        const data = await res.json()
        if (data.ok) {
          setRows(prev => prev.map(r => {
            if (row.isCBO) {
              return r.campId === row.campId ? { ...r, budgetCents: newCents } : r
            }
            return r.adSetId === row.adSetId ? { ...r, budgetCents: newCents } : r
          }))
          showToast(`Presupuesto actualizado a ${currency} ${newDisplay}/día ✓`, true)
        } else {
          showToast(`Error: ${data.error}`, false)
        }
      }
    })
  }, [currency])


  return (
    <>
      {/* ── Confirm Dialog ── */}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 200, backgroundColor: toast.ok ? '#22C55E18' : '#EF444418', border: `1px solid ${toast.ok ? '#22C55E50' : '#EF444450'}`, borderRadius: '10px', padding: '12px 18px', color: toast.ok ? G : R, fontSize: '13px', fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── Período ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: M }}>Período:</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: TEXT }}>{label}</span>
          <span style={{ fontSize: '10px', color: '#4A6080' }}>({rangeStart} → {rangeEnd})</span>
        </div>
      </div>

      {/* ── Semáforo ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
        {[
          { label: '🚀 Escalar', count: scoreCount.escalar, color: G, border: '#22C55E20' },
          { label: '✅ Bueno',   count: scoreCount.bueno,   color: G, border: '#22C55E15' },
          { label: '🟡 OK',      count: scoreCount.ok,      color: Y, border: '#F59E0B20' },
          { label: '⛔ Revisar', count: scoreCount.revisar, color: '#EF4444', border: '#EF444420' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: SURFACE, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '26px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</div>
            <div style={{ fontSize: '11px', color: s.color, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Totales ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { icon: '💸', label: 'Gasto total',  value: totalSpend > 0   ? new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(totalSpend)   : '—', color: TEXT },
          { icon: '🛒', label: 'Total ventas', value: totalPurchases > 0 ? `${totalPurchases} ventas` : '—',                                                                              color: totalPurchases > 0 ? G : M },
          { icon: '📈', label: 'ROAS general', value: totalRoas != null ? `${totalRoas.toFixed(2)}x` : '—',                                                                               color: roasColor(totalRoas) },
          { icon: '💰', label: 'CPA general',  value: totalCpa  != null ? new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(totalCpa)  : '—', color: cpaColor(totalCpa) },
        ].map((s) => (
          <div key={s.label} style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 16px' }}>
            <div style={{ fontSize: '9px', color: M, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Grilla ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {rows.map(row => (
          <AdCard
            key={row.id}
            row={row}
            currency={currency}
            onStatusChange={handleStatusChange}
            onBudgetChange={handleBudgetChange}
          />
        ))}
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: M, fontSize: '13px' }}>
          Sin anuncios con datos en el período seleccionado.
        </div>
      )}
    </>
  )
}
