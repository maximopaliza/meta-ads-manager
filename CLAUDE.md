# Meta Ads AI Manager

Dashboard web + bot de Telegram para gestionar, analizar y crear campañas de Meta Ads con IA.
Un solo usuario (Paliza). Dos servicios: dashboard Next.js + bot Python.

## Commands

### Dashboard
- `pnpm dev` — Dev server en localhost:3000
- `pnpm build` — Build de producción
- `pnpm lint` — Linter

### Bot
- `python main.py` — Iniciar bot + scheduler (APScheduler)
- `python -m scheduler.sync` — Correr sync manual una vez
- `python -m meta.client` — Test de conexión a Meta API

## Tech Stack

Next.js 15 App Router + TypeScript + Tailwind CSS v4 + Tremor v3 + shadcn/ui + Supabase (Postgres) + Python 3.12 + python-telegram-bot + APScheduler + Google Gemini 1.5 Pro + Meta Marketing API v21 + Railway

## Architecture

### Dos servicios independientes
1. `dashboard/` — Next.js, solo lectura de Supabase, auto-refresh cada 15 min con `router.refresh()`
2. `bot/` — Python con APScheduler corriendo 3 jobs:
   - `sync` cada 15 min → Meta API → Supabase (upsert)
   - `analyzer` post-sync → métricas → Gemini API → inserta en `alerts`
   - `alerter` cada 5 min → alertas no enviadas → Telegram → marca `sent_to_telegram = TRUE`

### Data Flow
Meta API → Python sync → Supabase → Next.js Server Components → browser
Supabase (alerts) → Python alerter → Telegram

### Key Patterns
- Next.js: Server Components leen Supabase directamente (no pasar por API routes para el dashboard)
- Python: APScheduler maneja todos los jobs. No usar cron externo.
- Alertas: NUNCA se eliminan. Solo se marcan `sent_to_telegram = TRUE`.
- Meta API: siempre `date_preset=TODAY` para métricas del día, `date_preset=LAST_7_D` para historial.
- Sync: siempre UPSERT, nunca INSERT directo. Meta devuelve los mismos IDs.

## Code Organization Rules

1. **Dashboard**: Server Components por defecto. `'use client'` solo para componentes con interactividad (charts, filtros).
2. **Bot**: Un archivo por ConversationHandler en `bot/conversations/`. Max 200 líneas por archivo.
3. **Meta client**: Todos los calls a Meta API van por `meta/client.py`. Nunca llamar al SDK directamente desde otro módulo.
4. **Prompts**: Todos los prompts de Gemini en `ai/prompts.py`. Nunca inline en el código.
5. **Errores de Meta API**: Siempre loguear. Si un sync falla 3 veces seguidas, crear alerta `type='anomaly', severity='critical'`.

## Design System

### Colors (dark mode fijo)
- Background: #0F1117
- Surface: #1A1D27
- Primary: #6366F1
- Success: #22C55E
- Warning: #F59E0B
- Destructive: #EF4444
- Text: #F1F5F9
- Muted: #64748B
- Border: #2D3244

### Typography
- Font: Inter (next/font/google)
- Métricas: 32px / weight 700
- Body: 14px / weight 400
- Labels: 12px / weight 500

### Style
- Border radius: 8px default, 12px cards
- Dark mode only — no toggle
- Sidebar fija: 240px
- Max content width: 1400px

## Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard | Anon key pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard | Service key (server only) |
| `DASHBOARD_PASSWORD` | Dashboard | Password de acceso |
| `SESSION_SECRET` | Dashboard | Secret para cookie |
| `TELEGRAM_BOT_TOKEN` | Bot | Token @BotFather |
| `TELEGRAM_CHAT_ID` | Bot | Chat ID del usuario |
| `META_APP_ID` | Bot | App ID de Meta |
| `META_APP_SECRET` | Bot | App Secret de Meta |
| `META_ACCESS_TOKEN` | Bot | Long-lived access token (renovar cada 60 días) |
| `META_BM_ID` | Bot | Business Manager ID |
| `GEMINI_API_KEY` | Bot | Gemini API key para análisis de creativos y métricas |
| `SUPABASE_URL` | Bot | URL Supabase |
| `SUPABASE_SERVICE_KEY` | Bot | Service key |
| `DASHBOARD_URL` | Bot | URL del dashboard en Railway |

## Reglas No Negociables

1. El bot NUNCA ejecuta acciones en Meta sin confirmación explícita del usuario con botón "✅ Confirmar".
2. UPSERT siempre en sync. INSERT directo en `campaigns`, `ad_sets`, `ads`, o `metrics` está prohibido.
3. Datos monetarios en moneda original de la cuenta. No convertir a USD ni a ninguna otra moneda.
4. `SUPABASE_SERVICE_ROLE_KEY`, `META_ACCESS_TOKEN`, `GEMINI_API_KEY` nunca van al browser ni a `NEXT_PUBLIC_*`.
5. Si Gemini API falla, el sync de datos de Meta continúa igual. El análisis de IA es opcional; los datos no lo son.
