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
  unique_link_clicks?: number
  checkout_initiated?: number
  purchase_value?: number
  video_avg_time_watched?: number | null
  hook_rate?: number | null
  frequency?: number | null
  cpc?: number | null
  trafEf?: number | null
  convWeb?: number | null
  cost_per_atc?: number | null
}

interface Props {
  data: DayRow[]
  currency: string
  cpaTarget: number
  cpaBreakeven: number
}

const DARK_BG = '#071428'
const BORDER  = '#1A4080'
const MUTED   = '#7A90AA'
const TEXT    = '#F1F5F9'
const GREEN   = '#22C55E'
const RED     = '#EF4444'
const YELLOW  = '#F59E0B'
const INDIGO  = '#6366F1'
const SKY     = '#38BDF8'
const ORANGE  = '#FB923C'
const PURPLE  = '#A78BFA'
const VIOLET  = '#818CF8'

function fmt(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

// Keys where lower = better
const LOWER_IS_BETTER = new Set(['cpa', 'cpm', 'cpc', 'cost_per_atc', 'frequency'])

function trendArrow(data: DayRow[], key: keyof DayRow): { sym: string; color: string; pct: string } {
  const vals = data.map(d => d[key] as number | null).filter(v => v != null && v > 0) as number[]
  if (vals.length < 2) return { sym: '—', color: MUTED, pct: '' }
  const first = vals[0], last = vals[vals.length - 1]
  const p = ((last - first) / first) * 100
  const isGood = LOWER_IS_BETTER.has(String(key)) ? p < 0 : p > 0
  return {
    sym:   p > 0 ? '▲' : '▼',
    color: isGood ? GREEN : RED,
    pct:   `${Math.abs(p).toFixed(1)}%`,
  }
}

function MiniCard({ title, color, children, trend }: {
  title: string; color: string
  children: React.ReactNode
  trend: { sym: string; color: string; pct: string }
}) {
  return (
    <div style={{
      backgroundColor: DARK_BG, border: `1px solid ${BORDER}`,
      borderRadius: '10px', overflow: 'hidden', borderTop: `2px solid ${color}`,
    }}>
      <div style={{ padding: '10px 14px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
  contentStyle: { backgroundColor: '#071428', border: `1px solid ${BORDER}`, borderRadius: '8px', fontSize: '11px' },
  labelStyle:   { color: TEXT, marginBottom: '2px', fontWeight: 600 },
  itemStyle:    { color: MUTED },
}
const tickStyle  = { fill: MUTED, fontSize: 9 }
const axisProps  = { axisLine: false, tickLine: false }

export default function TrendCharts({ data, currency, cpaTarget, cpaBreakeven }: Props) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const fmtCurr = (v: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(v)

  const fmtAxis = (v: number) => {
    if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `$${(v/1_000).toFixed(0)}k`
    return `$${v.toFixed(0)}`
  }

  const chartData = sorted.map(d => ({
    date:     fmt(d.date),
    Ventas:   d.purchases,
    CPA:      d.cpa,
    ROAS:     d.roas,
    Gasto:    d.spend,
    CPM:      d.cpm,
    CTR:      d.ctr,
    ATC:      d.add_to_cart  ?? 0,
    HookRate: d.hook_rate,
    Frec:     d.frequency,
    CPC:      d.cpc,
    Clics:    d.unique_link_clicks ?? 0,
    LPV:      d.landing_page_views ?? 0,
    TrafEf:   d.trafEf,
    ConvWeb:  d.convWeb,
    VideoAvg: d.video_avg_time_watched,
    Pagos:    d.checkout_initiated ?? 0,
    CostoATC: d.cost_per_atc,
    ValorConv: d.purchase_value ?? 0,
  }))

  // Trend arrows
  const tV   = trendArrow(sorted, 'purchases')
  const tC   = trendArrow(sorted, 'cpa')
  const tR   = trendArrow(sorted, 'roas')
  const tG   = trendArrow(sorted, 'spend')
  const tPM  = trendArrow(sorted, 'cpm')
  const tCTR = trendArrow(sorted, 'ctr')
  const tATC = trendArrow(sorted, 'add_to_cart')
  const tHR  = trendArrow(sorted, 'hook_rate')
  const tFR  = trendArrow(sorted, 'frequency')
  const tCPC = trendArrow(sorted, 'cpc')
  const tCLK = trendArrow(sorted, 'unique_link_clicks')
  const tLPV = trendArrow(sorted, 'landing_page_views')
  const tTE  = trendArrow(sorted, 'trafEf')
  const tCW  = trendArrow(sorted, 'convWeb')
  const tVA  = trendArrow(sorted, 'video_avg_time_watched')
  const tPAG = trendArrow(sorted, 'checkout_initiated')
  const tCAT = trendArrow(sorted, 'cost_per_atc')
  const tVC  = trendArrow(sorted, 'purchase_value')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>

      {/* ── 1. Ventas ── */}
      <MiniCard title="Ventas" color={GREEN} trend={tV}>
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

      {/* ── 2. CPA ── */}
      <MiniCard title="CPA (↓ mejor)" color={tC.color} trend={tC}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'CPA']) as any} />
            <ReferenceLine y={cpaTarget}    stroke={GREEN} strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={cpaBreakeven} stroke={RED}   strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="CPA" stroke={RED} strokeWidth={2} dot={{ fill: RED, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 3. ROAS ── */}
      <MiniCard title="ROAS" color={INDIGO} trend={tR}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(1)}x`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}x`, 'ROAS']) as any} />
            <ReferenceLine y={2.5} stroke={GREEN} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="ROAS" stroke={INDIGO} strokeWidth={2} dot={{ fill: INDIGO, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 4. Gasto ── */}
      <MiniCard title="Gasto" color={TEXT} trend={tG}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'Gasto']) as any} />
            <Bar dataKey="Gasto" fill={INDIGO} radius={[2, 2, 0, 0]} opacity={0.65} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 5. CPM ── */}
      <MiniCard title="CPM (↓ mejor)" color={tPM.color} trend={tPM}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'CPM']) as any} />
            <Line type="monotone" dataKey="CPM" stroke={YELLOW} strokeWidth={2} dot={{ fill: YELLOW, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 6. CTR ── */}
      <MiniCard title="CTR único (↑ mejor)" color={SKY} trend={tCTR}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(1)}%`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}%`, 'CTR único']) as any} />
            <Line type="monotone" dataKey="CTR" stroke={SKY} strokeWidth={2} dot={{ fill: SKY, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 7. CPC ── */}
      <MiniCard title="CPC (↓ mejor)" color={tCPC.color} trend={tCPC}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'CPC']) as any} />
            <Line type="monotone" dataKey="CPC" stroke={ORANGE} strokeWidth={2} dot={{ fill: ORANGE, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 8. ATC ── */}
      <MiniCard title="Add to Cart" color={ORANGE} trend={tATC}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [v, 'ATC']) as any} />
            <Bar dataKey="ATC" fill={ORANGE} radius={[2, 2, 0, 0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 9. Clics únicos ── */}
      <MiniCard title="Clics únicos" color={VIOLET} trend={tCLK}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [v, 'Clics únicos']) as any} />
            <Bar dataKey="Clics" fill={VIOLET} radius={[2, 2, 0, 0]} opacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 10. LP Views ── */}
      <MiniCard title="Visitas LP" color={SKY} trend={tLPV}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [v, 'Visitas LP']) as any} />
            <Bar dataKey="LPV" fill={SKY} radius={[2, 2, 0, 0]} opacity={0.75} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 11. Tráfico efectivo ── */}
      <MiniCard title="Tráfico ef. (↑ mejor)" color={tTE.color} trend={tTE}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(0)}%`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}%`, 'Tráf. ef.']) as any} />
            <Line type="monotone" dataKey="TrafEf" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 12. Conv. web ── */}
      <MiniCard title="Conv. web (↑ mejor)" color={tCW.color} trend={tCW}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(0)}%`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}%`, 'Conv. web']) as any} />
            <Line type="monotone" dataKey="ConvWeb" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 13. Hook Rate ── */}
      <MiniCard title="Hook Rate (↑ mejor)" color={PURPLE} trend={tHR}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(0)}%`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}%`, 'Hook Rate']) as any} />
            <ReferenceLine y={30} stroke={GREEN}  strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={15} stroke={YELLOW} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="HookRate" stroke={PURPLE} strokeWidth={2} dot={{ fill: PURPLE, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 14. Video avg ── */}
      <MiniCard title="Video avg (s)" color={tVA.color} trend={tVA}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(0)}s`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}s`, 'Video avg']) as any} />
            <Line type="monotone" dataKey="VideoAvg" stroke={PURPLE} strokeWidth={2} dot={{ fill: PURPLE, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 15. Pagos iniciados ── */}
      <MiniCard title="Pagos iniciados" color={ORANGE} trend={tPAG}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [v, 'Pagos inic.']) as any} />
            <Bar dataKey="Pagos" fill={ORANGE} radius={[2, 2, 0, 0]} opacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 16. Costo ATC ── */}
      <MiniCard title="Costo ATC (↓ mejor)" color={tCAT.color} trend={tCAT}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'Costo ATC']) as any} />
            <Line type="monotone" dataKey="CostoATC" stroke={RED} strokeWidth={2} dot={{ fill: RED, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 17. Valor conv. ── */}
      <MiniCard title="Valor conv." color={tVC.color} trend={tVC}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={fmtAxis} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtCurr(v), 'Valor conv.']) as any} />
            <Bar dataKey="ValorConv" fill={GREEN} radius={[2, 2, 0, 0]} opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </MiniCard>

      {/* ── 18. Frecuencia ── */}
      <MiniCard title="Frecuencia (↓ mejor)" color={tFR.color} trend={tFR}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={tickStyle} {...axisProps} />
            <YAxis tick={tickStyle} {...axisProps} tickFormatter={v => `${v.toFixed(1)}x`} />
            <Tooltip {...tooltipStyle} formatter={((v: number) => [`${v.toFixed(2)}x`, 'Frecuencia']) as any} />
            <ReferenceLine y={3} stroke={YELLOW} strokeDasharray="4 2" strokeWidth={1} />
            <Line type="monotone" dataKey="Frec" stroke={MUTED} strokeWidth={2} dot={{ fill: MUTED, r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </MiniCard>

    </div>
  )
}
