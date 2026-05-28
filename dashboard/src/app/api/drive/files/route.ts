import { NextResponse } from 'next/server'
import { getDriveStructure } from '@/lib/drive'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const structure = await getDriveStructure()
    return NextResponse.json(structure)
  } catch (err: any) {
    console.error('[Drive files]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
