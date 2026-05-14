import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: campaign, error: cErr } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const { data: metrics } = await supabaseAdmin
    .from('metrics')
    .select('*')
    .eq('object_id', id)
    .eq('object_type', 'campaign')
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  const { data: adSets } = await supabaseAdmin
    .from('ad_sets')
    .select('*')
    .eq('campaign_id', id)

  const { data: alerts } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .eq('object_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ campaign, metrics: metrics || [], adSets: adSets || [], alerts: alerts || [] })
}
