'use client'

// VideoRetentionFunnel — muestra el funnel de retención de un ad de video
// Uso: <VideoRetentionFunnel metrics={m} label="Creativo A" />
//
// Props opcionales para modo comparación (día A vs día B):
// <VideoRetentionFunnel metrics={mA} compareMetrics={mB} label="Hook Rate" />

interface VideoMetrics {
  impressions?: number | null
  video_3s_views?: number | null
  video_p25_watched?: number | null
  video_p50_watched?: number | null
  video_p75_watched?: number | null
  video_p95_watched?: number | null
  video_thruplay?: number | null
  hook_rate?: number | null
  hold_rate?: number | null
  thruplay_rate?: number | null
  ctr_post_view?: number | null
  video_avg_time_watched?: number | null
  unique_link_clicks?: number | null
}

interface Props {
  metrics: VideoMetrics
  compareMetrics?: VideoMetrics   // si se pasa, modo comparación
  label?: string
  compareLabel?: string
  compact?: boolean               // versión compacta para tablas
}

const GREEN  = '#22C55E'
const YELLOW = '#F59E0B'
const RED    = '#EF4444'
const MUTED  = '#64748B'
const BORDER = '#1A3050'
const SURFACE = '#0E1B30'

function hookColor(v: number | null | undefined) {
  if (!v) return MUTED
  return v >= 30 ? GREEN : v >= 15 ? YELLOW : RED
}

function holdColor(v: number | null | undefined) {
  if (!v) return MUTED
  return v >= 50 ? GREEN : v >= 30 ? YELLOW : RED
}

function thruplayColor(v: number | null | undefined) {
  if (!v) return MUTED
  return v >= 15 ? GREEN : v >= 8 ? YELLOW : RED
}

function ctrPostViewColor(v: number | null | undefined) {
  if (!v) return MUTED
  return v >= 4 ? GREEN : v >= 2 ? YELLOW : RED
}

function pct(part: number | null | undefined, total: number | null | undefined): number | null {
  if (!part || !total || total === 0) return null
  return (part / total) * 100
}

function fmt(v: number | null | undefined, decimals = 1, suffix = '%') {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}${suffix}`
}

// Barra horizontal proporcional
function Bar({
  value, max, color, height = 10,
}: { value: number | null; max: number; color: string; height?: number }) {
  const w = (value && max > 0) ? Math.max((value / max) * 100, 2) : 0
  return (
    <div style={{
      height, backgroundColor: 'rgba(255,255,255,0.05)',
      borderRadius: height / 2, overflow: 'hidden', flexGrow: 1,
    }}>
      <div style={{
        width: `${w}%`, height: '100%',
        backgroundColor: color, borderRadius: height / 2,
        transition: 'width 0.4s ease',
        opacity: 0.8,
      }} />
    </div>
  )
}

// Etiqueta de diagnóstico
function DiagLabel({ value, label, color, target }: {
  value: string; label: string; color: string; target?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
      {target && <span style={{ fontSize: 9, color: 'rgba(100,116,139,0.7)' }}>meta: {target}</span>}
    </div>
  )
}

export default function VideoRetentionFunnel({
  metrics: m,
  compareMetrics: c,
  label,
  compareLabel,
  compact = false,
}: Props) {
  const imp = m.impressions ?? 0
  const v3s = m.video_3s_views ?? 0
  const p25 = m.video_p25_watched ?? 0
  const p50 = m.video_p50_watched ?? 0
  const p75 = m.video_p75_watched ?? 0
  const thru = m.video_thruplay ?? 0
  const clicks = m.unique_link_clicks ?? 0

  // Porcentajes relativos a impresiones (para las barras)
  const stages = [
    { label: 'Impresiones', value: imp, pctVal: 100, color: '#6366F1' },
    { label: '3s — Hook', value: v3s, pctVal: pct(v3s, imp) ?? 0, color: hookColor(m.hook_rate) },
    { label: '25%', value: p25, pctVal: pct(p25, imp) ?? 0, color: YELLOW },
    { label: '50% — Hold', value: p50, pctVal: pct(p50, imp) ?? 0, color: holdColor(m.hold_rate) },
    { label: '75%', value: p75, pctVal: pct(p75, imp) ?? 0, color: YELLOW },
    { label: 'ThruPlay', value: thru, pctVal: pct(thru, imp) ?? 0, color: thruplayColor(m.thruplay_rate) },
    { label: 'Clics', value: clicks, pctVal: pct(clicks, imp) ?? 0, color: ctrPostViewColor(m.ctr_post_view) },
  ]

  // Diagnóstico automático
  function getDiagnosis(): { icon: string; text: string; color: string } {
    if (!m.hook_rate) return { icon: '⏳', text: 'Sin datos de video suficientes', color: MUTED }

    const hr = m.hook_rate
    const hold = m.hold_rate
    const tp = m.thruplay_rate
    const ctrPV = m.ctr_post_view

    if (hr < 15) return { icon: '🔴', text: 'Hook débil — el primer segundo no engancha. Cambiar apertura.', color: RED }
    if (hr >= 30 && hold && hold < 30) return { icon: '🟡', text: 'Hook ok pero el cuerpo no retiene — reescribir el desarrollo del video.', color: YELLOW }
    if (hr >= 30 && hold && hold >= 50 && ctrPV && ctrPV < 2) return { icon: '🟡', text: 'Retención ok pero CTR post-view bajo — CTA o propuesta de valor no convence.', color: YELLOW }
    if (hr >= 30 && hold && hold >= 50 && ctrPV && ctrPV >= 4) return { icon: '🟢', text: 'Ad ganador — hook, retención y CTA todos fuertes.', color: GREEN }
    if (hr >= 15 && hr < 30) return { icon: '🟡', text: 'Hook intermedio — probar apertura distinta para superar 30%.', color: YELLOW }
    return { icon: '🟢', text: 'Métricas de video en rango positivo.', color: GREEN }
  }

  const diag = getDiagnosis()

  if (compact) {
    // Vista compacta: solo los 3 KPIs clave + barra de funnel mini
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: hookColor(m.hook_rate) }}>
            Hook {fmt(m.hook_rate)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: holdColor(m.hold_rate) }}>
            Hold {fmt(m.hold_rate)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: thruplayColor(m.thruplay_rate) }}>
            TP {fmt(m.thruplay_rate)}
          </span>
        </div>
        {/* Mini barra de retención */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
          {stages.slice(1).map((s, i) => (
            <div key={i} style={{
              flex: 1, height: `${Math.max(s.pctVal, 4)}%`,
              maxHeight: '100%',
              backgroundColor: s.color,
              opacity: 0.7,
              borderRadius: 2,
            }} title={`${s.label}: ${s.value > 0 ? new Intl.NumberFormat('es-AR').format(s.value) : '—'}`} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9' }}>
          🎬 Funnel de Video {label ? `— ${label}` : ''}
        </span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 6, padding: '3px 8px',
        }}>
          <span>{diag.icon}</span>
          <span style={{ fontSize: 11, color: diag.color }}>{diag.text}</span>
        </div>
      </div>

      {/* Funnel bars */}
      <div style={{ padding: '16px 16px 8px' }}>
        {stages.map((s, i) => {
          const cStage = c ? (() => {
            const cImp = c.impressions ?? 0
            const vals = [cImp, c.video_3s_views ?? 0, c.video_p25_watched ?? 0, c.video_p50_watched ?? 0, c.video_p75_watched ?? 0, c.video_thruplay ?? 0, c.unique_link_clicks ?? 0]
            const cVal = vals[i]
            return pct(cVal, cImp) ?? 0
          })() : null

          return (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: MUTED,
                  width: 72, flexShrink: 0, textAlign: 'right' as const,
                }}>
                  {s.label}
                </span>
                <Bar value={s.pctVal} max={100} color={s.color} height={i === 0 ? 14 : 10} />
                <span style={{
                  fontSize: 11, fontWeight: 700, color: s.pctVal > 0 ? s.color : MUTED,
                  width: 44, flexShrink: 0, textAlign: 'right' as const,
                }}>
                  {i === 0 ? '100%' : s.pctVal > 0 ? `${s.pctVal.toFixed(1)}%` : '—'}
                </span>
                <span style={{ fontSize: 10, color: MUTED, width: 64, flexShrink: 0 }}>
                  {s.value > 0 ? new Intl.NumberFormat('es-AR').format(s.value) : ''}
                </span>
                {/* Comparación si existe */}
                {cStage != null && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: (i === 0 || cStage === 0) ? MUTED
                      : cStage > s.pctVal ? GREEN : RED,
                    width: 44, flexShrink: 0, textAlign: 'right' as const,
                  }}>
                    {i === 0 ? `${compareLabel || 'B'}` : cStage > 0 ? `${cStage.toFixed(1)}%` : '—'}
                  </span>
                )}
              </div>
              {/* Drop-off entre etapas */}
              {i > 0 && i < stages.length - 1 && stages[i - 1].pctVal > 0 && s.pctVal > 0 && (
                <div style={{ paddingLeft: 80, marginTop: -4, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: 'rgba(100,116,139,0.6)' }}>
                    ↓ retiene {((s.pctVal / stages[i - 1].pctVal) * 100).toFixed(0)}% de la etapa anterior
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* KPI row */}
      <div style={{
        padding: '10px 16px',
        borderTop: `1px solid ${BORDER}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.15)',
      }}>
        <DiagLabel
          value={fmt(m.hook_rate)}
          label="Hook Rate"
          color={hookColor(m.hook_rate)}
          target=">30%"
        />
        <DiagLabel
          value={fmt(m.hold_rate)}
          label="Hold Rate"
          color={holdColor(m.hold_rate)}
          target=">50%"
        />
        <DiagLabel
          value={fmt(m.thruplay_rate)}
          label="ThruPlay Rate"
          color={thruplayColor(m.thruplay_rate)}
          target=">15%"
        />
        <DiagLabel
          value={fmt(m.ctr_post_view)}
          label="CTR post-view"
          color={ctrPostViewColor(m.ctr_post_view)}
          target=">4%"
        />
        <DiagLabel
          value={m.video_avg_time_watched ? `${m.video_avg_time_watched.toFixed(1)}s` : '—'}
          label="Avg watch time"
          color={m.video_avg_time_watched && m.video_avg_time_watched >= 8 ? GREEN : MUTED}
        />
      </div>
    </div>
  )
}
