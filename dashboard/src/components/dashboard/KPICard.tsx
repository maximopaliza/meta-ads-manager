interface KPICardProps {
  label: string
  value: string
  delta?: number | null
  icon: string
  color?: string
}

export default function KPICard({ label, value, delta, icon, color = '#6366F1' }: KPICardProps) {
  const deltaColor = delta === null || delta === undefined ? '#7A90AA'
    : delta > 0 ? '#22C55E'
    : delta < 0 ? '#EF4444'
    : '#7A90AA'

  return (
    <div
      style={{
        backgroundColor: '#0E1B30',
        border: '1px solid #1A3050',
        borderRadius: '12px',
        padding: '24px',
        flex: 1,
        minWidth: '180px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#7A90AA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: '20px' }}>{icon}</span>
      </div>

      <div style={{ fontSize: '32px', fontWeight: 700, color: '#F1F5F9', marginBottom: '8px' }}>
        {value}
      </div>

      {delta !== null && delta !== undefined && (
        <div style={{ fontSize: '13px', color: deltaColor }}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}{' '}
          {Math.abs(delta).toFixed(1)}% vs ayer
        </div>
      )}
    </div>
  )
}
