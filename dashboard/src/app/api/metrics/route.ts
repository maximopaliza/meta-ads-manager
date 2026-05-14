import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '7d'

  const days = range === '30d' ? 30 : range === '14d' ? 14 : 7
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  const { data: metrics, error } = await supabaseAdmin
    .from('metrics')
    .select('*')
    .eq('object_type', 'campaign')
    .gte('date', from)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byDate = new Map<string, { spend: number; purchases: number; purchase_value: number; impressions: number; clicks: number }>()

  for (const m of metrics || []) {
    const existing = byDate.get(m.date) || { spend: 0, purchases: 0, purchase_value: 0, impressions: 0, clicks: 0 }
    byDate.set(m.date, {
      spend: existing.spend + (m.spend || 0),
      purchases: existing.purchases + (m.purchases || 0),
      purchase_value: existing.purchase_value + (m.purchase_value || 0),
      impressions: existing.impressions + (m.impressions || 0),
      clicks: existing.clicks + (m.clicks || 0),
    })
  }

  const daily = Array.from(byDate.entries()).map(([date, d]) => ({
    date,
    spend: d.spend,
    roas: d.spend > 0 ? d.purchase_value / d.spend : null,
    purchases: d.purchases,
    impressions: d.impressions,
    clicks: d.clicks,
  }))

  const totalSpend = daily.reduce((s, d) => s + d.spend, 0)
  const totalPurchases = daily.reduce((s, d) => s + d.purchases, 0)
  const totalPurchaseValue = daily.reduce((s, d) => s + (d.roas ? d.spend * d.roas : 0), 0)
  const avgRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : null

  return NextResponse.json({ totalSpend, totalPurchases, avgRoas, daily })
}
