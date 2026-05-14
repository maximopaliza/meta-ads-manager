'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { DailyMetric } from '@/types/meta'
import { formatDate } from '@/lib/utils'

interface CampaignChartProps {
  data: DailyMetric[]
  currency?: string
}

export default function CampaignChart({ data, currency = 'ARS' }: CampaignChartProps) {
  const formatted = data.map(d => ({
    date: formatDate(d.date),
    Gasto: Math.round(d.spend),
    ROAS: d.roas ? parseFloat(d.roas.toFixed(2)) : 0,
    Compras: d.purchases,
  }))

  const formatSpend = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div
        style={{
          backgroundColor: '#1A1D27',
          border: '1px solid #2D3244',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#F1F5F9', marginBottom: '16px' }}>Gasto y ROAS — 30 días</h4>
        <div style={{ height: '200px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3244" />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="spend" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="roas" orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}x`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '8px' }}
                formatter={((v: unknown, n: unknown) => [n === 'Gasto' ? formatSpend(v as number) : `${v}x`, n]) as any}
              />
              <Line yAxisId="spend" type="monotone" dataKey="Gasto" stroke="#6366F1" strokeWidth={2} dot={false} />
              <Line yAxisId="roas" type="monotone" dataKey="ROAS" stroke="#22C55E" strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#64748B' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#1A1D27',
          border: '1px solid #2D3244',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#F1F5F9', marginBottom: '16px' }}>Compras — 30 días</h4>
        <div style={{ height: '200px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3244" />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '8px' }}
              />
              <Line type="monotone" dataKey="Compras" stroke="#F59E0B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
