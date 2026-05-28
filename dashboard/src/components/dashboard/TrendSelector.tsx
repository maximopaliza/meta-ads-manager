'use client'

import { useState } from 'react'
import TrendCharts from './TrendCharts'

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

interface CampData {
  id: string
  name: string
  status: string
  days: DayRow[]
}

interface AsData {
  id: string
  name: string
  status: string
  campId: string
  days: DayRow[]
}

interface AdData {
  id: string
  name: string
  status: string
  asId: string
  days: DayRow[]
}

interface Props {
  accountDays: DayRow[]
  campaigns: CampData[]
  adSets: AsData[]
  ads: AdData[]
  currency: string
  cpaTarget: number
  cpaBreakeven: number
  rangeDays: number
}

const BORDER  = '#1A3050'
const MUTED   = '#64748B'
const TEXT    = '#F1F5F9'
const INDIGO  = '#6366F1'

function shorten(s: string, max = 24) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'ACTIVE' ? '#22C55E' : '#64748B'
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: color, marginRight: 5, flexShrink: 0 }} />
}

export default function TrendSelector({
  accountDays, campaigns, adSets, ads,
  currency, cpaTarget, cpaBreakeven, rangeDays,
}: Props) {
  const [campId, setCampId] = useState<string | null>(null)
  const [asId,   setAsId]   = useState<string | null>(null)
  const [adId,   setAdId]   = useState<string | null>(null)

  const selCamp = campaigns.find(c => c.id === campId)
  const campAs  = adSets.filter(as => as.campId === campId)
  const selAs   = campAs.find(as => as.id === asId)
  const asAds   = ads.filter(ad => ad.asId === asId)
  const selAd   = asAds.find(ad => ad.id === adId)

  const activeData: DayRow[] =
    adId && selAd   ? selAd.days :
    asId && selAs   ? selAs.days :
    campId && selCamp ? selCamp.days :
    accountDays

  const activeLabel =
    adId && selAd     ? `Ad: ${selAd.name}` :
    asId && selAs     ? `Conjunto: ${selAs.name}` :
    campId && selCamp ? `Campaña: ${selCamp.name}` :
    'Cuenta completa'

  const btn = (active: boolean) => ({
    padding: '5px 12px',
    borderRadius: '6px',
    border: `1px solid ${active ? INDIGO : BORDER}`,
    backgroundColor: active ? `${INDIGO}20` : 'transparent',
    color: active ? INDIGO : MUTED,
    fontSize: '11px',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.12s',
  })

  const selectStyle: React.CSSProperties = {
    backgroundColor: '#060810',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT,
    fontSize: '11px',
    padding: '5px 8px',
    outline: 'none',
    cursor: 'pointer',
    maxWidth: '260px',
  }

  return (
    <div>
      {/* ── Selector hierarchy ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>

        {/* Level 1 — Cuenta / Campañas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 60 }}>Campaña</span>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setCampId(null); setAsId(null); setAdId(null) }}
              style={btn(!campId)}
            >
              Cuenta
            </button>
            {campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => { setCampId(c.id); setAsId(null); setAdId(null) }}
                style={btn(campId === c.id)}
              >
                <StatusDot status={c.status} />
                {shorten(c.name)}
              </button>
            ))}
          </div>
        </div>

        {/* Level 2 — Conjuntos (shown when campaign selected) */}
        {campId && campAs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingLeft: 4, borderLeft: `2px solid ${BORDER}`, marginLeft: 8 }}>
            <span style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 60 }}>Conjunto</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {campAs.map(as => (
                <button
                  key={as.id}
                  onClick={() => { setAsId(as.id); setAdId(null) }}
                  style={btn(asId === as.id)}
                >
                  <StatusDot status={as.status} />
                  {shorten(as.name)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Level 3 — Ads (shown when adset selected) */}
        {asId && asAds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingLeft: 4, borderLeft: `2px solid ${BORDER}`, marginLeft: 16 }}>
            <span style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 60 }}>Ad</span>
            {asAds.length <= 8 ? (
              // Buttons for small count
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {asAds.map(ad => (
                  <button
                    key={ad.id}
                    onClick={() => setAdId(ad.id)}
                    style={btn(adId === ad.id)}
                  >
                    <StatusDot status={ad.status} />
                    {shorten(ad.name)}
                  </button>
                ))}
              </div>
            ) : (
              // Select for large count
              <select
                value={adId || ''}
                onChange={e => setAdId(e.target.value || null)}
                style={selectStyle}
              >
                <option value="">— elige un ad —</option>
                {asAds.map(ad => (
                  <option key={ad.id} value={ad.id}>
                    {ad.status === 'ACTIVE' ? '● ' : '○ '}{ad.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── Active label ── */}
      <div style={{ fontSize: '11px', color: MUTED, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>Mostrando:</span>
        <span style={{ color: INDIGO, fontWeight: 600 }}>{activeLabel}</span>
        <span>·</span>
        <span>{activeData.length} días</span>
        {activeData.length === 0 && <span style={{ color: '#EF4444' }}> — sin datos</span>}
      </div>

      {/* ── Charts ── */}
      {activeData.length > 0 ? (
        <TrendCharts
          data={activeData}
          currency={currency}
          cpaTarget={cpaTarget}
          cpaBreakeven={cpaBreakeven}
        />
      ) : (
        <div style={{ color: MUTED, fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>
          Sin datos para el período seleccionado.
        </div>
      )}
    </div>
  )
}
