import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TOKEN = process.env.META_ACCESS_TOKEN
const META_BASE  = 'https://graph.facebook.com/v21.0'

// POST { objectId, objectType: 'ad_set' | 'campaign', newBudgetCents: number }
export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const { objectId, objectType, newBudgetCents } = await req.json()
  if (!objectId || !['ad_set', 'campaign'].includes(objectType) || typeof newBudgetCents !== 'number' || newBudgetCents < 100) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const metaRes = await fetch(`${META_BASE}/${objectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: META_TOKEN, daily_budget: String(newBudgetCents) }),
  })
  const metaData = await metaRes.json()
  if (!metaData.success) {
    return NextResponse.json({ error: metaData.error?.message || 'Meta API error' }, { status: 502 })
  }

  // Sync Supabase
  const table = objectType === 'campaign' ? 'campaigns' : 'ad_sets'
  await supabaseAdmin.from(table).update({ daily_budget: newBudgetCents, updated_at: new Date().toISOString() }).eq('id', objectId)

  return NextResponse.json({ ok: true, newBudgetCents })
}
