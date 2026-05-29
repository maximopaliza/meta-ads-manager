'use client'

import { useRef, useEffect } from 'react'

interface Props {
  children: React.ReactNode
  tableMinWidth: number
}

export default function DualScrollTable({ children, tableMinWidth }: Props) {
  const topRef    = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const syncing   = useRef(false)

  useEffect(() => {
    const top    = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom) return

    const onBottom = () => {
      if (syncing.current) return
      syncing.current = true
      top.scrollLeft = bottom.scrollLeft
      syncing.current = false
    }
    const onTop = () => {
      if (syncing.current) return
      syncing.current = true
      bottom.scrollLeft = top.scrollLeft
      syncing.current = false
    }

    bottom.addEventListener('scroll', onBottom)
    top.addEventListener('scroll', onTop)
    return () => {
      bottom.removeEventListener('scroll', onBottom)
      top.removeEventListener('scroll', onTop)
    }
  }, [])

  return (
    <div>
      {/* Top scrollbar — sticky so it stays visible while scrolling down */}
      <div
        ref={topRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#071428',
          borderBottom: '1px solid #1A4080',
          scrollbarWidth: 'thin',
          scrollbarColor: '#6366F1 #1A4080',
        }}
      >
        <div style={{ height: '8px', minWidth: `${tableMinWidth}px` }} />
      </div>

      {/* Actual table */}
      <div ref={bottomRef} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
