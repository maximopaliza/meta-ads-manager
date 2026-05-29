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
  const [cents, setCents]   = useState(budgetCents)
  const [open, setOpen]     = useState(false)
  const [val, setVal]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [open])

  if (cents == null) return <span style={{ color: '#3A5270', fontSize: '11px' }}>—</span>

  const fmt = (c: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(c / 100)

  const newCents  = Math.round(parseFloat(val) * 100)
  const isValid   = !isNaN(newCents) && newCents >= 100

  function openPopover() {
    if (!isActive) return
    setVal((cents! / 100).toFixed(0))  // pre-fill with current value
    setError('')
    setOpen(true)
  }

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
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>

      {/* Current budget — click to edit */}
      <button
        onClick={openPopover}
        disabled={!isActive}
        title={isActive ? 'Click para cambiar presupuesto' : 'Solo disponible para activos'}
        style={{
          background: 'transparent', border: '1px solid #1A4080', borderRadius: '6px',
          color: '#E8EDF5', fontSize: '11px', fontWeight: 700,
          cursor: isActive ? 'pointer' : 'default',
          padding: '3px 10px', opacity: isActive ? 1 : 0.5,
        }}
      >
        {fmt(cents!)} {isActive && <span style={{ fontSize: '9px', color: '#6366F1' }}>✏</span>}
      </button>

      {/* Popover */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', right: 'auto', top: 'auto', zIndex: 9999,
            transform: 'translateY(4px)',
            background: '#0E1B30', border: '1px solid #1A4080', borderRadius: '10px',
            padding: '16px', width: '220px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: '11px', color: '#7A90AA', marginBottom: '10px' }}>
              Presupuesto diario
            </div>

            {/* Input — pre-filled with current, user types new total */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span style={{ color: '#7A90AA', fontSize: '13px', fontWeight: 700 }}>$</span>
              <input
                ref={inputRef}
                type="number"
                min="1"
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setOpen(false) }}
                style={{
                  flex: 1, background: '#050C1E', border: '1px solid #6366F1',
                  borderRadius: '6px', color: '#E8EDF5', fontSize: '18px', fontWeight: 800,
                  padding: '6px 10px', textAlign: 'right', outline: 'none',
                }}
              />
              <span style={{ color: '#7A90AA', fontSize: '11px' }}>/día</span>
            </div>

            {error && <div style={{ fontSize: '11px', color: '#EF4444', marginBottom: '8px' }}>⚠ {error}</div>}

            <button
              onClick={apply}
              disabled={!isValid || loading}
              style={{
                width: '100%', padding: '9px', borderRadius: '7px', border: 'none',
                background: isValid && !loading ? '#6366F1' : '#1A4080',
                color: isValid && !loading ? '#fff' : '#7A90AA',
                fontSize: '13px', fontWeight: 700,
                cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Aplicando...' : 'Confirmar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
