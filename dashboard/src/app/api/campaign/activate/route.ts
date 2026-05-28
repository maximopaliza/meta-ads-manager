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
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data
}

// POST { draftId }
export async function POST(req: NextRequest) {
  if (!META_TOKEN) return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })

  const { draftId } = await req.json()
  if (!draftId) return NextResponse.json({ error: 'draftId requerido' }, { status: 400 })

  const { data: draft, error } = await supabaseAdmin
    .from('campaign_drafts')
    .select('*')
    .eq('id', draftId)
    .single()

  if (error || !draft) return NextResponse.json({ error: 'Borrador no encontrado' }, { status: 404 })

  try {
    // Activate campaign
    await metaPost(draft.campaign_id, { status: 'ACTIVE' })

    // Activate ad set
    if (draft.ad_set_id) {
      await metaPost(draft.ad_set_id, { status: 'ACTIVE' })
    }

    // Activate each ad
    const ads = (draft.ads as any[]) || []
    for (const ad of ads) {
      if (ad.adId) {
        try {
          await metaPost(ad.adId, { status: 'ACTIVE' })
        } catch (e) {
          console.error('[Activate] Ad error:', ad.adId, e)
        }
      }
    }

    // Update Supabase
    await supabaseAdmin
      .from('campaign_drafts')
      .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
      .eq('id', draftId)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[Activate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
