import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { formatCurrency, statusEmoji } from '@/lib/utils'
import Link from 'next/link'

export default async function AdSetsPage() {
  const { data: adSets } = await supabaseAdmin
    .from('ad_sets')
    .select('*, campaigns(name, account_id)')
    .order('updated_at', { ascending: false })

  const today = new Date().toISOString().split('T')[0]
  const { data: metrics } = await supabaseAdmin
    .from('metrics')
    .select('*')
    .eq('object_type', 'ad_set')
    .eq('date', today)

  const metricsMap = new Map((metrics || []).map((m: { object_id: string }) => [m.object_id, m]))

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Ad Sets" subtitle={`${(adSets || []).length} ad sets en total`} />
        <main style={{ padding: '32px', maxWidth: '1400px' }}>
          <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Ad Set', 'Campaña', 'Estado', 'Gasto hoy', 'ROAS hoy', 'Compras'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #2D3244' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(adSets || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
                        Sin datos. Ejecutá un sync primero.
                      </td>
                    </tr>
                  ) : (
                    (adSets || []).map((as: Record<string, any>) => {
                      const m = metricsMap.get(as.id) as Record<string, number> | undefined
                      return (
                        <tr key={as.id}>
                          <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{as.name}</td>
                          <td style={{ padding: '12px', fontSize: '13px', borderBottom: '1px solid #2D3244' }}>
                            <Link href={`/campaigns/${as.campaign_id}`} style={{ color: '#6366F1', textDecoration: 'none' }}>
                              {as.campaigns?.name || as.campaign_id}
                            </Link>
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{statusEmoji(as.status)} {as.status}</td>
                          <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{formatCurrency(m?.spend ?? 0)}</td>
                          <td style={{ padding: '12px', fontSize: '13px', color: m?.roas && m.roas >= 2 ? '#22C55E' : m?.roas ? '#EF4444' : '#64748B', borderBottom: '1px solid #2D3244' }}>
                            {m?.roas ? `${m.roas.toFixed(2)}x` : '—'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{m?.purchases ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
