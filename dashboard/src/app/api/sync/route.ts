import { NextResponse } from 'next/server'

export async function POST() {
  const botUrl = process.env.BOT_SYNC_URL
  if (!botUrl) {
    return NextResponse.json({ error: 'BOT_SYNC_URL not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${botUrl}/sync`, { method: 'POST', signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error('Bot returned error')
    return NextResponse.json({ ok: true, message: 'Sync iniciado' })
  } catch {
    return NextResponse.json({ ok: false, message: 'Sync no disponible — correrá en el próximo ciclo automático' })
  }
}
