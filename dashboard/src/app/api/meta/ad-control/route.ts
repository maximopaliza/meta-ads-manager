import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TOKEN = process.env.META_ACCESS_TOKEN
const META_BASE  = 'https://graph.facebook.com/v21.0'

// POST { adId, action: 'pause' | 'activate' }
export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const { adId, action } = await req.json()
  if (!adId || !['pause', 'activate'].includes(action)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const newStatus = action === 'activate' ? 'ACTIVE' : 'PAUSED'

  const metaRes = await fetch(`${META_BASE}/${adId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: META_TOKEN, status: newStatus }),
  })
  const metaData = await metaRes.json()
  if (!metaData.success) {
    return NextResponse.json({ error: metaData.error?.message || 'Meta API error' }, { status: 502 })
  }

  // Keep Supabase in sync
  await supabaseAdmin.from('ads').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', adId)

  return NextResponse.json({ ok: true, status: newStatus })
}
