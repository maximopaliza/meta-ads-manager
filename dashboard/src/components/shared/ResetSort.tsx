'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Props {
  currentSort: string
  label?: string
}

export default function ResetSort({ currentSort, label }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  if (!currentSort) return null

  function reset() {
    const p = new URLSearchParams(params.toString())
    p.delete('sort')
    p.delete('dir')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <button
      onClick={reset}
      style={{
        background: '#6366F115',
        border: '1px solid #6366F135',
        borderRadius: '5px',
        color: '#6366F1',
        fontSize: '11px',
        fontWeight: 600,
        padding: '3px 10px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      ✕ {label || `Orden: ${currentSort}`}
    </button>
  )
}
