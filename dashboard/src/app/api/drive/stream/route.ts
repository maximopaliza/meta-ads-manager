import { NextRequest, NextResponse } from 'next/server'
import { getDriveToken } from '@/lib/drive'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('id')
  if (!fileId) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const token = await getDriveToken()
  const range = req.headers.get('range')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  if (range) headers['Range'] = range

  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers },
  )

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: 'No se pudo obtener el archivo' }, { status: upstream.status })
  }

  const contentType = upstream.headers.get('content-type') || 'video/mp4'
  const contentLength = upstream.headers.get('content-length')
  const contentRange = upstream.headers.get('content-range')

  const resHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  }
  if (contentLength) resHeaders['Content-Length'] = contentLength
  if (contentRange) resHeaders['Content-Range'] = contentRange

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}
