import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import CampaignChart from '@/components/dashboard/CampaignChart'
import AlertsFeed from '@/components/dashboard/AlertsFeed'
import { formatCurrency, formatROAS, statusEmoji } from '@/lib/utils'
import { notFound } from 'next/navigation'

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !campaign) notFound()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [metrics, adSets, alerts, todayMetrics, accounts] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_id', id).eq('object_type', 'campaign').gte('date', thirtyDaysAgo).order('date'),
    supabaseAdmin.from('ad_sets').select('*').eq('campaign_id', id),
    supabaseAdmin.from('alerts').select('*').eq('object_id', id).order('created_at', { ascending: false }).limit(10),
    supabaseAdmin.from('metrics').select('*').eq('object_id', id).eq('object_type', 'campaign').eq('date', today).single(),
    supabaseAdmin.from('ad_accounts').select('currency').eq('id', campaign.account_id).single(),
  ])

  const currency = accounts.data?.currency || 'ARS'
  const tm = todayMetrics.data

  const dailyData = (metrics.data || []).map((m: Record<string, any>) => ({
    date: m.date,
    spend: m.spend,
    roas: m.roas,
    purchases: m.purchases,
    impressions: m.impressions,
    clicks: m.clicks,
  }))

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header
          title={campaign.name}
          subtitle={`${statusEmoji(campaign.status)} ${campaign.status} · ${campaign.objective || 'Sin objetivo'}`}
        />
        <main style={{ padding: '32px', maxWidth: '1400px' }}>
          {/* KPIs del día */}
          {tm && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {[
                { label: 'Gasto hoy', value: formatCurrency(tm.spend, currency) },
                { label: 'ROAS hoy', value: tm.roas ? formatROAS(tm.roas) : '—' },
                { label: 'Compras hoy', value: String(tm.purchases) },
                { label: 'Impresiones', value: new Intl.NumberFormat('es-AR').format(tm.impressions) },
                { label: 'CPC', value: tm.cpc ? formatCurrency(tm.cpc, currency) : '—' },
              ].map(kpi => (
                <div
                  key={kpi.label}
                  style={{
                    backgroundColor: '#1A1D27',
                    border: '1px solid #2D3244',
                    borderRadius: '12px',
                    padding: '20px',
                    flex: 1,
                    minWidth: '140px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '8px', textTransform: 'uppercase' }}>{kpi.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#F1F5F9' }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Charts 30d */}
          <div style={{ marginBottom: '24px' }}>
            <CampaignChart data={dailyData} currency={currency} />
          </div>

          {/* Ad Sets */}
          {adSets.data && adSets.data.length > 0 && (
            <div style={{ marginBottom: '24px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #2D3244' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#F1F5F9' }}>🎯 Ad Sets</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Ad Set', 'Estado', 'Presupuesto diario'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', borderBottom: '1px solid #2D3244' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adSets.data.map((as: Record<string, any>) => (
                    <tr key={as.id}>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{as.name}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{statusEmoji(as.status)} {as.status}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#F1F5F9', borderBottom: '1px solid #2D3244' }}>{as.daily_budget ? formatCurrency(as.daily_budget / 100, currency) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Alerts */}
          <AlertsFeed alerts={(alerts.data || []) as any} />
        </main>
      </div>
    </div>
  )
}
