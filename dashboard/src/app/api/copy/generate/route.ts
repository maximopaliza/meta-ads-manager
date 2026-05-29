import { NextRequest, NextResponse } from 'next/server'
import { generateContent } from '@/lib/gemini'
import { supabaseAdmin } from '@/lib/supabase'
import { getDriveToken } from '@/lib/drive'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Sos un experto en copywriting para Meta Ads en Argentina, especializado en suplementos de salud ocular.

Producto: Ovitta Vision Complete — suplemento ocular en spray oral.
Beneficios clave: luteína, zeaxantina, omega-3. Respaldo: Estudio AREDS2 (68% menos riesgo).
Condiciones: 3 cuotas sin interés + envío gratis a todo el país + garantía 60 días.

REGLAS ABSOLUTAS:
- NUNCA usar: "cura", "trata", "elimina", "revierte", "previene" como claim absoluto
- SIEMPRE usar: "apoya", "frena el deterioro", "protege", "nutre", "contribuye"
- SIEMPRE cerrar con: 3 cuotas sin interés + Envío gratis a todo el país
- Español rioplatense (Argentina) — natural, sin formalidades
- primary_text: máx 125 caracteres — gancho emocional o dato concreto en la primera línea
- headline: máx 40 caracteres — impacto directo, sin punto final

Respondé ÚNICAMENTE con JSON (sin markdown, sin texto extra):
{
  "primary_text": "...",
  "headline": "..."
}`

export async function POST(req: NextRequest) {
  const { angle, driveFileId, thumbnailLink } = await req.json()
  if (!angle) return NextResponse.json({ error: 'angle requerido' }, { status: 400 })

  // ── 1. Buscar análisis cacheado en Supabase ──────────────────────────────
  let videoContext = ''
  if (driveFileId) {
    try {
      const { data: cached } = await supabaseAdmin
        .from('video_analysis')
        .select('analysis, primary_text, headline')
        .eq('drive_file_id', driveFileId)
        .single()
      if (cached?.analysis) {
        videoContext = `\n\nEl video trata sobre: ${cached.analysis}`
      }
    } catch (_) {}
  }

  // ── 2. Si no hay cache, analizar el thumbnail con Gemini ─────────────────
  if (!videoContext && thumbnailLink) {
    try {
      const token = await getDriveToken()
      const thumbRes = await fetch(thumbnailLink, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (thumbRes.ok) {
        const buf = Buffer.from(await thumbRes.arrayBuffer())
        const base64 = buf.toString('base64')
        const mime = thumbRes.headers.get('content-type') || 'image/jpeg'

        const descRaw = await generateContent([
          { inlineData: { mimeType: mime, data: base64 } },
          { text: 'Describí en 1-2 oraciones de qué trata este video publicitario: qué problema muestra, qué emoción transmite, de qué habla. Sé concreto y breve.' },
        ])
        if (descRaw) videoContext = `\n\nEl video trata sobre: ${descRaw.trim()}`
      }
    } catch (_) {}
  }

  // ── 3. Cargar copies ganadores para este ángulo ──────────────────────────
  let winnersContext = ''
  try {
    const { data } = await supabaseAdmin
      .from('ads')
      .select('primary_text, headline, roas')
      .eq('angle', angle)
      .gte('roas', 2)
      .order('roas', { ascending: false })
      .limit(3)
    if (data?.length) {
      winnersContext = '\n\nEjemplos de copies ganadores para este ángulo:\n' +
        data.map(w => `- Titular: "${w.headline}" | Texto: "${w.primary_text}" (ROAS ${w.roas?.toFixed(1)}x)`).join('\n')
    }
  } catch (_) {}

  // ── 4. Generar copy ───────────────────────────────────────────────────────
  const prompt = `Generá copy para un anuncio de Meta Ads.
Ángulo elegido: "${angle}"${videoContext}${winnersContext}

El copy debe reflejar exactamente el tema del video. Respondé solo con el JSON.`

  try {
    const raw = await generateContent([{ text: SYSTEM_PROMPT + '\n\n' + prompt }])
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const result = JSON.parse(cleaned)
    return NextResponse.json({ primary_text: result.primary_text || '', headline: result.headline || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
