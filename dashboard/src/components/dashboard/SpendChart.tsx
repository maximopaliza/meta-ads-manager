'use client'

import {
  AreaChart, Area,
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

const DARK_BG = '#1A1D27'
const BORDER  = '#2D3244'
const MUTED   = '#64748B'
const TEXT    = '#F1F5F9'

export default function SpendChart({ data, currency = 'ARS' }: SpendChartProps) {
  const formatted = data.map(d => ({
    date: formatDate(d.date),
    Gasto:  d.spend,
    ROAS:   d.roas  ?? null,
    Ventas: d.purchases,
    CPA:    (d as any).cpa ?? null,
  }))

  const fmtCurr = (v: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency', currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)

  const fmtAxis = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
    return `$${v.toFixed(0)}`
  }

  const tickStyle = { fill: MUTED, fontSize: 11 }
  const axisProps = { axisLine: false, tickLine: false }
  const tooltipStyle = {
    contentStyle: { backgroundColor: DARK_BG, border: `1px solid ${BORDER}`, borderRadius: '8px' },
    labelStyle:   { color: TEXT, marginBottom: '4px' },
    itemStyle:    { color: MUTED },
  }

  return (
    <div style={{ backgroundColor: DARK_BG, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '24px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: TEXT, marginBottom: '16px' }}>
        📈 Histórico — últimos {data.length} días
      </h3>

      {/* ── Panel 1: Gasto + ROAS ── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: '#6366F1', fontWeight: 600 }}>▬ Gasto</span>
        <span style={{ fontSize: '10px', color: '#22C55E', fontWeight: 600 }}>— ROAS</span>
      </div>
      <div style={{ height: '160px', marginBottom: '16px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis yAxisId="spend" tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} width={52} />
            <YAxis yAxisId="roas" orientation="right" tick={tickStyle} {...axisProps}
              tickFormatter={v => `${v.toFixed(1)}x`} width={36} />
            <Tooltip {...tooltipStyle}
              formatter={((value: number, name: string) => [
                name === 'Gasto' ? fmtCurr(value) : `${value.toFixed(2)}x`,
                name,
              ]) as any}
            />
            <Area yAxisId="spend" type="monotone" dataKey="Gasto"
              stroke="#6366F1" fill="url(#spendGrad)" strokeWidth={2} />
            <Area yAxisId="roas" type="monotone" dataKey="ROAS"
              stroke="#22C55E" fill="none" strokeWidth={2} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ borderTop: `1px solid ${BORDER}`, marginBottom: '16px' }} />

      {/* ── Panel 2: Ventas + CPA ── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: '#22C55E', fontWeight: 600 }}>■ Ventas</span>
        <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 600 }}>— CPA</span>
      </div>
      <div style={{ height: '140px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis yAxisId="ventas" tick={tickStyle} {...axisProps} allowDecimals={false} width={28} />
            <YAxis yAxisId="cpa" orientation="right" tick={tickStyle} {...axisProps}
              tickFormatter={fmtAxis} width={52} />
            <Tooltip {...tooltipStyle}
              formatter={((value: number, name: string) => [
                name === 'CPA' ? fmtCurr(value) : String(value),
                name,
              ]) as any}
            />
            <Bar yAxisId="ventas" dataKey="Ventas" fill="#22C55E" radius={[3, 3, 0, 0]} opacity={0.85} />
            <Line yAxisId="cpa" type="monotone" dataKey="CPA"
              stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444', r: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
