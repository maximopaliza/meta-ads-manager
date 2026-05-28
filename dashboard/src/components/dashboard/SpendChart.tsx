'use client'

import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { DailyMetric } from '@/types/meta'
import { formatDate } from '@/lib/utils'

interface SpendChartProps {
  data: DailyMetric[]
  currency?: string
}

const DARK_BG = '#111828'
const BORDER  = '#1E2A42'
const MUTED   = '#5E6E8A'
const TEXT    = '#E8EDF5'

export default function SpendChart({ data, currency = 'ARS' }: SpendChartProps) {
  const formatted = data.map(d => ({
    date: formatDate(d.date),
    Gasto:  d.spend,
    Ventas: d.purchases ?? 0,
    CPA:    (d as any).cpa   ?? 0,   // 0 si no hubo ventas
    ROAS:   d.roas            ?? 0,   // 0 si no hubo ventas
  }))

  const fmtCurr = (v: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency', currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v)

  const fmtAxis = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
    return `$${v.toFixed(0)}`
  }

  const tickStyle = { fill: MUTED, fontSize: 11 }
  const axisProps = { axisLine: false as const, tickLine: false as const }

  function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const vals: Record<string, number> = {}
    for (const p of payload) vals[p.dataKey] = p.value
    return (
      <div style={{
        backgroundColor: '#0C1020', border: `1px solid ${BORDER}`,
        borderRadius: '8px', padding: '10px 14px', fontSize: '12px', minWidth: '160px',
      }}>
        <div style={{ color: TEXT, marginBottom: '8px', fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ color: '#818CF8' }}>
            Gasto: <b>{fmtCurr(vals.Gasto ?? 0)}</b>
          </span>
          <span style={{ color: '#22C55E' }}>
            Ventas: <b>{vals.Ventas ?? 0}</b>
          </span>
          <span style={{ color: '#EF4444' }}>
            CPA: <b>{(vals.CPA ?? 0) > 0 ? fmtCurr(vals.CPA) : '—'}</b>
          </span>
          <span style={{ color: '#F59E0B' }}>
            ROAS: <b>{(vals.ROAS ?? 0) > 0 ? `${vals.ROAS.toFixed(2)}x` : '—'}</b>
          </span>
        </div>
      </div>
    )
  }

  const legend = [
    { color: '#6366F1', label: '■ Gasto' },
    { color: '#22C55E', label: '■ Ventas' },
    { color: '#EF4444', label: '— CPA' },
    { color: '#F59E0B', label: '— ROAS' },
  ]

  return (
    <div style={{ backgroundColor: DARK_BG, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: TEXT }}>
          📈 Histórico — {data.length} días
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {legend.map(l => (
            <span key={l.label} style={{ fontSize: '10px', color: l.color, fontWeight: 700 }}>
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ height: '230px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />

            {/* Eje izquierdo: Gasto en $ */}
            <YAxis
              yAxisId="spend"
              tick={tickStyle} {...axisProps}
              tickFormatter={fmtAxis}
              width={52}
            />

            {/* Eje derecho (visible): Ventas en cantidad */}
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={tickStyle} {...axisProps}
              allowDecimals={false}
              width={30}
            />

            {/* Ejes ocultos para escalar CPA y ROAS independientemente */}
            <YAxis yAxisId="cpa"  orientation="right" hide />
            <YAxis yAxisId="roas" orientation="right" hide />

            <Tooltip content={<CustomTooltip />} />

            {/* Barras de Gasto (morado, ancho completo) */}
            <Bar
              yAxisId="spend"
              dataKey="Gasto"
              fill="#6366F1"
              fillOpacity={0.55}
              stroke="#818CF8"
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
            />

            {/* Barras de Ventas (verde, lado a lado con Gasto) */}
            <Bar
              yAxisId="count"
              dataKey="Ventas"
              fill="#22C55E"
              fillOpacity={0.80}
              radius={[3, 3, 0, 0]}
            />

            {/* Línea de CPA (rojo) */}
            <Line
              yAxisId="cpa"
              type="monotone"
              dataKey="CPA"
              stroke="#EF4444"
              strokeWidth={2}
              dot={{ fill: '#EF4444', r: 2 }}
              activeDot={{ r: 4 }}
            />

            {/* Línea de ROAS (ámbar) */}
            <Line
              yAxisId="roas"
              type="monotone"
              dataKey="ROAS"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={{ fill: '#F59E0B', r: 2 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
