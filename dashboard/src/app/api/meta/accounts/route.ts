import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Returns ad accounts from Supabase (synced by the bot)
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('ad_accounts')
    .select('id, name, currency, timezone')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data || [] })
}
