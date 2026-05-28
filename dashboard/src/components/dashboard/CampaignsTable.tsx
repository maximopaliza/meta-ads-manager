import Link from 'next/link'
import { CampaignWithMetrics } from '@/types/meta'
import { formatCurrency, formatROAS, statusEmoji } from '@/lib/utils'

interface CampaignsTableProps {
  campaigns: CampaignWithMetrics[]
  currency?: string
  compact?: boolean
}

export default function CampaignsTable({ campaigns, currency = 'ARS', compact = false }: CampaignsTableProps) {
  const rows = compact ? campaigns.slice(0, 5) : campaigns

  const thStyle = {
    textAlign: 'left' as const,
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#7A90AA',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1A3050',
  }

  const tdStyle = {
    padding: '12px',
    fontSize: '13px',
    color: '#F1F5F9',
    borderBottom: '1px solid #1A3050',
  }

  return (
    <div
      style={{
        backgroundColor: '#0E1B30',
        border: '1px solid #1A3050',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {compact && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1A3050', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#F1F5F9' }}>📣 Top campañas</h3>
          <Link href="/campaigns" style={{ fontSize: '12px', color: '#6366F1', textDecoration: 'none' }}>Ver todas →</Link>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Campaña</th>
              <th style={{ ...thStyle, textAlign: 'right' as const }}>Gasto hoy</th>
              <th style={{ ...thStyle, textAlign: 'right' as const }}>ROAS</th>
              <th style={{ ...thStyle, textAlign: 'right' as const }}>Compras</th>
              <th style={{ ...thStyle, textAlign: 'center' as const }}>Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#7A90AA', padding: '32px' }}>
                  Sin datos. Ejecutá un sync primero.
                </td>
              </tr>
            ) : (
              rows.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }}>
                  <td style={tdStyle}>
                    <Link href={`/campaigns/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{statusEmoji(c.status)}</span>
                        <span style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(c.todayMetrics.spend, currency)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: c.todayMetrics.roas && c.todayMetrics.roas >= 2 ? '#22C55E' : c.todayMetrics.roas ? '#EF4444' : '#7A90AA' }}>
                    {c.todayMetrics.roas ? formatROAS(c.todayMetrics.roas) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.todayMetrics.purchases}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {c.trend === 'up' ? '▲' : c.trend === 'down' ? '▼' : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
