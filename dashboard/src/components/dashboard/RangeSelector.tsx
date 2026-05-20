'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'

const PRESETS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '365d', value: 365 },
]

export default function RangeSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const currentDays = params.get('days')
  const currentFrom = params.get('from')
  const currentTo = params.get('to')
  const isCustom = !!(currentFrom && currentTo)

  const [showCustom, setShowCustom] = useState(isCustom)
  const [from, setFrom] = useState(currentFrom || '')
  const [to, setTo] = useState(currentTo || '')

  const selectPreset = (days: number) => {
    setShowCustom(false)
    const p = new URLSearchParams()
    p.set('days', String(days))
    router.push(`${pathname}?${p.toString()}`)
  }

  const applyCustom = () => {
    if (!from || !to) return
    const p = new URLSearchParams()
    p.set('from', from)
    p.set('to', to)
    router.push(`${pathname}?${p.toString()}`)
  }

  const activePreset = isCustom ? null : Number(currentDays || 7)

  const inputStyle = {
    backgroundColor: '#0F1117',
    border: '1px solid #2D3244',
    borderRadius: '6px',
    color: '#F1F5F9',
    fontSize: '12px',
    padding: '5px 8px',
    outline: 'none',
    colorScheme: 'dark' as const,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {/* Presets */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '8px', padding: '4px' }}>
        {PRESETS.map(o => (
          <button
            key={o.value}
            onClick={() => selectPreset(o.value)}
            style={{
              padding: '5px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: !isCustom && activePreset === o.value ? '#6366F1' : 'transparent',
              color: !isCustom && activePreset === o.value ? '#fff' : '#64748B',
              transition: 'all 0.15s',
            }}
          >
            {o.label}
          </button>
        ))}

        {/* Custom toggle */}
        <button
          onClick={() => setShowCustom(v => !v)}
          style={{
            padding: '5px 14px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: isCustom || showCustom ? '#6366F1' : 'transparent',
            color: isCustom || showCustom ? '#fff' : '#64748B',
            transition: 'all 0.15s',
          }}
        >
          Personalizado
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '8px', padding: '6px 10px' }}>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Desde</span>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            style={inputStyle}
          />
          <span style={{ fontSize: '11px', color: '#64748B' }}>hasta</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={applyCustom}
            disabled={!from || !to}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: from && to ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: from && to ? '#6366F1' : '#2D3244',
              color: from && to ? '#fff' : '#64748B',
            }}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
