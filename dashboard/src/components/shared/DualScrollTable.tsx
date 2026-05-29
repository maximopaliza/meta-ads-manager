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

  // Sync scroll between top and bottom
  useEffect(() => {
    const top    = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom) return

    const onTop = () => {
      if (syncing.current) return
      syncing.current = true
      bottom.scrollLeft = top.scrollLeft
      syncing.current = false
    }
    const onBottom = () => {
      if (syncing.current) return
      syncing.current = true
      top.scrollLeft = bottom.scrollLeft
      syncing.current = false
    }

    top.addEventListener('scroll',    onTop,    { passive: true })
    bottom.addEventListener('scroll', onBottom, { passive: true })
    return () => {
      top.removeEventListener('scroll',    onTop)
      bottom.removeEventListener('scroll', onBottom)
    }
  }, []) // refs are stable — runs once, always finds elements

  return (
    <>
      {/* Fixed top scrollbar — always visible, synced with table */}
      <div
        ref={topRef}
        style={{
          position:   'fixed',
          top:        56,        // below page header
          left:       220,       // sidebar width
          right:      0,
          height:     10,
          zIndex:     50,
          overflowX:  'auto',
          overflowY:  'hidden',
          background: '#0C1525',
          borderBottom: '1px solid #6366F140',
          scrollbarWidth: 'thin',
          scrollbarColor: '#6366F180 #1A4080',
        } as React.CSSProperties}
      >
        {/* Ghost div — same width as table so scrollbar appears */}
        <div style={{ height: 1, minWidth: tableMinWidth, flexShrink: 0 }} />
      </div>

      {/* Spacer so content doesn't hide under the fixed bar */}
      <div style={{ height: 10 }} />

      {/* Table with bottom scrollbar */}
      <div ref={bottomRef} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </>
  )
}
