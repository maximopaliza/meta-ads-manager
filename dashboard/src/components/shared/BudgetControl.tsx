'use client'

import { useState } from 'react'

interface Props {
  objectId: string
  objectType: 'campaign' | 'ad_set'
  budgetCents: number | null   // null = lifetime budget or not set
  currency: string
  isActive: boolean
}

export default function BudgetControl({ objectId, objectType, budgetCents, currency, isActive }: Props) {
  const [cents, setCents] = useState(budgetCents)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')

  if (cents == null) return <span style={{ color: '#3A5270', fontSize: '11px' }}>—</span>

  const safeCents = cents  // guaranteed non-null after the check above
  const curr = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
  const display = curr.format(safeCents / 100)

  // Increment: $5 if < $50 budget, $10 otherwise
  const delta = safeCents < 5000 ? 500 : 1000

  async function apply(newCents: number): Promise<void> {
    if (newCents < 100) return
    setLoading(true)
    try {
      const res = await fetch('/api/meta/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectId, objectType, newBudgetCents: newCents }),
      })
      const data = await res.json()
      if (!data.error) setCents(newCents)
    } catch (_) {}
    setLoading(false)
  }

  function startEdit() {
    setEditVal((safeCents / 100).toFixed(0))
    setEditing(true)
  }

  function confirmEdit() {
    const v = parseFloat(editVal)
    if (!isNaN(v) && v > 0) apply(Math.round(v * 100))
    setEditing(false)
  }

  const btnStyle: React.CSSProperties = {
    width: '20px', height: '20px', border: '1px solid #1A4080',
    background: '#050C1E', color: loading ? '#3A5270' : '#C0CFDF',
    borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer',
    fontSize: '13px', lineHeight: '1', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, padding: 0,
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          autoFocus
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={confirmEdit}
          onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditing(false) }}
          style={{ width: '60px', background: '#050C1E', border: '1px solid #6366F1', borderRadius: '4px', color: '#E8EDF5', fontSize: '11px', padding: '2px 5px', textAlign: 'right' }}
        />
        <button onClick={confirmEdit} style={{ ...btnStyle, width: 'auto', padding: '0 6px', color: '#22C55E', borderColor: '#22C55E35' }}>✓</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
      <button onClick={() => apply(safeCents - delta)} disabled={loading || !isActive} style={btnStyle}>−</button>
      <span
        onClick={isActive ? startEdit : undefined}
        style={{ fontSize: '11px', color: '#E8EDF5', fontWeight: 600, minWidth: '52px', textAlign: 'center', cursor: isActive ? 'pointer' : 'default', padding: '1px 4px', borderRadius: '3px' }}
        title={isActive ? 'Click para editar' : ''}
      >
        {display}
      </span>
      <button onClick={() => apply(safeCents + delta)} disabled={loading || !isActive} style={btnStyle}>+</button>
    </div>
  )
}
