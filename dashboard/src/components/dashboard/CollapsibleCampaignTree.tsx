'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import TrendCharts from './TrendCharts'

// ─── Color helpers (inline to avoid pulling server-only lib/metrics) ──────────
const CPA_TARGET    = 7
const CPA_BREAKEVEN = 15

function cpaColor(v: number | null) {
  if (!v) return C_MUTED
  if (v <= CPA_TARGET) return C_GREEN
  if (v <= CPA_BREAKEVEN) return C_YELLOW
  return C_RED
}

function roasColor(v: number | null) {
  if (!v) return C_MUTED
  if (v >= 3.5) return C_GREEN
  if (v >= 1.5) return C_YELLOW
  return C_RED
}

function ctrColor(v: number | null) {
  if (!v) return C_MUTED
  if (v >= 2.0) return C_GREEN
  if (v >= 0.6) return '#F1F5F9'
  return C_RED
}

function cpmColor(v: number | null) {
  if (!v) return C_MUTED
  if (v <= 8)  return C_GREEN
  if (v <= 20) return C_YELLOW
  return C_RED
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface DayData {
  date: string
  spend: number
  purchases: number
  purchase_value: number
  impressions: number
  link_clicks: number
  unique_link_clicks: number
  reach: number
  landing_page_views: number
  add_to_cart: number
  checkout_initiated: number
  hook_rate: number | null
  frequency: number | null
  cpa: number | null
  roas: number | null
  ctr: number | null
  cpm: number | null
  cpc: number | null
  trafEf: number | null
  convWeb: number | null
  cost_per_atc: number | null
  video_avg_time_watched: number | null
}

export interface TreeAd {
  id: string
  name: string
  status: string
  days: DayData[]
}

export interface TreeAdSet {
  id: string
  name: string
  status: string
  days: DayData[]
  ads: TreeAd[]
}

export interface TreeCampaign {
  id: string
  name: string
  status: string
  days: DayData[]
  adSets: TreeAdSet[]
}

interface Props {
  campaigns: TreeCampaign[]
  currency: string
  today: string
  days: number
}

// ─── Colors ──────────────────────────────────────────────────────────────────
const C_GREEN  = '#22C55E'
const C_RED    = '#EF4444'
const C_YELLOW = '#F59E0B'
const C_MUTED  = '#64748B'
const C_TEXT   = '#F1F5F9'
const BG_GREEN = '#22c55e0d'
const BG_RED   = '#ef44440d'

function hookColor(v: number | null) {
  if (!v) return C_MUTED
  if (v >= 30) return C_GREEN
  if (v >= 15) return C_YELLOW
  return C_RED
}

function freqColor(v: number | null) {
  if (!v) return C_MUTED
  if (v > 3) return C_YELLOW
  return '#94A3B8'
}

function vsDay(curr: number | null, prev: number | null | undefined, invert = false) {
  if (prev == null || prev === 0 || curr == null) return { color: C_TEXT, bg: '' }
  const pct = (curr - prev) / Math.abs(prev)
  if (Math.abs(pct) < 0.01) return { color: C_TEXT, bg: '' }
  const good = invert ? pct < 0 : pct > 0
  return { color: good ? C_GREEN : C_RED, bg: good ? BG_GREEN : BG_RED }
}

function totalDelta(rows: DayData[], key: keyof DayData, invert = false) {
  const vals = rows.map(r => r[key] as number | null).filter(v => v != null && v > 0) as number[]
  if (vals.length < 2) return null
  const first = vals[0], last = vals[vals.length - 1]
  const pct = ((last - first) / first) * 100
  const good = invert ? pct < 0 : pct > 0
  return { pct, abs: last - first, good }
}

function pctFmt(p: number) { return `${p > 0 ? '+' : ''}${p.toFixed(0)}%` }

// ─── Shared table styles ──────────────────────────────────────────────────────
const th: any  = { padding: '7px 8px', textAlign: 'right' as const, color: C_MUTED, fontSize: '10px', fontWeight: 600, borderBottom: '1px solid #1A3050', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#151820' }
const td: any  = { padding: '7px 8px', textAlign: 'right' as const, fontSize: '11px', borderBottom: '1px solid #1a1d27' }
const thG: any = { ...th, borderLeft: '1px solid #1A3050' }
const tdG: any = { ...td, borderLeft: '1px solid #1A3050' }

function thGrp(color: string, fnt: any = {}): any {
  return {
    padding: '5px 8px 4px', textAlign: 'center' as const,
    fontSize: '9px', fontWeight: 700, color, textTransform: 'uppercase' as const,
    letterSpacing: '0.06em', backgroundColor: '#0e1015', borderBottom: '1px solid #1A3050',
    borderLeft: '1px solid #1A3050', whiteSpace: 'nowrap' as const, ...fnt,
  }
}

function TableHead({ compact = false }: { compact?: boolean }) {
  const fnt: any = { fontSize: compact ? '8px' : '9px' }
  return (
    <thead>
      <tr>
        <th style={{ ...th, textAlign: 'left' as const, position: 'sticky' as const, left: 0, zIndex: 3, ...fnt, backgroundColor: '#0e1015' }}></th>
        <th colSpan={4} style={thGrp('#22c55e80', fnt)}>💰 Conversiones</th>
        <th colSpan={4} style={thGrp('#ef444480', fnt)}>💸 Costos</th>
        <th colSpan={5} style={thGrp('#38bdf880', fnt)}>🌐 Tráfico</th>
        <th colSpan={3} style={thGrp('#a78bfa80', fnt)}>🎬 Video</th>
        <th colSpan={3} style={thGrp('#f59e0b80', fnt)}>🔁 Embudo</th>
        <th style={thGrp(C_MUTED, fnt)}>Δ 1→5</th>
      </tr>
      <tr>
        <th style={{ ...th, textAlign: 'left' as const, position: 'sticky' as const, left: 0, zIndex: 3, ...fnt }}>Día</th>
        <th style={{ ...th, ...fnt }}>Ventas</th>
        <th style={{ ...th, ...fnt }}>Valor</th>
        <th style={{ ...th, ...fnt }}>ROAS</th>
        <th style={{ ...th, ...fnt }}>CPA</th>
        <th style={{ ...thG, ...fnt }}>Gasto</th>
        <th style={{ ...th, ...fnt }}>Impr.</th>
        <th style={{ ...th, ...fnt }}>CPM</th>
        <th style={{ ...th, ...fnt }}>CPC</th>
        <th style={{ ...thG, ...fnt }}>CTR único</th>
        <th style={{ ...th, ...fnt }}>Clics</th>
        <th style={{ ...th, ...fnt }}>Visit. LP</th>
        <th style={{ ...th, ...fnt }}>Tráf. ef.</th>
        <th style={{ ...th, ...fnt }}>Conv.web</th>
        <th style={{ ...thG, ...fnt }}>Hook Rate</th>
        <th style={{ ...th, ...fnt }}>Freq.</th>
        <th style={{ ...th, ...fnt }}>Video avg</th>
        <th style={{ ...thG, ...fnt }}>ATC</th>
        <th style={{ ...th, ...fnt }}>Costo/ATC</th>
        <th style={{ ...th, ...fnt }}>Pagos</th>
        <th style={{ ...thG, textAlign: 'left' as const, ...fnt }}>Δ día 1→5</th>
      </tr>
    </thead>
  )
}

function renderDayRow(
  d: DayData,
  prev: DayData | undefined,
  isToday: boolean,
  isFirst: boolean,
  showDelta: boolean,
  days5: DayData[],
  currency: string,
) {
  const bg = isToday ? '#6366F108' : 'transparent'
  const dateLabel = formatDate(d.date)

  const dVentas = isFirst ? null : vsDay(d.purchases, prev?.purchases)
  const dValor  = isFirst ? null : vsDay(d.purchase_value, prev?.purchase_value)
  const dRoas   = isFirst ? null : vsDay(d.roas, prev?.roas)
  const dCpa    = isFirst ? null : vsDay(d.cpa, prev?.cpa, true)
  const dImpr   = isFirst ? null : vsDay(d.impressions, prev?.impressions)
  const dCpm    = isFirst ? null : vsDay(d.cpm, prev?.cpm, true)
  const dCtr    = isFirst ? null : vsDay(d.ctr, prev?.ctr)
  const dClics  = isFirst ? null : vsDay(d.unique_link_clicks, prev?.unique_link_clicks)
  const dLpv    = isFirst ? null : vsDay(d.landing_page_views, prev?.landing_page_views)
  const dTraf   = isFirst ? null : vsDay(d.trafEf, prev?.trafEf)
  const dConvW  = isFirst ? null : vsDay(d.convWeb, prev?.convWeb)
  const dHook   = isFirst ? null : vsDay(d.hook_rate, prev?.hook_rate)
  const dFreq   = isFirst ? null : vsDay(d.frequency, prev?.frequency, true)
  const dCpc    = isFirst ? null : vsDay(d.cpc, prev?.cpc, true)
  const dVideoA = isFirst ? null : vsDay(d.video_avg_time_watched, prev?.video_avg_time_watched)
  const dAtc    = isFirst ? null : vsDay(d.add_to_cart, prev?.add_to_cart)
  const dCostAtc = isFirst ? null : vsDay(d.cost_per_atc, prev?.cost_per_atc, true)
  const dPagos  = isFirst ? null : vsDay(d.checkout_initiated, prev?.checkout_initiated)

  const td4V = totalDelta(days5, 'purchases')
  const td4R = totalDelta(days5, 'roas')
  const td4C = totalDelta(days5, 'cpa', true)

  const cell = (base: any, vs: { color: string; bg: string } | null, overrideColor?: string): any => ({
    ...base,
    color: overrideColor || vs?.color || C_TEXT,
    backgroundColor: vs?.bg || base.backgroundColor || undefined,
  })

  return (
    <tr key={d.date} style={{ backgroundColor: bg }}>
      <td style={{ ...td, textAlign: 'left' as const, color: isToday ? '#6366F1' : C_MUTED, fontWeight: isToday ? 700 : 600, position: 'sticky' as const, left: 0, backgroundColor: isToday ? '#1e2035' : '#0E1B30', zIndex: 1, paddingLeft: '14px' }}>
        {dateLabel}
        {isToday && <span style={{ fontSize: '8px', color: '#6366F1', marginLeft: '5px', padding: '1px 4px', backgroundColor: '#6366F125', borderRadius: '3px' }}>HOY</span>}
      </td>
      <td style={cell(td, dVentas, dVentas ? undefined : (d.purchases > 0 ? C_GREEN : C_MUTED))}>{d.purchases || '—'}</td>
      <td style={cell(td, dValor)}>{d.purchase_value > 0 ? formatCurrency(d.purchase_value, currency) : '—'}</td>
      <td style={cell(td, dRoas, dRoas ? undefined : roasColor(d.roas))}>{d.roas ? `${d.roas.toFixed(2)}x` : '—'}</td>
      <td style={cell(td, dCpa, dCpa ? undefined : cpaColor(d.cpa))}>{d.cpa ? formatCurrency(d.cpa, currency) : '—'}</td>
      <td style={{ ...tdG, color: C_TEXT }}>{d.spend > 0 ? formatCurrency(d.spend, currency) : '—'}</td>
      <td style={{ ...td, color: dImpr?.color || '#94A3B8', backgroundColor: dImpr?.bg }}>{d.impressions > 0 ? new Intl.NumberFormat('es-AR').format(d.impressions) : '—'}</td>
      <td style={cell(td, dCpm, dCpm ? undefined : cpmColor(d.cpm))}>{d.cpm ? formatCurrency(d.cpm, currency) : '—'}</td>
      <td style={{ ...td, color: dCpc?.color || C_TEXT, backgroundColor: dCpc?.bg }}>{d.cpc ? formatCurrency(d.cpc, currency) : '—'}</td>
      <td style={cell({ ...tdG }, dCtr, dCtr ? undefined : ctrColor(d.ctr))}>{d.ctr ? `${d.ctr.toFixed(2)}%` : '—'}</td>
      <td style={{ ...td, color: dClics?.color || '#94A3B8', backgroundColor: dClics?.bg }}>{d.unique_link_clicks > 0 ? formatNumber(d.unique_link_clicks) : '—'}</td>
      <td style={{ ...td, color: dLpv?.color || '#94A3B8', backgroundColor: dLpv?.bg }}>{d.landing_page_views > 0 ? formatNumber(d.landing_page_views) : '—'}</td>
      <td style={{ ...td, color: dTraf?.color || C_TEXT, backgroundColor: dTraf?.bg }}>{d.trafEf ? `${d.trafEf.toFixed(1)}%` : '—'}</td>
      <td style={{ ...td, color: dConvW?.color || C_TEXT, backgroundColor: dConvW?.bg }}>{d.convWeb ? `${d.convWeb.toFixed(1)}%` : '—'}</td>
      <td style={cell({ ...tdG }, dHook, dHook ? undefined : hookColor(d.hook_rate))}>{d.hook_rate ? `${d.hook_rate.toFixed(1)}%` : '—'}</td>
      <td style={{ ...td, color: dFreq?.color || freqColor(d.frequency), backgroundColor: dFreq?.bg }}>{d.frequency ? d.frequency.toFixed(1) : '—'}</td>
      <td style={{ ...td, color: dVideoA?.color || C_TEXT, backgroundColor: dVideoA?.bg }}>{d.video_avg_time_watched ? `${d.video_avg_time_watched.toFixed(1)}s` : '—'}</td>
      <td style={{ ...tdG, color: dAtc?.color || C_TEXT, backgroundColor: dAtc?.bg }}>{d.add_to_cart || '—'}</td>
      <td style={{ ...td, color: dCostAtc?.color || C_TEXT, backgroundColor: dCostAtc?.bg }}>{d.cost_per_atc ? formatCurrency(d.cost_per_atc, currency) : '—'}</td>
      <td style={{ ...td, color: dPagos?.color || C_TEXT, backgroundColor: dPagos?.bg }}>{d.checkout_initiated || '—'}</td>
      {showDelta && (
        <td style={{ ...tdG, textAlign: 'left' as const, minWidth: '100px' }}>
          {td4V ? (
            <>
              <span style={{ fontSize: '11px', fontWeight: 700, color: td4V.good ? C_GREEN : C_RED }}>
                {td4V.abs > 0 ? '+' : ''}{td4V.abs.toFixed(0)} ventas
              </span>
              <br />
              {td4R && <span style={{ fontSize: '9px', color: td4R.good ? C_GREEN : C_RED }}>ROAS {pctFmt(td4R.pct)}</span>}
              {td4C && <span style={{ fontSize: '9px', color: td4C.good ? C_GREEN : C_RED, marginLeft: '4px' }}>CPA {pctFmt(td4C.pct)}</span>}
            </>
          ) : <span style={{ color: C_MUTED, fontSize: '10px' }}>Base</span>}
        </td>
      )}
    </tr>
  )
}

function DayTable({ days, today, currency, compact }: { days: DayData[]; today: string; currency: string; compact?: boolean }) {
  if (days.length === 0) return <div style={{ padding: '8px 14px', fontSize: '11px', color: C_MUTED }}>Sin datos en el período.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1500px' }}>
        <TableHead compact={compact} />
        <tbody>
          {days.map((d, i) => renderDayRow(
            d,
            i > 0 ? days[i - 1] : undefined,
            d.date === today,
            i === 0,
            i === days.length - 1,
            days,
            currency,
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Toggle button ────────────────────────────────────────────────────────────
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px', borderRadius: '5px', border: `1px solid ${active ? '#6366F1' : '#1A3050'}`,
        cursor: 'pointer', backgroundColor: active ? '#6366F120' : 'transparent',
        color: active ? '#818CF8' : C_MUTED, fontSize: '10px', fontWeight: active ? 700 : 400, flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ─── Mini chart panel ─────────────────────────────────────────────────────────
function ChartPanel({ days, currency }: { days: DayData[]; currency: string }) {
  if (days.length === 0) return null
  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid #1e2235', backgroundColor: '#0d1018' }}>
      <TrendCharts
        data={days as any}
        currency={currency}
        cpaTarget={CPA_TARGET}
        cpaBreakeven={CPA_BREAKEVEN}
      />
    </div>
  )
}

// ─── Ad card ─────────────────────────────────────────────────────────────────
function AdCard({ ad, today, currency }: { ad: TreeAd; today: string; currency: string }) {
  const [openTable, setOpenTable] = useState(false)
  const [openChart, setOpenChart] = useState(false)
  const totalSpend = ad.days.reduce((s, d) => s + d.spend, 0)
  const totalV = ad.days.reduce((s, d) => s + d.purchases, 0)
  const lastRoas = ad.days[ad.days.length - 1]?.roas
  const statusColor = ad.status === 'ACTIVE' ? C_GREEN : ad.status === 'PAUSED' ? C_YELLOW : C_MUTED

  return (
    <div style={{ borderTop: '1px solid #1e2235', opacity: ad.status === 'ACTIVE' ? 1 : 0.65 }}>
      <div style={{ padding: '7px 14px 7px 28px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: (openTable || openChart) ? '#13151f' : 'transparent' }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: '11px', color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          <Link href={`/ads/${ad.id}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{ad.name}</Link>
        </span>
        <span style={{ fontSize: '10px', color: totalV > 0 ? C_GREEN : C_MUTED, flexShrink: 0 }}>{totalV > 0 ? `${totalV} ventas` : '0 ventas'}</span>
        <span style={{ fontSize: '10px', color: '#64748B', flexShrink: 0 }}>{formatCurrency(totalSpend, currency)}</span>
        {lastRoas && <span style={{ fontSize: '10px', color: roasColor(lastRoas), flexShrink: 0 }}>ROAS {lastRoas.toFixed(2)}x</span>}
        <ToggleBtn active={openTable} onClick={() => setOpenTable(v => !v)}>▶ tabla</ToggleBtn>
        <ToggleBtn active={openChart} onClick={() => setOpenChart(v => !v)}>📈 gráfico</ToggleBtn>
      </div>
      {openTable && (
        <div style={{ backgroundColor: '#0d0f18', borderTop: '1px solid #1e2235' }}>
          <DayTable days={ad.days} today={today} currency={currency} compact />
        </div>
      )}
      {openChart && <ChartPanel days={ad.days} currency={currency} />}
    </div>
  )
}

// ─── Ad Set card ─────────────────────────────────────────────────────────────
function AdSetCard({ adSet, today, currency }: { adSet: TreeAdSet; today: string; currency: string }) {
  const [openTable, setOpenTable] = useState(false)
  const [openChart, setOpenChart] = useState(false)
  const [openAds, setOpenAds] = useState(false)
  const totalSpend = adSet.days.reduce((s, d) => s + d.spend, 0)
  const totalV = adSet.days.reduce((s, d) => s + d.purchases, 0)
  const lastRoas = adSet.days[adSet.days.length - 1]?.roas
  const statusColor = adSet.status === 'ACTIVE' ? C_GREEN : adSet.status === 'PAUSED' ? C_YELLOW : C_MUTED

  return (
    <div style={{ borderTop: '1px solid #1e2235', backgroundColor: '#111420', opacity: adSet.status === 'ACTIVE' ? 1 : 0.7 }}>
      <div style={{ padding: '8px 14px 8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: '11px', color: '#CBD5E1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 600 }}>
          {adSet.name}
        </span>
        <span style={{ fontSize: '10px', color: totalV > 0 ? C_GREEN : C_MUTED, flexShrink: 0 }}>{totalV > 0 ? `${totalV} ventas` : '0 ventas'}</span>
        <span style={{ fontSize: '10px', color: '#94A3B8', flexShrink: 0 }}>{formatCurrency(totalSpend, currency)}</span>
        {lastRoas && <span style={{ fontSize: '10px', color: roasColor(lastRoas), flexShrink: 0 }}>ROAS {lastRoas.toFixed(2)}x</span>}
        <ToggleBtn active={openTable} onClick={() => setOpenTable(v => !v)}>▶ tabla</ToggleBtn>
        <ToggleBtn active={openChart} onClick={() => setOpenChart(v => !v)}>📈 gráfico</ToggleBtn>
        {adSet.ads.length > 0 && (
          <ToggleBtn active={openAds} onClick={() => setOpenAds(v => !v)}>
            {adSet.ads.length} ads
          </ToggleBtn>
        )}
      </div>

      {openTable && (
        <div style={{ borderTop: '1px solid #1e2235', backgroundColor: '#0d1018' }}>
          <DayTable days={adSet.days} today={today} currency={currency} compact />
        </div>
      )}
      {openChart && <ChartPanel days={adSet.days} currency={currency} />}

      {openAds && adSet.ads.length > 0 && (
        <div style={{ borderTop: '1px solid #1e2235', backgroundColor: '#0f1120' }}>
          <div style={{ padding: '5px 14px 3px 28px', fontSize: '9px', color: C_MUTED, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            Ads · {adSet.ads.length}
          </div>
          {adSet.ads.map(ad => (
            <AdCard key={ad.id} ad={ad} today={today} currency={currency} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({ camp, today, currency, days }: { camp: TreeCampaign; today: string; currency: string; days: number }) {
  const [openChart, setOpenChart] = useState(false)
  const [openAdSets, setOpenAdSets] = useState(false)
  const totalSpend = camp.days.reduce((s, d) => s + d.spend, 0)
  const totalV = camp.days.reduce((s, d) => s + d.purchases, 0)
  const lastRoas = camp.days[camp.days.length - 1]?.roas
  const statusColor = camp.status === 'ACTIVE' ? C_GREEN : camp.status === 'PAUSED' ? C_YELLOW : C_MUTED

  return (
    <div style={{ backgroundColor: '#0E1B30', border: '1px solid #1A3050', borderRadius: '12px', overflow: 'hidden', opacity: camp.status === 'ACTIVE' ? 1 : 0.7 }}>
      {/* Campaign header */}
      <div style={{ padding: '9px 14px', borderBottom: '1px solid #1A3050', backgroundColor: '#151820', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0, display: 'inline-block' }} />
        <Link
          href={`/campaigns/${camp.id}`}
          style={{ fontSize: '12px', fontWeight: 600, color: C_TEXT, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}
        >
          {camp.name || camp.id}
        </Link>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: totalV > 0 ? C_GREEN : C_MUTED }}>{totalV > 0 ? `${totalV} ventas` : '0 ventas'}</span>
          <span style={{ fontSize: '10px', color: '#94A3B8' }}>{formatCurrency(totalSpend, currency)} gasto</span>
          {lastRoas && <span style={{ fontSize: '10px', color: roasColor(lastRoas) }}>ROAS {lastRoas.toFixed(2)}x hoy</span>}
          <ToggleBtn active={openChart} onClick={() => setOpenChart(v => !v)}>📈 gráfico</ToggleBtn>
          {camp.adSets.length > 0 && (
            <ToggleBtn active={openAdSets} onClick={() => setOpenAdSets(v => !v)}>
              {camp.adSets.length} conjuntos
            </ToggleBtn>
          )}
        </div>
      </div>

      {/* Campaign 5-day table (always visible) */}
      <DayTable days={camp.days} today={today} currency={currency} />

      {/* Chart (toggleable) */}
      {openChart && (
        <div style={{ borderTop: '1px solid #1A3050', backgroundColor: '#0d1018', padding: '16px' }}>
          <TrendCharts
            data={camp.days as any}
            currency={currency}
            cpaTarget={CPA_TARGET}
            cpaBreakeven={CPA_BREAKEVEN}
          />
        </div>
      )}

      {/* Ad Sets (collapsible) */}
      {openAdSets && camp.adSets.length > 0 && (
        <div style={{ borderTop: '1px solid #1A3050', backgroundColor: '#13151e' }}>
          <div style={{ padding: '6px 14px 4px', fontSize: '9px', color: C_MUTED, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            Conjuntos de anuncios · {days}d
          </div>
          {camp.adSets.map(adSet => (
            <AdSetCard key={adSet.id} adSet={adSet} today={today} currency={currency} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function CollapsibleCampaignTree({ campaigns, currency, today, days }: Props) {
  const active = campaigns.filter(c => c.status === 'ACTIVE')
  const paused = campaigns.filter(c => c.status !== 'ACTIVE')

  if (campaigns.length === 0) return null

  return (
    <div style={{ marginBottom: '20px' }}>
      {active.length > 0 && (
        <>
          <div style={{ fontSize: '11px', color: C_GREEN, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ● Campañas activas
            <span style={{ flex: 1, height: '1px', backgroundColor: '#22C55E20' }} />
            <span style={{ fontWeight: 400, fontSize: '10px', textTransform: 'none' as const, color: C_MUTED }}>
              últimas 5 fechas con datos · 📈 gráfico y conjuntos disponibles por campaña
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px', marginBottom: paused.length > 0 ? '20px' : '0' }}>
            {active.map(camp => (
              <CampaignCard key={camp.id} camp={camp} today={today} currency={currency} days={days} />
            ))}
          </div>
        </>
      )}

      {paused.length > 0 && (
        <>
          <div style={{ fontSize: '11px', color: C_YELLOW, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ● Campañas pausadas · con actividad en el período
            <span style={{ flex: 1, height: '1px', backgroundColor: '#F59E0B20' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
            {paused.map(camp => (
              <CampaignCard key={camp.id} camp={camp} today={today} currency={currency} days={days} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
