import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import RangeSelector from '@/components/dashboard/RangeSelector'
import Link from 'next/link'
import { formatCurrency, formatNumber, statusEmoji } from '@/lib/utils'
import { getLatestDate, cpaColor, roasColor, ctrColor, CPA_BREAKEVEN, CPA_TARGET } from '@/lib/metrics'

export default async function AdSetsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await headers()
  const sp = await searchParams
  const days = Math.min(90, Math.max(1, Number(sp?.days || 7)))

  const today = await getLatestDate()
  const todayMs = new Date(today + 'T12:00:00Z').getTime()
  const yesterday = new Date(todayMs - 86400000).toISOString().split('T')[0]
  const rangeStart = new Date(todayMs - days * 86400000).toISOString().split('T')[0]

  const [adSetsRes, todayM, yesterdayM, rangeM, accountRes] = await Promise.all([
    supabaseAdmin.from('ad_sets').select('*, campaigns(name)'),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', today),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').eq('date', yesterday),
    supabaseAdmin.from('metrics').select('*').eq('object_type', 'ad_set').gte('date', rangeStart),
    supabaseAdmin.from('ad_accounts').select('currency').limit(1),
  ])

  const currency = accountRes.data?.[0]?.currency || 'USD'
  const todayMap = new Map((todayM.data || []).map((m: any) => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayM.data || []).map((m: any) => [m.object_id, m]))

  // Aggregate range metrics per ad set
  const rangeAgg = new Map<string, any>()
  for (const m of rangeM.data || []) {
    const e = rangeAgg.get(m.object_id) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, link_clicks: 0, clicks: 0, add_to_cart: 0 }
    rangeAgg.set(m.object_id, {
      spend: e.spend + (m.spend || 0),
      purchases: e.purchases + (m.purchases || 0),
      purchase_value: e.purchase_value + (m.purchase_value || 0),
      impressions: e.impressions + (m.impressions || 0),
      link_clicks: e.link_clicks + (m.link_clicks || 0),
      clicks: e.clicks + (m.clicks || 0),
      add_to_cart: e.add_to_cart + (m.add_to_cart || 0),
    })
  }

  const rows = (adSetsRes.data || []).map((as: any) => {
    const tm = todayMap.get(as.id) as any
    const ym = yesterdayMap.get(as.id) as any
    const rm = rangeAgg.get(as.id) as any

    const lc = tm?.link_clicks || tm?.clicks || 0
    const todayDerived = {
      spend: tm?.spend ?? 0,
      purchases: tm?.purchases ?? 0,
      roas: tm?.roas ?? null,
      cpa: tm?.purchases > 0 ? tm.spend / tm.purchases : null,
      ctr: tm?.impressions > 0 && lc > 0 ? lc / tm.impressions * 100 : null,
      cpm: tm?.cpm ?? null,
      cpc: tm?.cpc || (lc > 0 ? (tm?.spend || 0) / lc : null),
      add_to_cart: tm?.add_to_cart ?? 0,
      cost_per_atc: tm?.cost_per_atc ?? (tm?.add_to_cart > 0 ? (tm?.spend || 0) / tm.add_to_cart : null),
      impressions: tm?.impressions ?? 0,
      link_clicks: lc,
      frequency: tm?.frequency ?? null,
      hook_rate: tm?.hook_rate ?? null,
      video_avg_time_watched: tm?.video_avg_time_watched ?? null,
      landing_page_views: tm?.landing_page_views ?? 0,
    }

    const rlc = rm?.link_clicks || rm?.clicks || 0
    const rangeDerived = rm ? {
      spend: rm.spend,
      purchases: rm.purchases,
      roas: rm.spend > 0 ? rm.purchase_value / rm.spend : null,
      cpa: rm.purchases > 0 ? rm.spend / rm.purchases : null,
      ctr: rm.impressions > 0 && rlc > 0 ? rlc / rm.impressions * 100 : null,
      add_to_cart: rm.add_to_cart,
    } : null

    return {
      ...as,
      today: todayDerived,
      range: rangeDerived,
      trend: (tm?.roas ?? 0) > (ym?.roas ?? 0) ? '▲' : (tm?.roas ?? 0) < (ym?.roas ?? 0) ? '▼' : '—',
    }
  }).sort((a: any, b: any) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    return b.today.spend - a.today.spend
  })

  const thStyle: any = { padding: '8px 12px', textAlign: 'right', color: '#64748B', fontSize: '11px', fontWeight: 500, borderBottom: '1px solid #2D3244', whiteSpace: 'nowrap' }
  const tdStyle: any = { padding: '9px 12px', textAlign: 'right', fontSize: '12px', borderBottom: '1px solid #1a1d27' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0F1117' }}>
      <Sidebar />
      <div style={{ marginLeft: '240px', flex: 1 }}>
        <Header title="Ad Sets" subtitle={`${rows.length} ad sets · ordenados por rendimiento`} />
        <main style={{ padding: '28px 32px', maxWidth: '1600px' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <RangeSelector />
          </div>

          <div style={{ backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2D3244', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Hoy vs {days}d acumulado</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#22C55E20', color: '#22C55E', borderRadius: '4px' }}>CPA ≤${CPA_TARGET} 🟢</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#F59E0B20', color: '#F59E0B', borderRadius: '4px' }}>≤${CPA_BREAKEVEN} 🟡</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#EF444420', color: '#EF4444', borderRadius: '4px' }}>&gt;${CPA_BREAKEVEN} 🔴</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Ad Set</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Campaña</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Ventas hoy</th>
                    <th style={thStyle}>CPA hoy</th>
                    <th style={thStyle}>ROAS hoy</th>
                    <th style={thStyle}>Gasto hoy</th>
                    <th style={thStyle}>CTR</th>
                    <th style={thStyle}>CPM</th>
                    <th style={thStyle}>CPC</th>
                    <th style={thStyle}>Clics enlace</th>
                    <th style={thStyle}>ATC</th>
                    <th style={thStyle}>Costo/ATC</th>
                    <th style={thStyle}>Frecuencia</th>
                    <th style={thStyle}>Hook%</th>
                    <th style={{ ...thStyle, borderLeft: '1px solid #2D3244' }}>Ventas {days}d</th>
                    <th style={thStyle}>CPA {days}d</th>
                    <th style={thStyle}>ROAS {days}d</th>
                    <th style={thStyle}>Gasto {days}d</th>
                    <th style={thStyle}>Tend.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((as: any) => (
                    <tr key={as.id} style={{ opacity: as.status === 'ACTIVE' ? 1 : 0.55 }}>
                      <td style={{ ...tdStyle, textAlign: 'left', maxWidth: '180px' }}>
                        <span style={{ color: '#F1F5F9', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {as.name}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'left', maxWidth: '140px' }}>
                        <Link href={`/campaigns/${as.campaign_id}`} style={{ color: '#6366F1', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {as.campaigns?.name || as.campaign_id}
                        </Link>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{statusEmoji(as.status)}</td>
                      <td style={{ ...tdStyle, color: as.today.purchases > 0 ? '#22C55E' : '#64748B', fontWeight: as.today.purchases > 0 ? 600 : 400 }}>{as.today.purchases || '—'}</td>
                      <td style={{ ...tdStyle, color: cpaColor(as.today.cpa), fontWeight: 600 }}>{as.today.cpa ? formatCurrency(as.today.cpa, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: roasColor(as.today.roas) }}>{as.today.roas ? `${as.today.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.spend > 0 ? formatCurrency(as.today.spend, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: ctrColor(as.today.ctr) }}>{as.today.ctr ? `${as.today.ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.cpm ? formatCurrency(as.today.cpm, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.cpc ? formatCurrency(as.today.cpc, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.link_clicks > 0 ? formatNumber(as.today.link_clicks) : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.add_to_cart || '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.today.cost_per_atc ? formatCurrency(as.today.cost_per_atc, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: as.today.frequency && as.today.frequency > 3 ? '#F59E0B' : '#F1F5F9' }}>{as.today.frequency ? as.today.frequency.toFixed(1) : '—'}</td>
                      <td style={{ ...tdStyle, color: as.today.hook_rate ? (as.today.hook_rate >= 40 ? '#22C55E' : as.today.hook_rate >= 20 ? '#F59E0B' : '#EF4444') : '#64748B' }}>{as.today.hook_rate ? `${as.today.hook_rate.toFixed(1)}%` : '—'}</td>
                      <td style={{ ...tdStyle, borderLeft: '1px solid #2D3244', color: as.range?.purchases > 0 ? '#22C55E' : '#64748B' }}>{as.range?.purchases || '—'}</td>
                      <td style={{ ...tdStyle, color: cpaColor(as.range?.cpa), fontWeight: 600 }}>{as.range?.cpa ? formatCurrency(as.range.cpa, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: roasColor(as.range?.roas) }}>{as.range?.roas ? `${as.range.roas.toFixed(2)}x` : '—'}</td>
                      <td style={{ ...tdStyle, color: '#F1F5F9' }}>{as.range?.spend > 0 ? formatCurrency(as.range.spend, currency) : '—'}</td>
                      <td style={{ ...tdStyle, color: as.trend === '▲' ? '#22C55E' : as.trend === '▼' ? '#EF4444' : '#64748B' }}>{as.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
