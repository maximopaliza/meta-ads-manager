'use client'

import { useRef, useEffect, useState } from 'react'

interface Props {
  children: React.ReactNode
  tableMinWidth: number
}

export default function DualScrollTable({ children, tableMinWidth }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const fixedRef   = useRef<HTMLDivElement>(null)
  const syncing    = useRef(false)

  // Position state for the fixed scrollbar
  const [barStyle, setBarStyle] = useState<React.CSSProperties>({ display: 'none' })
  const [visible, setVisible]   = useState(false)

  // Calculate fixed bar position from wrapper's bounding rect
  useEffect(() => {
    const update = () => {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      setBarStyle({
        position:   'fixed',
        left:       rect.left,
        width:      rect.width,
        top:        56,   // below the page header (~56px tall)
        height:     12,
        zIndex:     40,
        overflowX:  'auto',
        overflowY:  'hidden',
        background: '#071428',
        borderBottom: '2px solid #6366F130',
        cursor:     'ew-resize',
        scrollbarWidth: 'thin' as any,
        scrollbarColor: '#6366F1 #1A4080',
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Show/hide bar based on whether we've scrolled past the table top
  useEffect(() => {
    const onScroll = () => {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      // Show bar when table top is above viewport top (user scrolled into table)
      setVisible(rect.top < 56 && rect.bottom > 120)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sync scroll between fixed bar and table
  useEffect(() => {
    const fixed  = fixedRef.current
    const bottom = bottomRef.current
    if (!fixed || !bottom) return

    const onFixed = () => {
      if (syncing.current) return
      syncing.current = true
      bottom.scrollLeft = fixed.scrollLeft
      syncing.current = false
    }
    const onBottom = () => {
      if (syncing.current) return
      syncing.current = true
      fixed.scrollLeft = bottom.scrollLeft
      syncing.current = false
    }

    fixed.addEventListener('scroll',  onFixed,  { passive: true })
    bottom.addEventListener('scroll', onBottom, { passive: true })
    return () => {
      fixed.removeEventListener('scroll',  onFixed)
      bottom.removeEventListener('scroll', onBottom)
    }
  }, [])

  return (
    <div ref={wrapperRef}>
      {/* Fixed scrollbar — appears when user scrolls into the table */}
      {visible && (
        <div ref={fixedRef} style={barStyle}>
          <div style={{ height: 1, minWidth: tableMinWidth }} />
        </div>
      )}

      {/* Actual table with bottom scrollbar */}
      <div ref={bottomRef} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
