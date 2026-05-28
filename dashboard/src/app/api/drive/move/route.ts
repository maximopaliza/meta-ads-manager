import { NextRequest, NextResponse } from 'next/server'
import { moveFile, SUBFOLDER_NAMES, DriveFolder } from '@/lib/drive'

export async function POST(req: NextRequest) {
  const { fileId, destFolder } = await req.json()

  if (!fileId || !SUBFOLDER_NAMES.includes(destFolder)) {
    return NextResponse.json({ error: 'fileId y destFolder requeridos' }, { status: 400 })
  }

  try {
    await moveFile(fileId, destFolder as DriveFolder)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[Drive move]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
