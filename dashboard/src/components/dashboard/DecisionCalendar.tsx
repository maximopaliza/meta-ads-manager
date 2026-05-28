'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const CPA_TARGET = 7
const CPA_BREAKEVEN = 15

function cpaColor(v: number | null) {
  if (!v) return '#7A90AA'
  return v <= CPA_TARGET ? '#22C55E' : v <= CPA_BREAKEVEN ? '#F59E0B' : '#EF4444'
}

function fmtCurrency(val: number, currency: string) {
  if (val === 0) return ''
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val)
}

type DayData = {
  date: string
  quality: 'good' | 'ok' | 'bad' | 'empty'
  spend: number
  purchases: number
  cpa: number | null
  roas: number | null
}

const qColor  = { good: '#22C55E', ok: '#F59E0B', bad: '#EF4444', empty: '#374151' }
const qBg     = { good: '#22C55E1A', ok: '#F59E0B1A', bad: '#EF44441A', empty: '#0E1B30' }
const qBorder = { good: '#22C55E40', ok: '#F59E0B40', bad: '#EF444440', empty: '#1A3050' }

// mode='display': solo visual, sin clicks
// mode='twodays': click selecciona día A y día B via ?a=&b= en URL
type CalMode = 'display' | 'twodays'

export default function DecisionCalendar({
  days, currency, mode = 'display', dayA, dayB,
}: {
  days: DayData[]
  currency: string
  mode?: CalMode
  dayA?: string   // día A actualmente seleccionado (para resaltar)
  dayB?: string   // día B actualmente seleccionado (para resaltar)
}) {
  const router = useRouter()
  // Slot activo: si A no está elegido, empezar por A; si A está pero B no, por B
  const [slot, setSlot] = useState<'a' | 'b'>(() => dayA && !dayB ? 'b' : 'a')

  const handleClick = (date: string) => {
    if (mode !== 'twodays') return
    if (slot === 'a') {
      router.push(`?a=${date}${dayB ? `&b=${dayB}` : ''}`)
      setSlot('b')
    } else {
      router.push(`?a=${dayA || ''}&b=${date}`)
      setSlot('a')
    }
  }

  // Build month groups
  const monthMap = new Map<string, DayData[]>()
  for (const d of days) {
    const k = d.date.slice(0, 7)
    if (!monthMap.has(k)) monthMap.set(k, [])
    monthMap.get(k)!.push(d)
  }
  const months = [...monthMap.entries()].map(([key, mDays]) => {
    const dt = new Date(mDays[0].date + 'T12:00:00Z')
    const label = dt.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return { key, label, days: mDays }
  })

  const goodCount = days.filter(d => d.quality === 'good').length
  const okCount   = days.filter(d => d.quality === 'ok').length
  const badCount  = days.filter(d => d.quality === 'bad').length

  return (
    <div>
      {/* Selector de slots — solo en modo twodays */}
      {mode === 'twodays' && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setSlot('a')}
            style={{
              padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
              backgroundColor: slot === 'a' ? '#EF444420' : '#0E1B30',
              color: slot === 'a' ? '#EF4444' : '#7A90AA',
              border: `1px solid ${slot === 'a' ? '#EF444450' : '#1A3050'}`,
              cursor: 'pointer',
            }}
          >
            🔴 Día A {dayA ? `— ${dayA}` : '— elegir'}
          </button>
          <button
            onClick={() => setSlot('b')}
            style={{
              padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
              backgroundColor: slot === 'b' ? '#22C55E20' : '#0E1B30',
              color: slot === 'b' ? '#22C55E' : '#7A90AA',
              border: `1px solid ${slot === 'b' ? '#22C55E50' : '#1A3050'}`,
              cursor: 'pointer',
            }}
          >
            🟢 Día B {dayB ? `— ${dayB}` : '— elegir'}
          </button>
          <span style={{ fontSize: '10px', color: '#7A90AA' }}>
            Seleccionando: <strong style={{ color: slot === 'a' ? '#EF4444' : '#22C55E' }}>Día {slot.toUpperCase()}</strong> — clic en el calendario
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '11px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: `${goodCount} buenos`,   color: '#22C55E', bg: qBg.good, border: qBorder.good },
          { label: `${okCount} regulares`,  color: '#F59E0B', bg: qBg.ok,   border: qBorder.ok   },
          { label: `${badCount} malos`,     color: '#EF4444', bg: qBg.bad,  border: qBorder.bad  },
          { label: `${days.length - goodCount - okCount - badCount} sin datos`, color: '#7A90AA', bg: qBg.empty, border: qBorder.empty },
        ].map(s => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '2px', backgroundColor: s.bg, border: `1px solid ${s.border}`, display: 'inline-block' }} />
            <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
          </span>
        ))}
        <span style={{ color: '#4A5268', fontSize: '10px', marginLeft: 'auto' }}>
          Número = ventas · abajo = CPA
        </span>
      </div>

      {/* Month calendars — scroll horizontal */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', paddingBottom: '10px', scrollSnapType: 'x mandatory' }}>
        {months.map(({ key, label, days: mDays }) => {
          const firstDow = (new Date(mDays[0].date + 'T12:00:00Z').getUTCDay() + 6) % 7
          const cells: (DayData | null)[] = Array(firstDow).fill(null).concat(mDays)
          while (cells.length % 7 !== 0) cells.push(null)
          const weeks: (DayData | null)[][] = []
          for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

          return (
            <div key={key} style={{ flexShrink: 0, width: '252px', scrollSnapAlign: 'start' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#A8BCD0', marginBottom: '6px', textTransform: 'capitalize', letterSpacing: '0.02em' }}>
                {label}
              </div>
              <table style={{ borderCollapse: 'separate', borderSpacing: '2px', width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d, i) => (
                      <th key={d} style={{ fontSize: '9px', color: i === 6 ? '#6366F160' : '#7A90AA', fontWeight: 600, textAlign: 'center', padding: '2px 0' }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week, wi) => (
                    <tr key={wi}>
                      {week.map((day, di) => {
                        if (!day) return <td key={di} />
                        const dayNum = new Date(day.date + 'T12:00:00Z').getUTCDate()
                        const isA = day.date === dayA
                        const isB = day.date === dayB
                        return (
                          <td
                            key={di}
                            onClick={() => handleClick(day.date)}
                            title={`${day.date} · ${fmtCurrency(day.spend, currency)} gasto · ${day.purchases} ventas · CPA: ${day.cpa ? fmtCurrency(day.cpa, currency) : '—'} · ROAS: ${day.roas ? `${day.roas.toFixed(2)}x` : '—'}`}
                            style={{
                              backgroundColor: isA ? '#EF444430' : isB ? '#22C55E30' : qBg[day.quality],
                              border: isA ? '2px solid #EF4444' : isB ? '2px solid #22C55E' : `1px solid ${qBorder[day.quality]}`,
                              borderRadius: '5px',
                              padding: '4px 1px 5px',
                              textAlign: 'center',
                              verticalAlign: 'top',
                              cursor: mode === 'twodays' ? 'pointer' : 'default',
                              userSelect: 'none',
                            }}
                          >
                            {/* Número de día — visible */}
                            <div style={{ fontSize: '9px', color: isA ? '#EF444490' : isB ? '#22C55E90' : '#7A90AA', lineHeight: 1, marginBottom: '2px', fontWeight: 500 }}>{dayNum}</div>
                            {/* Ventas */}
                            <div style={{
                              fontSize: day.quality === 'empty' ? '11px' : '16px',
                              fontWeight: 800,
                              color: isA ? '#EF4444' : isB ? '#22C55E' : qColor[day.quality],
                              lineHeight: 1,
                            }}>
                              {day.quality === 'empty' ? '·' : day.purchases}
                            </div>
                            {/* CPA */}
                            <div style={{ fontSize: '7px', marginTop: '2px', fontWeight: 600, color: day.cpa ? cpaColor(day.cpa) : '#1A3050', lineHeight: 1 }}>
                              {day.cpa ? fmtCurrency(day.cpa, currency) : day.spend > 0 ? <span style={{ color: '#EF444460' }}>$∞</span> : ''}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
