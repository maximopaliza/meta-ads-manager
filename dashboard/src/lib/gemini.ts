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
const MODEL = 'gemini-2.5-flash'

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
    `${BASE}/models/${MODEL}:generateContent?key=${key}`,
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
  // We always receive either a thumbnail image or a small image file.
  // Always use inline data — no file upload needed, no quota drain.
  const INLINE_LIMIT = 18 * 1024 * 1024
  let mediaPart: GeminiPart

  if (bytes.length > INLINE_LIMIT) {
    // Only as last resort for very large images
    const uri = await uploadFileToGemini(bytes, mimeType, fileName)
    mediaPart = { fileData: { mimeType, fileUri: uri } }
  } else {
    mediaPart = { inlineData: { mimeType: mimeType.startsWith('video/') ? 'image/jpeg' : mimeType, data: bytes.toString('base64') } }
  }

  const prompt = `Eres un experto en publicidad digital de Meta Ads para e-commerce argentino.
Escribís copy persuasivo, coloquial, empático. Conocés las políticas de Meta Ads al detalle.

DATOS DEL PRODUCTO:
${productContext}

════════════════════════════════════════
REGLAS DE META ADS — CUMPLIMIENTO OBLIGATORIO
════════════════════════════════════════

❌ NUNCA USES:
- "Cura", "trata", "elimina", "revierte" (claims médicos prohibidos)
- "Previene cataratas/glaucoma" como claim absoluto
- "Reemplaza el tratamiento médico"
- "Pagá al recibir" (no aplica en Argentina)
- Números de tiempo exactos para resultados ("en 7 días verás X")
- Atacar marcas de gotas o sprays por nombre

✅ SIEMPRE USA:
- "Apoya", "frena el deterioro", "protege", "nutre", "contribuye"
- "Complementa el tratamiento médico"
- Cerrar SIEMPRE con: "3 cuotas sin interés + envío gratis a todo el país"
- Mencionar el Estudio AREDS2 y el "68% menos riesgo" cuando sea relevante
- Testimonios reales como prueba social
- Garantía 60 días para reducir fricción de compra

════════════════════════════════════════
ÁNGULOS DE COPY DISPONIBLES (elegí el más afín al creativo)
════════════════════════════════════════
- deterioro_silencioso: vista que se deteriora con el tiempo sin que uno lo note
- fatiga_pantallas: horas frente al monitor, cansancio visual digital
- ojo_seco: las gotas no resuelven la causa, solo alivian la superficie
- danos_sol: daño UV en retina, protección desde adentro
- glaucoma_macular: complemento natural para glaucoma y degeneración macular
- diabetes_hipertension: retina en mayor riesgo, cuidado proactivo
- carnosidad: frenar el avance del pterigión sin cirugía
- ojos_rojos: problema estético y funcional, inflamación crónica
- antecedentes_familiares: prevención proactiva por historia familiar
- spray_vs_capsula: la vía oral llega a donde las gotas nunca llegan (respaldo AREDS2)
- estudio_areds2: 68% menos riesgo, respaldo científico clínico
- recuperacion_vista: células oculares que vuelven a nutrirse
- paso_anos: deterioro progresivo inevitable sin nutrición ocular
- conductores_nocturnos: halos y dificultad para ver de noche
- oferta_urgencia: stock limitado / precio especial

════════════════════════════════════════
CIERRE OBLIGATORIO DEL PRIMARY TEXT
════════════════════════════════════════
Siempre terminar con algo como:
"📦 Envío gratis a todo el país · 3 cuotas sin interés · Garantía 60 días"

════════════════════════════════════════
TU TAREA
════════════════════════════════════════
Analizá esta imagen (frame/thumbnail del creativo publicitario):
1. Identificá el ángulo principal según los disponibles arriba
2. Escribí el headline (MÁXIMO 40 caracteres, con emojis, incluir "🚚 Envío gratis" o "3 cuotas" si queda)
3. Escribí el primary_text en español argentino coloquial, máximo 120 palabras, respetando TODAS las reglas de Meta
4. Describí en 1 oración el público objetivo ideal
5. Proponé targeting básico para Meta Ads API

Respondé ÚNICAMENTE con este JSON (sin texto extra, sin markdown):
{
  "angle": "nombre_del_angulo_elegido",
  "angle_description": "qué muestra el creativo en 1 oración",
  "primary_text": "copy completo del anuncio...",
  "headline": "titular máx 40 chars",
  "audience_summary": "descripción del público objetivo ideal",
  "targeting": {
    "geo_locations": {"countries": ["AR"]},
    "age_min": 35,
    "age_max": 65
  }
}`

  const raw = await generateContent([mediaPart, { text: prompt }])

  // Clean possible markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(cleaned) as CreativeAnalysis
}
