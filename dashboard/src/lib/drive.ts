/**
 * Google Drive API access using service account JWT — no extra npm packages.
 * Requires: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID
 * SERVER-ONLY — uses Node.js crypto. Do not import in client components.
 */
import { createSign } from 'crypto'
export { SUBFOLDER_NAMES, SUBFOLDER_EMOJI } from './drive-constants'
export type { DriveFolder } from './drive-constants'
import { SUBFOLDER_NAMES, type DriveFolder } from './drive-constants'

export interface DriveFile {
  id: string
  name: string
  size: number
  mimeType: string
  modifiedTime: string
  folder: DriveFolder
  isVideo: boolean
  thumbnailLink?: string
}

const VIDEO_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/webm',
])
const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
])

function getCredentials() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  return JSON.parse(json)
}

function createJWT(creds: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claim = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${claim}`)
  const sig = sign.sign(creds.private_key, 'base64url')
  return `${header}.${claim}.${sig}`
}

let _tokenCache: { token: string; exp: number } | null = null

export async function getDriveToken(): Promise<string> {
  if (_tokenCache && _tokenCache.exp > Date.now() / 1000 + 60) return _tokenCache.token
  const creds = getCredentials()
  const jwt = createJWT(creds)
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await resp.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  _tokenCache = { token: data.access_token, exp: Math.floor(Date.now() / 1000) + 3600 }
  return data.access_token
}

async function driveGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const token = await getDriveToken()
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  return resp.json()
}

async function drivePost(path: string, body: any): Promise<any> {
  const token = await getDriveToken()
  const resp = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return resp.json()
}

/** Returns or creates a subfolder under the root Drive folder */
async function getOrCreateFolder(name: string, parentId: string): Promise<string> {
  const q = `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await driveGet('files', { q, fields: 'files(id)' })
  if (res.files?.length) return res.files[0].id
  const created = await drivePost('files', { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  return created.id
}

/** Lists all Drive files organized by subfolder */
export async function getDriveStructure(): Promise<Record<DriveFolder, DriveFile[]>> {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

  const result: Record<string, DriveFile[]> = {}
  for (const folderName of SUBFOLDER_NAMES) {
    const folderId = await getOrCreateFolder(folderName, rootId)
    const mimeQ = [...VIDEO_MIMES, ...IMAGE_MIMES].map(m => `mimeType='${m}'`).join(' or ')
    const q = `'${folderId}' in parents and (${mimeQ}) and trashed=false`
    const res = await driveGet('files', {
      q,
      fields: 'files(id,name,size,mimeType,modifiedTime,thumbnailLink)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
    })
    result[folderName] = (res.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      size: parseInt(f.size || '0'),
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      folder: folderName as DriveFolder,
      isVideo: VIDEO_MIMES.has(f.mimeType),
      thumbnailLink: f.thumbnailLink?.replace('=s220', '=s400'),
    }))
  }
  return result as Record<DriveFolder, DriveFile[]>
}

/** Moves a file to a different subfolder */
export async function moveFile(fileId: string, destFolder: DriveFolder): Promise<void> {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID!
  const destId = await getOrCreateFolder(destFolder, rootId)
  const token = await getDriveToken()

  // Get current parents
  const meta = await driveGet(`files/${fileId}`, { fields: 'parents' })
  const currentParents = (meta.parents || []).join(',')

  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${destId}&removeParents=${currentParents}&fields=id`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** Returns a direct download URL for a Drive file */
export function getDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}

/** Downloads a Drive file and returns its bytes */
export async function downloadFile(fileId: string): Promise<{ bytes: Buffer; mimeType: string; name: string }> {
  const token = await getDriveToken()
  const meta = await driveGet(`files/${fileId}`, { fields: 'mimeType,name' })
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const arrayBuffer = await resp.arrayBuffer()
  return { bytes: Buffer.from(arrayBuffer), mimeType: meta.mimeType, name: meta.name }
}
