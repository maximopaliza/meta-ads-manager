'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const CPA_TARGET = 7
const CPA_BREAKEVEN = 15

function cpaColor(v: number | null) {
  if (!v) return '#64748B'
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
const qBg     = { good: '#22C55E1A', ok: '#F59E0B1A', bad: '#EF44441A', empty: '#1A1D27' }
const qBorder = { good: '#22C55E40', ok: '#F59E0B40', bad: '#EF444440', empty: '#2D3244' }

export default function DecisionCalendar({ days, currency }: { days: DayData[]; currency: string }) {
  const router = useRouter()
  const [fromDate, setFromDate] = useState<string | null>(null)
  const [toDate, setToDate] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const handleClick = (date: string) => {
    if (!picking) {
      setFromDate(date)
      setToDate(null)
      setPicking(true)
    } else {
      const [f, t] = date < fromDate! ? [date, fromDate!] : [fromDate!, date]
      setFromDate(f)
      setToDate(t)
      setPicking(false)
      router.push(`?from=${f}&to=${t}`)
    }
  }

  const clear = () => {
    setFromDate(null); setToDate(null); setPicking(false)
    router.push('?')
  }

  const inRange = (d: string) => {
    if (!fromDate) return false
    if (!toDate) return d === fromDate
    return d >= fromDate && d <= toDate
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
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', fontSize: '11px', flexWrap: 'wrap' }}>
        {picking ? (
          <span style={{ color: '#F59E0B', fontWeight: 600 }}>
            📅 Inicio: <strong>{fromDate}</strong> — ahora hacé clic en el día final
          </span>
        ) : fromDate && toDate ? (
          <span style={{ color: '#22C55E', fontWeight: 600 }}>
            ✅ Período: <strong>{fromDate}</strong> → <strong>{toDate}</strong>
          </span>
        ) : (
          <span style={{ color: '#64748B' }}>
            Hacé clic en un día para iniciar el período · clic en otro para terminar
          </span>
        )}
        {(fromDate || toDate || picking) && (
          <button onClick={clear} style={{
            fontSize: '10px', padding: '3px 10px', backgroundColor: '#2D3244',
            color: '#94A3B8', border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>✕ Limpiar</button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '11px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: `${goodCount} buenos`, color: '#22C55E', bg: qBg.good, border: qBorder.good },
          { label: `${okCount} regulares`, color: '#F59E0B', bg: qBg.ok, border: qBorder.ok },
          { label: `${badCount} malos`, color: '#EF4444', bg: qBg.bad, border: qBorder.bad },
          { label: `${days.length - goodCount - okCount - badCount} sin datos`, color: '#64748B', bg: qBg.empty, border: qBorder.empty },
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

      {/* Month calendars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))', gap: '24px' }}>
        {months.map(({ key, label, days: mDays }) => {
          const firstDow = (new Date(mDays[0].date + 'T12:00:00Z').getUTCDay() + 6) % 7 // Mon=0
          const cells: (DayData | null)[] = Array(firstDow).fill(null).concat(mDays)
          while (cells.length % 7 !== 0) cells.push(null)
          const weeks: (DayData | null)[][] = []
          for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

          return (
            <div key={key}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8', marginBottom: '6px', textTransform: 'capitalize' }}>
                {label}
              </div>
              <table style={{ borderCollapse: 'separate', borderSpacing: '2px', width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d, i) => (
                      <th key={d} style={{
                        fontSize: '9px', color: i === 6 ? '#6366F160' : '#64748B',
                        fontWeight: 600, textAlign: 'center', padding: '2px 0',
                      }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week, wi) => (
                    <tr key={wi}>
                      {week.map((day, di) => {
                        if (!day) return <td key={di} />
                        const dayNum = new Date(day.date + 'T12:00:00Z').getUTCDate()
                        const selected = inRange(day.date)
                        const isFrom = day.date === fromDate
                        const isTo = day.date === toDate
                        return (
                          <td
                            key={di}
                            onClick={() => handleClick(day.date)}
                            title={`${day.date} · Gasto: ${fmtCurrency(day.spend, currency)} · Ventas: ${day.purchases} · CPA: ${day.cpa ? fmtCurrency(day.cpa, currency) : '—'} · ROAS: ${day.roas ? `${day.roas.toFixed(2)}x` : '—'}`}
                            style={{
                              backgroundColor: selected ? '#6366F130' : qBg[day.quality],
                              border: (isFrom || isTo) ? '2px solid #6366F1' : selected ? '1px solid #6366F140' : `1px solid ${qBorder[day.quality]}`,
                              borderRadius: '5px',
                              padding: '3px 1px 4px',
                              textAlign: 'center',
                              verticalAlign: 'top',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            <div style={{ fontSize: '7px', color: '#64748B80', lineHeight: 1, marginBottom: '1px' }}>
                              {dayNum}
                            </div>
                            <div style={{
                              fontSize: day.quality === 'empty' ? '10px' : '17px',
                              fontWeight: 800,
                              color: selected ? '#F1F5F9' : qColor[day.quality],
                              lineHeight: 1,
                            }}>
                              {day.quality === 'empty' ? '·' : day.purchases}
                            </div>
                            <div style={{
                              fontSize: '7px', marginTop: '2px', fontWeight: 600,
                              color: day.cpa ? cpaColor(day.cpa) : '#2D3244',
                              lineHeight: 1,
                            }}>
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
