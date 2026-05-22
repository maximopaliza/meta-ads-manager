import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { severityIcon } from '@/lib/utils'

export default async function AlertsPage() {
  const { data: alerts } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const severityBg: Record<string, string> = {
    info: '#6366F10D',
    warning: '#F59E0B0D',
    critical: '#EF44440D',
  }
  const severityBorder: Record<string, string> = {
    info: '#6366F133',
    warning: '#F59E0B33',
    critical: '#EF444433',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1 }}>
        <Header title="Alertas" subtitle={`${(alerts || []).length} alertas registradas`} />
        <main style={{ padding: '32px', maxWidth: '1400px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(alerts || []).length === 0 ? (
              <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#64748B' }}>
                Sin alertas todavía. El sistema empezará a generar alertas luego del primer sync.
              </div>
            ) : (
              (alerts || []).map((alert: Record<string, any>) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: `1px solid ${severityBorder[alert.severity] || '#2D3244'}`,
                    backgroundColor: severityBg[alert.severity] || '#1A1D2710',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span>{severityIcon(alert.severity)}</span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#F1F5F9' }}>{alert.title}</span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '20px',
                      backgroundColor: alert.type === 'anomaly' ? '#EF44441A' : alert.type === 'milestone' ? '#22C55E1A' : '#6366F11A',
                      color: alert.type === 'anomaly' ? '#EF4444' : alert.type === 'milestone' ? '#22C55E' : '#6366F1',
                    }}>
                      {alert.type}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.6 }}>{alert.message}</p>
                  <p style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
                    {new Date(alert.created_at).toLocaleString('es-AR')}
                    {alert.sent_to_telegram && <span style={{ marginLeft: '8px' }}>✈️ Enviado</span>}
                  </p>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
