import { Alert } from '@/types/meta'
import { severityColor, severityIcon } from '@/lib/utils'

interface AlertsFeedProps {
  alerts: Alert[]
}

export default function AlertsFeed({ alerts }: AlertsFeedProps) {
  if (!alerts.length) {
    return (
      <div
        style={{
          backgroundColor: '#071428',
          border: '1px solid #1A4080',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#F1F5F9', marginBottom: '16px' }}>
          🔔 Alertas recientes
        </h3>
        <p style={{ color: '#7A90AA', fontSize: '14px' }}>Sin alertas recientes</p>
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: '#071428',
        border: '1px solid #1A4080',
        borderRadius: '12px',
        padding: '24px',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#F1F5F9', marginBottom: '16px' }}>
        🔔 Alertas recientes
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {alerts.map(alert => (
          <div
            key={alert.id}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              border: `1px solid`,
              borderColor: alert.severity === 'critical' ? '#EF444433' : alert.severity === 'warning' ? '#F59E0B33' : '#6366F133',
              backgroundColor: alert.severity === 'critical' ? '#EF44440D' : alert.severity === 'warning' ? '#F59E0B0D' : '#6366F10D',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span>{severityIcon(alert.severity)}</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#F1F5F9' }}>{alert.title}</span>
            </div>
            <p style={{ fontSize: '12px', color: '#7A90AA', lineHeight: 1.5 }}>
              {alert.message.length > 120 ? alert.message.slice(0, 120) + '...' : alert.message}
            </p>
            <p style={{ fontSize: '11px', color: '#7A90AA', marginTop: '6px' }}>
              {new Date(alert.created_at).toLocaleString('es-AR')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
