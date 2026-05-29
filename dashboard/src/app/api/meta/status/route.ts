import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BASE  = 'https://graph.facebook.com/v21.0'

// POST { objectId, objectType: 'campaign'|'ad_set'|'ad', action: 'pause'|'activate' }
export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const { objectId, objectType, action } = await req.json()
  if (!objectId || !objectType || !['pause', 'activate'].includes(action)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const newStatus = action === 'activate' ? 'ACTIVE' : 'PAUSED'

  // Call Meta API
  const metaRes = await fetch(`${META_BASE}/${objectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: META_TOKEN, status: newStatus }),
  })
  const metaData = await metaRes.json()
  if (!metaData.success) {
    return NextResponse.json({ error: metaData.error?.message || 'Meta API error' }, { status: 502 })
  }

  // Sync Supabase
  const tableMap: Record<string, string> = { campaign: 'campaigns', ad_set: 'ad_sets', ad: 'ads' }
  const table = tableMap[objectType]
  if (table) {
    await supabaseAdmin.from(table)
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', objectId)
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
