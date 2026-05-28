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

  const hasNoParams = !currentDays && !currentFrom && !currentTo
  const isSingleDay = !!(currentFrom && currentTo && currentFrom === currentTo)
  // "Día" está activo cuando: no hay params (default = hoy) o hay from=to
  const isDay = isSingleDay || hasNoParams
  const [showCustom, setShowCustom] = useState(isCustom && !isSingleDay)
  const [showDay, setShowDay] = useState(isSingleDay)
  const [from, setFrom] = useState(currentFrom || '')
  const [to, setTo] = useState(currentTo || '')
  const [singleDay, setSingleDay] = useState(isSingleDay ? currentFrom! : '')

  const selectPreset = (days: number) => {
    setShowCustom(false)
    setShowDay(false)
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

  const applySingleDay = () => {
    if (!singleDay) return
    const p = new URLSearchParams()
    p.set('from', singleDay)
    p.set('to', singleDay)
    router.push(`${pathname}?${p.toString()}`)
  }

  // activePreset solo se activa cuando hay ?days=N explícito
  const activePreset = (!isCustom && currentDays) ? Number(currentDays) : null

  // Label del período actual
  const periodLabel = (() => {
    if (hasNoParams) return 'Hoy'
    if (isSingleDay) return currentFrom!.slice(5).replace('-', '/')
    if (isCustom) return `${currentFrom!.slice(5).replace('-', '/')} → ${currentTo!.slice(5).replace('-', '/')}`
    return `Últimos ${currentDays}d`
  })()

  const inputStyle = {
    backgroundColor: '#030810',
    border: '1px solid #1A4080',
    borderRadius: '6px',
    color: '#F1F5F9',
    fontSize: '12px',
    padding: '5px 8px',
    outline: 'none',
    colorScheme: 'dark' as const,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>

      {/* Label período activo */}
      <div style={{
        fontSize: '11px', fontWeight: 600, color: '#6366F1',
        backgroundColor: '#6366F115', border: '1px solid #6366F130',
        borderRadius: '6px', padding: '4px 10px', whiteSpace: 'nowrap' as const,
      }}>
        📅 {periodLabel}
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: '#071428', border: '1px solid #1A4080', borderRadius: '8px', padding: '4px' }}>
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
              backgroundColor: activePreset === o.value ? '#6366F1' : 'transparent',
              color: activePreset === o.value ? '#fff' : '#7A90AA',
              transition: 'all 0.15s',
            }}
          >
            {o.label}
          </button>
        ))}

        {/* Single day toggle */}
        <button
          onClick={() => { setShowDay(v => !v); setShowCustom(false) }}
          style={{
            padding: '5px 14px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: isDay || (showDay && !showCustom) ? '#6366F1' : 'transparent',
            color: isDay || (showDay && !showCustom) ? '#fff' : '#7A90AA',
            transition: 'all 0.15s',
          }}
        >
          Día
        </button>

        {/* Custom range toggle */}
        <button
          onClick={() => { setShowCustom(v => !v); setShowDay(false) }}
          style={{
            padding: '5px 14px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: (isCustom && !isSingleDay) || (showCustom && !showDay) ? '#6366F1' : 'transparent',
            color: (isCustom && !isSingleDay) || (showCustom && !showDay) ? '#fff' : '#7A90AA',
            transition: 'all 0.15s',
          }}
        >
          Rango
        </button>
      </div>

      {/* Single day input */}
      {showDay && !showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#071428', border: '1px solid #1A4080', borderRadius: '8px', padding: '6px 10px' }}>
          <span style={{ fontSize: '11px', color: '#7A90AA' }}>Día</span>
          <input
            type="date"
            value={singleDay}
            onChange={e => setSingleDay(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={applySingleDay}
            disabled={!singleDay}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: singleDay ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: singleDay ? '#6366F1' : '#1A4080',
              color: singleDay ? '#fff' : '#7A90AA',
            }}
          >
            Ir
          </button>
        </div>
      )}

      {/* Custom date range inputs */}
      {showCustom && !showDay && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#071428', border: '1px solid #1A4080', borderRadius: '8px', padding: '6px 10px' }}>
          <span style={{ fontSize: '11px', color: '#7A90AA' }}>Desde</span>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            style={inputStyle}
          />
          <span style={{ fontSize: '11px', color: '#7A90AA' }}>hasta</span>
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
              backgroundColor: from && to ? '#6366F1' : '#1A4080',
              color: from && to ? '#fff' : '#7A90AA',
            }}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
