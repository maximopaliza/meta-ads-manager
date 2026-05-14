import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionHash = createHash('sha256')
    .update(process.env.DASHBOARD_PASSWORD! + process.env.SESSION_SECRET!)
    .digest('hex')

  const response = NextResponse.json({ ok: true })
  response.cookies.set('session', sessionHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('session')
  return response
}
