import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const session = request.cookies.get('session')
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const password = process.env.DASHBOARD_PASSWORD ?? ''
  const secret = process.env.SESSION_SECRET ?? ''
  const expected = await sha256(password + secret)

  if (session.value !== expected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
