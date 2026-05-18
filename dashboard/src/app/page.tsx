import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import KPICard from '@/components/dashboard/KPICard'
import SpendChart from '@/components/dashboard/SpendChart'
import CampaignsTable from '@/components/dashboard/CampaignsTable'
import AlertsFeed from '@/components/dashboard/AlertsFeed'
import { formatCurrency, formatROAS } from '@/lib/utils'
import AutoRefresh from './AutoRefresh'

async function getOverviewData() {
  // Calling headers() forces dynamic rendering on every request
  await headers()

  // Use the latest date in Supabase as "today" — avoids server timezone issues
  const latestDateRes = await supabaseAdmin
    .from('metrics')
    .select('date')
    .eq('object_type', 'campaign')
    .order('date', { ascending: false })
    .limit(1)

  const today = latestDateRes.data?.[0]?.date ?? new Date().toISOString().split('T')[0]

  // Compute yesterday and 7-day window relative to latest data date
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = new Date(todayMs - 7 * 86400000).toISOString().split('T')[0]

  const [todayMetrics, yesterdayMetrics, weekMetrics, campaigns, alerts] = await Promise.all([
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'campaign').gte('date', sevenDaysAgo).order('date'),
    supabaseAdmin.from('campaigns').select('*').order('updated_at', { ascending: false }),
    supabaseAdmin.from('alerts').select('*').order('created_at', { ascending: false }).limit(5),
  ])

  const todaySpend = (todayMetrics.data || []).reduce((s, m) => s + (m.spend || 0), 0)
  const todayPurchases = (todayMetrics.data || []).reduce((s, m) => s + (m.purchases || 0), 0)
  const todayPurchaseValue = (todayMetrics.data || []).reduce((s, m) => s + (m.purchase_value || 0), 0)
  const todayRoas = todaySpend > 0 ? todayPurchaseValue / todaySpend : null

  const yesterdaySpend = (yesterdayMetrics.data || []).reduce((s, m) => s + (m.spend || 0), 0)
  const yesterdayPurchases = (yesterdayMetrics.data || []).reduce((s, m) => s + (m.purchases || 0), 0)
  const yesterdayPurchaseValue = (yesterdayMetrics.data || []).reduce((s, m) => s + (m.purchase_value || 0), 0)
  const yesterdayRoas = yesterdaySpend > 0 ? yesterdayPurchaseValue / yesterdaySpend : null

  const spendDelta = yesterdaySpend > 0 ? ((todaySpend - yesterdaySpend) / yesterdaySpend) * 100 : null
  const roasDelta = yesterdayRoas && todayRoas ? ((todayRoas - yesterdayRoas) / yesterdayRoas) * 100 : null
  const purchasesDelta = yesterdayPurchases > 0 ? ((todayPurchases - yesterdayPurchases) / yesterdayPurchases) * 100 : null

  const activeCampaigns = (campaigns.data || []).filter((c: { status: string }) => c.status === 'ACTIVE').length

  const byDate = new Map<string, { spend: number; purchase_value: number; purchases: number; impressions: number; clicks: number }>()
  for (const m of weekMetrics.data || []) {
    const e = byDate.get(m.date) || { spend: 0, purchase_value: 0, purchases: 0, impressions: 0, clicks: 0 }
    byDate.set(m.date, {
      spend: e.spend + (m.spend || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      purchases: e.purchases + (m.purchases || 0),
      impressions: e.impressions + (m.impressions || 0),
      clicks: e.clicks + (m.clicks || 0),
    })
  }
  const dailyData = Array.from(byDate.entries()).map(([date, d]) => ({
    date,
    spend: d.spend,
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    purchases: d.purchases,
    impressions: d.impressions,
    clicks: d.clicks,
  }))

  const todayMap = new Map((todayMetrics.data || []).map((m: { object_id: string }) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayMetrics.data || []).map((m: { object_id: string }) => [m.object_id, m]))

  const campaignsWithMetrics = (campaigns.data || []).map((c: { id: string; status: string }) => {
    const tm = todayMap.get(c.id) as Record<string, number> | undefined
    const ym = yesterdayMap.get(c.id) as Record<string, number> | undefined
    const todayR = tm?.roas ?? 0
    const yesterdayR = ym?.roas ?? 0
    return {
      ...c,
      todayMetrics: { spend: tm?.spend ?? 0, roas: tm?.roas ?? null, purchases: tm?.purchases ?? 0, cpc: tm?.cpc ?? null, impressions: tm?.impressions ?? 0 },
      trend: todayR > yesterdayR ? 'up' : todayR < yesterdayR ? 'down' : 'neutral',
    }
  }).sort((a: any, b: any) => b.todayMetrics.spend - a.todayMetrics.spend)

  return { today, todaySpend, todayRoas, todayPurchases, activeCampaigns, spendDelta, roasDelta, purchasesDelta, dailyData, campaignsWithMetrics, alerts: alerts.data || [] }
}

export default async function OverviewPage() {
  const data = await getOverviewData()

  const dateLabel = new Date(data.today + 'T12:00:00Z').toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Argentina/Buenos_Aires'
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <AutoRefresh />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header
          title="Overview"
          subtitle={`Hoy — ${dateLabel}`}
        />
        <main style={{ padding: '32px', maxWidth: '1400px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <KPICard label="Gasto hoy" value={formatCurrency(data.todaySpend)} delta={data.spendDelta} icon="💸" />
            <KPICard label="ROAS promedio" value={data.todayRoas ? formatROAS(data.todayRoas) : '—'} delta={data.roasDelta} icon="📈" />
            <KPICard label="Compras hoy" value={String(data.todayPurchases)} delta={data.purchasesDelta} icon="🛍️" />
            <KPICard label="Campañas activas" value={String(data.activeCampaigns)} delta={null} icon="📣" />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <SpendChart data={data.dailyData} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px' }}>
            <CampaignsTable campaigns={data.campaignsWithMetrics as any} compact />
            <AlertsFeed alerts={data.alerts as any} />
          </div>
        </main>
      </div>
    </div>
  )
}
