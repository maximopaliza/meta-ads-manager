import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import CampaignsTable from '@/components/dashboard/CampaignsTable'

async function getCampaignsData() {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const [campaigns, todayMetrics, yesterdayMetrics] = await Promise.all([
    supabaseAdmin.from('campaigns').select('*').order('updated_at', { ascending: false }),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', yesterday),
  ])

  const todayMap = new Map((todayMetrics.data || []).map((m: { object_id: string }) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayMetrics.data || []).map((m: { object_id: string }) => [m.object_id, m]))

  return (campaigns.data || []).map((c: { id: string; status: string }) => {
    const tm = todayMap.get(c.id) as Record<string, number> | undefined
    const ym = yesterdayMap.get(c.id) as Record<string, number> | undefined
    return {
      ...c,
      todayMetrics: { spend: tm?.spend ?? 0, roas: tm?.roas ?? null, purchases: tm?.purchases ?? 0, cpc: tm?.cpc ?? null, impressions: tm?.impressions ?? 0 },
      trend: (tm?.roas ?? 0) > (ym?.roas ?? 0) ? 'up' : (tm?.roas ?? 0) < (ym?.roas ?? 0) ? 'down' : 'neutral',
    }
  })
}

export default async function CampaignsPage() {
  const campaigns = await getCampaignsData()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Campañas" subtitle={`${campaigns.length} campañas en total`} />
        <main style={{ padding: '32px', maxWidth: '1400px' }}>
          <CampaignsTable campaigns={campaigns as any} />
        </main>
      </div>
    </div>
  )
}
