'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

// ── Minimal API routes for products (server actions via fetch) ─────────────────
// GET/POST /api/products handled inline below

type Product = {
  id: string
  name: string
  brand: string
  tagline: string
  price: string
  conditions: string
  url: string
  reviews: string
  benefits: string[]
  audiences: string[]
  differentiators: string[]
  testimonials: string[]
  copy_rules: Record<string, string>
  active: boolean
}

const EMPTY: Omit<Product, 'id' | 'active'> = {
  name: '',
  brand: '',
  tagline: '',
  price: '',
  conditions: '',
  url: '',
  reviews: '',
  benefits: [],
  audiences: [],
  differentiators: [],
  testimonials: [],
  copy_rules: {},
}

// ── Components ────────────────────────────────────────────────────────────────

function TagEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ fontSize: '12px', color: '#7A90AA', display: 'block', marginBottom: '5px' }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
        {values.map((v, i) => (
          <span key={i} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: '#0C1A2E', border: '1px solid #1A4080',
            borderRadius: '5px', padding: '3px 10px', fontSize: '12px', color: '#C0CFDF',
          }}>
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim()) {
              onChange([...values, input.trim()])
              setInput('')
            }
          }}
          placeholder="Escribí y presioná Enter..."
          style={inputStyle}
        />
        <button
          onClick={() => { if (input.trim()) { onChange([...values, input.trim()]); setInput('') } }}
          style={btnSecondary}
        >+</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, multiline = false, type = 'text' }: any) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ fontSize: '12px', color: '#7A90AA', display: 'block', marginBottom: '5px' }}>{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      }
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#050C1E', border: '1px solid #1A4080',
  borderRadius: '6px', color: '#E8EDF5', fontSize: '13px', padding: '8px 12px',
  boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  background: '#6366F1', color: '#fff', border: 'none', borderRadius: '6px',
  padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#0C1A2E', color: '#C0CFDF', border: '1px solid #1A4080',
  borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  background: 'transparent', color: '#EF4444', border: '1px solid #EF444435',
  borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [editing, setEditing]   = useState<Product | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    setLoading(true)
    const res = await fetch('/api/products')
    const data = await res.json()
    setProducts(data.products || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const res = await fetch('/api/products', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { showToast('❌ Error: ' + data.error); return }
    showToast('✅ Guardado')
    setEditing(null)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    await fetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  function startNew() {
    setEditing({ id: '', active: true, ...EMPTY } as Product)
  }

  function update(key: keyof Product, val: any) {
    setEditing(p => p ? { ...p, [key]: val } : p)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030810' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
        <Header title="Productos" subtitle="Información de productos para generación de copy" />

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: '80px', right: '24px', zIndex: 9999,
            background: '#0C1A2E', border: '1px solid #1A4080', borderRadius: '8px',
            padding: '12px 20px', fontSize: '13px', color: '#E8EDF5',
          }}>{toast}</div>
        )}

        <main style={{ padding: '20px', maxWidth: '1000px' }}>

          {/* Product list */}
          {!editing && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button onClick={startNew} style={btnPrimary}>+ Nuevo producto</button>
              </div>

              {loading ? (
                <div style={{ color: '#7A90AA', textAlign: 'center', padding: '60px' }}>Cargando...</div>
              ) : products.length === 0 ? (
                <div style={{
                  background: '#0C0F1A', border: '1px solid #1A4080', borderRadius: '10px',
                  padding: '60px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
                  <div style={{ color: '#E8EDF5', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                    No hay productos
                  </div>
                  <div style={{ color: '#7A90AA', fontSize: '13px', marginBottom: '20px' }}>
                    Agregá el primero para empezar a generar copy automático
                  </div>
                  <button onClick={startNew} style={btnPrimary}>+ Crear producto</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {products.map(p => (
                    <div key={p.id} style={{
                      background: '#080E1C', border: '1px solid #1A4080', borderRadius: '10px', padding: '16px 20px',
                      display: 'flex', alignItems: 'center', gap: '16px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8EDF5' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: '#7A90AA', marginTop: '2px' }}>{p.brand} · {p.tagline}</div>
                        {p.url && <div style={{ fontSize: '11px', color: '#3A5270', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.url}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button onClick={() => setEditing(p)} style={btnSecondary}>Editar</button>
                        <button onClick={() => handleDelete(p.id)} style={btnDanger}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Editor form */}
          {editing && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button onClick={() => setEditing(null)} style={btnSecondary}>← Volver</button>
                <h2 style={{ color: '#E8EDF5', fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  {editing.id ? 'Editar producto' : 'Nuevo producto'}
                </h2>
              </div>

              <div style={{
                background: '#080E1C', border: '1px solid #1A4080', borderRadius: '12px', padding: '24px',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                  <Field label="Nombre del producto *" value={editing.name} onChange={(v: string) => update('name', v)} />
                  <Field label="Marca *" value={editing.brand} onChange={(v: string) => update('brand', v)} />
                  <Field label="Tagline" value={editing.tagline} onChange={(v: string) => update('tagline', v)} />
                  <Field label="Precio" value={editing.price} onChange={(v: string) => update('price', v)} />
                </div>
                <Field label="Condiciones / Garantía" value={editing.conditions} onChange={(v: string) => update('conditions', v)} />
                <Field label="URL de destino" value={editing.url} onChange={(v: string) => update('url', v)} type="url" />
                <Field label="Reseñas / Valoraciones" value={editing.reviews} onChange={(v: string) => update('reviews', v)} multiline />

                <div style={{ height: '1px', background: '#1A4080', margin: '20px 0' }} />

                <TagEditor label="Beneficios (uno por Enter)" values={editing.benefits} onChange={v => update('benefits', v)} />
                <TagEditor label="Audiencias objetivo" values={editing.audiences} onChange={v => update('audiences', v)} />
                <TagEditor label="Diferenciadores" values={editing.differentiators} onChange={v => update('differentiators', v)} />
                <TagEditor label="Testimonios destacados" values={editing.testimonials} onChange={v => update('testimonials', v)} />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button onClick={() => setEditing(null)} style={btnSecondary}>Cancelar</button>
                  <button onClick={handleSave} disabled={saving} style={btnPrimary}>
                    {saving ? 'Guardando...' : 'Guardar producto'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
