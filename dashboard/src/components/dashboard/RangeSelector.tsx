'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
]

export default function RangeSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = Number(params.get('days') || 7)

  const select = (days: number) => {
    const p = new URLSearchParams(params.toString())
    p.set('days', String(days))
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1A1D27', border: '1px solid #2D3244', borderRadius: '8px', padding: '4px' }}>
      {OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => select(o.value)}
          style={{
            padding: '5px 14px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: current === o.value ? '#6366F1' : 'transparent',
            color: current === o.value ? '#fff' : '#64748B',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
