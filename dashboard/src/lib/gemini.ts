/**
 * Gemini 1.5 Pro — REST API wrapper (no extra npm packages).
 * Requires: GEMINI_API_KEY
 */

const GEMINI_KEY = () => {
  const k = process.env.GEMINI_API_KEY
  if (!k) throw new Error('GEMINI_API_KEY not set')
  return k
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

// ── File Upload (for files > 20 MB or any video) ──────────────────────────────

export async function uploadFileToGemini(
  bytes: Buffer,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const key = GEMINI_KEY()

  // Multipart upload
  const boundary = 'gem_boundary_' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ file: { display_name: displayName } })

  const parts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]
  const body = Buffer.concat(parts)

  const res = await fetch(
    `${BASE}/files?uploadType=multipart&key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  const data = await res.json()
  if (data.error) throw new Error(`Gemini upload: ${data.error.message}`)

  const fileUri = data.file?.uri
  if (!fileUri) throw new Error(`Gemini upload: no file URI returned`)

  // Poll until ACTIVE
  for (let i = 0; i < 30; i++) {
    const check = await fetch(`${BASE}/${fileUri.split('/v1beta/')[1]}?key=${key}`)
    const info = await check.json()
    if (info.state === 'ACTIVE') return fileUri
    if (info.state === 'FAILED') throw new Error('Gemini file processing failed')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Gemini file processing timed out')
}

// ── Generate content ──────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
  fileData?: { mimeType: string; fileUri: string }
}

export async function generateContent(parts: GeminiPart[]): Promise<string> {
  const key = GEMINI_KEY()
  const res = await fetch(
    `${BASE}/models/gemini-1.5-pro:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    },
  )
  const data = await res.json()
  if (data.error) throw new Error(`Gemini generate: ${data.error.message}`)
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini: empty response')
  return text
}

// ── High-level: analyze a creative ────────────────────────────────────────────

export interface CreativeAnalysis {
  angle: string
  angle_description: string
  primary_text: string
  headline: string
  audience_summary: string
  targeting: Record<string, unknown>
}

export async function analyzeCreative(
  bytes: Buffer,
  mimeType: string,
  fileName: string,
  productContext: string,
): Promise<CreativeAnalysis> {
  const isVideo = mimeType.startsWith('video/')
  const INLINE_LIMIT = 18 * 1024 * 1024 // 18 MB — stay under 20 MB limit

  let mediaPart: GeminiPart

  if (bytes.length > INLINE_LIMIT || isVideo) {
    const uri = await uploadFileToGemini(bytes, mimeType, fileName)
    mediaPart = { fileData: { mimeType, fileUri: uri } }
  } else {
    mediaPart = { inlineData: { mimeType, data: bytes.toString('base64') } }
  }

  const prompt = `Eres un experto en publicidad digital de Meta Ads para e-commerce latinoamericano.

Analiza este creativo publicitario (${isVideo ? 'video' : 'imagen'}) y los datos del producto a continuación.
Tu tarea es detectar el ángulo de venta y generar el copy completo para un anuncio en Meta Ads.

DATOS DEL PRODUCTO:
${productContext}

INSTRUCCIONES:
1. Detecta el ángulo/hook principal del creativo (qué problema resuelve, qué emoción activa, qué beneficio muestra).
2. Escribe el copy del anuncio adaptado a ese ángulo.
3. El "headline" debe tener MÁXIMO 40 caracteres.
4. El "primary_text" debe ser persuasivo, en español argentino coloquial, máximo 150 palabras.
5. El "audience_summary" es una descripción de 1 oración del público objetivo ideal.
6. El "targeting" es un objeto JSON válido para Meta Ads API (geo_locations, age_min, age_max, etc).

Responde ÚNICAMENTE con este JSON (sin texto extra):
{
  "angle": "nombre_corto_del_angulo",
  "angle_description": "descripción del ángulo en 1 oración",
  "primary_text": "copy completo del anuncio...",
  "headline": "titular (máx 40 chars)",
  "audience_summary": "descripción del público objetivo",
  "targeting": {
    "geo_locations": {"countries": ["AR"]},
    "age_min": 30,
    "age_max": 65
  }
}`

  const raw = await generateContent([mediaPart, { text: prompt }])

  // Clean possible markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(cleaned) as CreativeAnalysis
}
