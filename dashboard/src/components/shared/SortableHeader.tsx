'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Props {
  col: string
  label: string
  currentSort: string
  currentDir: string
  style?: React.CSSProperties
}

export default function SortableHeader({ col, label, currentSort, currentDir, style }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const active = currentSort === col
  const nextDir = active && currentDir === 'desc' ? 'asc' : 'desc'

  function handleClick() {
    const p = new URLSearchParams(params.toString())
    p.set('sort', col)
    p.set('dir', nextDir)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <th
      onClick={handleClick}
      style={{
        ...style,
        cursor: 'pointer',
        userSelect: 'none',
        color: active ? '#6366F1' : '#7A90AA',
        background: active ? '#6366F108' : undefined,
        whiteSpace: 'nowrap',
      }}
      title={`Ordenar por ${label}`}
    >
      {label}
      <span style={{ marginLeft: '4px', fontSize: '9px', opacity: active ? 1 : 0.3 }}>
        {active ? (currentDir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    </th>
  )
}
