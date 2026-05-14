import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const { data: campaigns, error: cErr } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .order('updated_at', { ascending: false })

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const { data: todayMetrics } = await supabaseAdmin
    .from('metrics')
    .select('*')
    .eq('object_type', 'campaign')
    .eq('date', today)

  const { data: yesterdayMetrics } = await supabaseAdmin
    .from('metrics')
    .select('*')
    .eq('object_type', 'campaign')
    .eq('date', yesterday)

  const todayMap = new Map((todayMetrics || []).map(m => [m.object_id, m]))
  const yesterdayMap = new Map((yesterdayMetrics || []).map(m => [m.object_id, m]))

  const result = (campaigns || []).map(c => {
    const tm = todayMap.get(c.id)
    const ym = yesterdayMap.get(c.id)
    const todayRoas = tm?.roas ?? 0
    const yesterdayRoas = ym?.roas ?? 0
    let trend: 'up' | 'down' | 'neutral' = 'neutral'
    if (todayRoas > yesterdayRoas) trend = 'up'
    else if (todayRoas < yesterdayRoas) trend = 'down'

    return {
      ...c,
      todayMetrics: {
        spend: tm?.spend ?? 0,
        roas: tm?.roas ?? null,
        purchases: tm?.purchases ?? 0,
        cpc: tm?.cpc ?? null,
        impressions: tm?.impressions ?? 0,
      },
      trend,
    }
  })

  return NextResponse.json({ campaigns: result })
}
