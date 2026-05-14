'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { DailyMetric } from '@/types/meta'
import { formatDate } from '@/lib/utils'

interface SpendChartProps {
  data: DailyMetric[]
  currency?: string
}

export default function SpendChart({ data, currency = 'ARS' }: SpendChartProps) {
  const formatted = data.map(d => ({
    date: formatDate(d.date),
    Gasto: Math.round(d.spend),
    ROAS: d.roas ? parseFloat(d.roas.toFixed(2)) : 0,
  }))

  const formatSpend = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  return (
    <div
      style={{
        backgroundColor: '#1A1D27',
        border: '1px solid #2D3244',
        borderRadius: '12px',
        padding: '24px',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#F1F5F9', marginBottom: '20px' }}>
        📈 Gasto últimos 7 días
      </h3>
      <div style={{ height: '220px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D3244" />
            <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="spend"
              tick={{ fill: '#64748B', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="roas"
              orientation="right"
              tick={{ fill: '#64748B', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v}x`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '8px' }}
              labelStyle={{ color: '#F1F5F9', marginBottom: '4px' }}
              itemStyle={{ color: '#64748B' }}
              formatter={((value: number, name: string) => [
                name === 'Gasto' ? formatSpend(value) : `${value}x`,
                name,
              ]) as any}
            />
            <Area
              yAxisId="spend"
              type="monotone"
              dataKey="Gasto"
              stroke="#6366F1"
              fill="url(#spendGradient)"
              strokeWidth={2}
            />
            <Area
              yAxisId="roas"
              type="monotone"
              dataKey="ROAS"
              stroke="#22C55E"
              fill="none"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
