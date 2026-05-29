'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  objectId: string
  objectType: 'campaign' | 'ad_set'
  budgetCents: number | null
  currency: string
  isActive: boolean
}

export default function BudgetControl({ objectId, objectType, budgetCents, currency, isActive }: Props) {
  const [cents, setCents] = useState(budgetCents)
  const [open, setOpen] = useState(false)
  const [addVal, setAddVal] = useState('')   // amount to ADD (not total)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  if (cents == null) return <span style={{ color: '#3A5270', fontSize: '11px' }}>—</span>

  const formatCurr = (c: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(c / 100)

  const addCents = parseFloat(addVal) * 100
  const newCents  = Math.round(cents + (isNaN(addCents) ? 0 : addCents))
  const isValid   = !isNaN(addCents) && addCents !== 0 && newCents >= 100

  async function apply() {
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/meta/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectId, objectType, newBudgetCents: newCents }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setCents(newCents)
      setOpen(false)
      setAddVal('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>

      {/* Trigger button — shows current budget */}
      <button
        onClick={() => { if (isActive) { setOpen(v => !v); setAddVal(''); setError('') } }}
        disabled={!isActive}
        style={{
          background: 'transparent', border: '1px solid #1A4080', borderRadius: '6px',
          color: '#E8EDF5', fontSize: '11px', fontWeight: 700, cursor: isActive ? 'pointer' : 'default',
          padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '6px',
          opacity: isActive ? 1 : 0.5,
        }}
        title={isActive ? 'Click para editar presupuesto' : 'Solo disponible para campañas activas'}
      >
        {formatCurr(cents)}<span style={{ fontSize: '9px', color: '#6366F1' }}>{isActive ? '✏' : ''}</span>
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />

          <div style={{
            position: 'absolute', right: 0, top: '32px', zIndex: 100,
            background: '#0E1B30', border: '1px solid #1A4080', borderRadius: '10px',
            padding: '16px', width: '240px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            {/* Current */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: '#7A90AA', marginBottom: '3px' }}>Presupuesto actual</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#E8EDF5' }}>{formatCurr(cents)}<span style={{ fontSize: '11px', color: '#7A90AA', fontWeight: 400 }}>/día</span></div>
            </div>

            {/* Add amount */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', color: '#7A90AA', marginBottom: '5px' }}>Agregar / quitar</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#7A90AA', fontSize: '12px' }}>+</span>
                <input
                  ref={inputRef}
                  type="number"
                  value={addVal}
                  onChange={e => setAddVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setOpen(false) }}
                  placeholder="0"
                  style={{
                    flex: 1, background: '#050C1E', border: '1px solid #1A4080',
                    borderRadius: '6px', color: '#E8EDF5', fontSize: '14px', fontWeight: 700,
                    padding: '6px 10px', textAlign: 'right',
                  }}
                />
              </div>
              <div style={{ fontSize: '10px', color: '#3A5270', marginTop: '3px' }}>Usá número negativo para bajar</div>
            </div>

            {/* Result preview */}
            {addVal !== '' && !isNaN(parseFloat(addVal)) && (
              <div style={{
                background: '#050C1E', borderRadius: '6px', padding: '8px 10px',
                marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '11px', color: '#7A90AA' }}>Nuevo presupuesto</span>
                <span style={{
                  fontSize: '14px', fontWeight: 800,
                  color: newCents >= 100 ? '#22C55E' : '#EF4444',
                }}>{newCents >= 100 ? formatCurr(newCents) : 'Mínimo $1'}</span>
              </div>
            )}

            {error && <div style={{ fontSize: '11px', color: '#EF4444', marginBottom: '8px' }}>⚠ {error}</div>}

            {/* Confirm */}
            <button
              onClick={apply}
              disabled={!isValid || loading}
              style={{
                width: '100%', padding: '8px', borderRadius: '7px', border: 'none',
                background: isValid && !loading ? '#6366F1' : '#1A4080',
                color: isValid && !loading ? '#fff' : '#7A90AA',
                fontSize: '13px', fontWeight: 700, cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Aplicando...' : isValid ? `Confirmar → ${formatCurr(newCents)}/día` : 'Ingresá un monto'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
