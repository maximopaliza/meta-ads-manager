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

// ── File Upload (resumable protocol — works for any size) ────────────────────

export async function uploadFileToGemini(
  bytes: Buffer,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const key = GEMINI_KEY()

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol':             'resumable',
        'X-Goog-Upload-Command':              'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.length),
        'X-Goog-Upload-Header-Content-Type':   mimeType,
        'Content-Type':                        'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  )

  if (!initRes.ok) {
    const txt = await initRes.text()
    throw new Error(`Gemini upload init failed (${initRes.status}): ${txt}`)
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini: no upload URL in response headers')

  // Step 2: Upload file bytes
  const uploadRes = await fetch(uploadUrl, {
    method:  'POST',
    headers: {
      'Content-Length':        String(bytes.length),
      'X-Goog-Upload-Offset':  '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type':          mimeType,
    },
    body: new Uint8Array(bytes),
  })

  if (!uploadRes.ok) {
    const txt = await uploadRes.text()
    throw new Error(`Gemini upload failed (${uploadRes.status}): ${txt}`)
  }

  const data = await uploadRes.json()
  if (data.error) throw new Error(`Gemini upload: ${data.error.message}`)

  const fileUri  = data.file?.uri
  const fileName = data.file?.name // "files/abc123"
  if (!fileUri || !fileName) throw new Error('Gemini upload: no file URI returned')

  // Step 3: Poll until ACTIVE (video processing can take 10-30s)
  for (let i = 0; i < 40; i++) {
    const checkRes = await fetch(`${BASE}/${fileName}?key=${key}`)
    const info = await checkRes.json()
    const state = info.state ?? info.file?.state
    if (state === 'ACTIVE') return fileUri
    if (state === 'FAILED') throw new Error('Gemini file processing failed')
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('Gemini file processing timed out (2 min)')
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
