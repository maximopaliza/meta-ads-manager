import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BASE  = 'https://graph.facebook.com/v21.0'

async function metaPost(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ access_token: META_TOKEN, ...params })
  const res = await fetch(`${META_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return res.json()
}

// POST { draftId }
export async function POST(req: NextRequest) {
  const { draftId } = await req.json()
  if (!draftId) return NextResponse.json({ error: 'draftId requerido' }, { status: 400 })

  const { data: draft } = await supabaseAdmin
    .from('campaign_drafts')
    .select('campaign_id')
    .eq('id', draftId)
    .single()

  // Try to delete from Meta (non-fatal)
  if (draft?.campaign_id && META_TOKEN) {
    await metaPost(draft.campaign_id, { status: 'DELETED' }).catch(() => {})
  }

  await supabaseAdmin
    .from('campaign_drafts')
    .update({ status: 'DELETED', updated_at: new Date().toISOString() })
    .eq('id', draftId)

  return NextResponse.json({ ok: true })
}
