import { NextResponse } from 'next/server'

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BM_ID = process.env.META_BM_ID!
const META_BASE  = 'https://graph.facebook.com/v21.0'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!META_TOKEN) return NextResponse.json({ pages: [] })

  try {
    // Use Business Manager to list owned pages
    const res = await fetch(
      `${META_BASE}/${META_BM_ID}/owned_pages?fields=id,name&access_token=${META_TOKEN}`,
      { cache: 'no-store' },
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    if (data.data?.length) return NextResponse.json({ pages: data.data })

    // Fallback: client pages
    const res2 = await fetch(
      `${META_BASE}/${META_BM_ID}/client_pages?fields=id,name&access_token=${META_TOKEN}`,
      { cache: 'no-store' },
    )
    const data2 = await res2.json()
    if (data2.error) throw new Error(data2.error.message)
    return NextResponse.json({ pages: data2.data || [] })
  } catch (err: any) {
    console.error('[Pages]', err)
    return NextResponse.json({ pages: [], error: err.message })
  }
}
