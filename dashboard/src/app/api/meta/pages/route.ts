import { NextResponse } from 'next/server'

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BASE  = 'https://graph.facebook.com/v21.0'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!META_TOKEN) return NextResponse.json({ pages: [] })

  try {
    const res = await fetch(
      `${META_BASE}/me/accounts?fields=id,name&access_token=${META_TOKEN}`,
      { cache: 'no-store' },
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return NextResponse.json({ pages: data.data || [] })
  } catch (err: any) {
    console.error('[Pages]', err)
    return NextResponse.json({ pages: [], error: err.message })
  }
}
