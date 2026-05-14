import { createHash } from 'crypto'
import { cookies } from 'next/headers'

export function getSessionHash(): string {
  const password = process.env.DASHBOARD_PASSWORD!
  const secret = process.env.SESSION_SECRET!
  return createHash('sha256').update(password + secret).digest('hex')
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  if (!session) return false
  return session.value === getSessionHash()
}
