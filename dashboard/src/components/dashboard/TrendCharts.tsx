'use client'

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface DayRow {
  date: string
  purchases: number
  cpa: number | null
  roas: number | null
  spend: number
  cpm: number | null
  ctr: number | null
  add_to_cart?: number
  landing_page_views?: number
  hook_rate?: number | null
  frequency?: number | null
}

interface Props {
  data: DayRow[]
  currency: string
  cpaTarget: number
  cpaBreakeven: number
}

const DARK_BG  = '#1A1D27'
const BORDER   = '#2D3244'
const MUTED    = '#64748B'
const TEXT     = '#F1F5F9'
const GREEN    = '#22C55E'
const RED      = '#EF4444'
const YELLOW   = '#F59E0B'
const INDIGO   = '#6366F1'
const SKY      = '#38BDF8'

function fmt(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function trendArrow(data: DayRow[], key: keyof DayRow): { sym: string; color: string; pct: string } {
  const vals = data.map(d => d[key] as number | null).filter(v => v != null && v > 0) as number[]
  if (vals.length < 2) return { sym: '—', color: MUTED, pct: '' }
  const first = vals[0], last = vals[vals.length - 1]
  const p = ((last - first) / first) * 100
  const invertedKeys = ['cpa', 'cpm']
  const isInverted = invertedKeys.includes(String(key))
  const isGood = isInverted ? p < 0 : p > 0
  return {
    sym: p > 0 ? '▲' : '▼',
    color: isGood ? GREEN : RED,
    pct: `${Math.abs(p).toFixed(0)}%`,
  }
}

function MiniCard({ title, color, children, trend }: {
  title: string; color: string
  children: React.ReactNode
  trend: { sym: string; color: string; pct: string }
}) {
  return (
    <div style={{
      backgroundColor: DARK_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: '10px',
      overflow: 'hidden',
      borderTop: `2px solid ${color}`,
    }}>
      <div style={{
        padding: '10px 14px 6px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        {trend.pct && (
          <span style={{ fontSize: '10px', color: trend.color, fontWeight: 700 }}>
            {trend.sym} {trend.pct}
          </span>
        )}
      </div>
      <div style={{ height: '90px', padding: '0 4px 8px' }}>
        {children}
      </div>
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1A1D27', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '11px' },
  labelStyle: { color: TEXT, marginBottom: '2px', fontWeight: 600 },
  itemStyle: { color: MUTED },
}

export default function TrendCharts({ data, currency, cpaTarget, cpaBreakeven }: Props) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const chartData = sorted.map(d => ({
    date: fmt(d.date),
    Ventas: d.purchases,
    CPA: d.cpa ? parseFloat(d.cpa.toFixed(1)) : null,
    ROAS: d.roas ? parseFloat(d.roas.toFixed(2)) : null,
    Gasto: Math.round(d.spend),
    CPM: d.cpm ? parseFloat(d.cpm.toFixed(2)) : null,
    CTR: d.ctr ? parseFloat(d.ctr.toFixed(2)) : null,
    ATC: d.add_to_cart || 0,
    HookRate: d.hook_rate ? parseFloat(d.hook_rate.toFixed(1)) : null,
    Frecuencia: d.frequency ? parseFloat(d.frequency.toFixed(2)) : null,
  }))

  const fmtCurr = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  const trendV  = trendArrow(sorted, 'purchases')
  const trendC  = trendArrow(sorted, 'cpa')
  const trendR  = trendArrow(sorted, 'roas')
  const trendG  = trendArrow(sorted, 'spend')
  const trendP  = trendArrow(sorted, 'cpm')
  const trendT  = trendArrow(sorted, 'ctr')
  const trendH  = trendArrow(sorted, 'hook_rate')
  const trendF  = trendArrow(sorted, 'frequency')

  const tickStyle = { fill: MUTED, fontSize: 9 }
  const axisProps = { axisLine: false, tickLine: false }

  const PURPLE = '#A78BFA'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>

      {/* Ventas */}
      <MiniCard title="Ventas" color={GREEN} trend={trendV}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [v, 'Ventas']) as any} />
            <Bar dataKey="Ventas" fill={GREEN} radius={[2, 2, 0, 0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* CPA */}
      <MiniCard title="CPA" color={trendC.color} trend={trendC}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `$${v}`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'CPA']) as any} />
            <ReferenceLine y={cpaTarget} stroke={GREEN} strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={cpaBreakeven} stroke={RED} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="CPA" stroke={RED} strokeWidth={2} dot={{ fill: RED, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ROAS */}
      <MiniCard title="ROAS" color={INDIGO} trend={trendR}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v}x`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v}x`, 'ROAS']) as any} />
            <ReferenceLine y={2.5} stroke={GREEN} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="ROAS" stroke={INDIGO} strokeWidth={2} dot={{ fill: INDIGO, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* Gasto */}
      <MiniCard title="Gasto" color={TEXT} trend={trendG}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'Gasto']) as any} />
            <Bar dataKey="Gasto" fill="#6366F1" radius={[2, 2, 0, 0]} opacity={0.65} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* CPM */}
      <MiniCard title="CPM (↓ mejor)" color={trendP.color} trend={trendP}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `$${v}`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'CPM']) as any} />
            <Line type="monotone" dataKey="CPM" stroke={YELLOW} strokeWidth={2} dot={{ fill: YELLOW, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* CTR */}
      <MiniCard title="CTR único (↑ mejor)" color={SKY} trend={trendT}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v}%`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v}%`, 'CTR único']) as any} />
            <Line type="monotone" dataKey="CTR" stroke={SKY} strokeWidth={2} dot={{ fill: SKY, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* Hook Rate */}
      <MiniCard title="Hook Rate (↑ mejor)" color={PURPLE} trend={trendH}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v}%`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v}%`, 'Hook Rate']) as any} />
            <ReferenceLine y={30} stroke={GREEN} strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={15} stroke={YELLOW} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="HookRate" stroke={PURPLE} strokeWidth={2} dot={{ fill: PURPLE, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* Frecuencia */}
      <MiniCard title="Frecuencia (↓ mejor)" color={trendF.color} trend={trendF}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v}x`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v}x`, 'Frecuencia']) as any} />
            <ReferenceLine y={3} stroke={YELLOW} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="Frecuencia" stroke={MUTED} strokeWidth={2} dot={{ fill: MUTED, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

    </div>
  )
}
