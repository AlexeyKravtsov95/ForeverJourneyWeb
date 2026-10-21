import type { ReactNode } from 'react'

export function Divider({ className }: { className?: string }) {
  return (
    <svg
      className={`ornament-divider ${className ?? ''}`}
      viewBox="0 0 200 14"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M4 7h68" />
        <path d="M128 7h68" />
        <path d="M86 7c3-4 9-4 11 0-2 4-8 4-11 0z" />
        <path d="M114 7c-3-4-9-4-11 0 2 4 8 4 11 0z" />
        <path d="M100 1.5 104.5 7 100 12.5 95.5 7z" fill="currentColor" stroke="none" />
        <circle cx="80" cy="7" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="120" cy="7" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

export function Crest({ className }: { className?: string }) {
  return (
    <svg className={`ornament-crest ${className ?? ''}`} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="60" cy="60" r="33" />
        <circle cx="60" cy="60" r="44" strokeDasharray="2 5" strokeWidth="1" />
        <path d="M38 52c8-4 15-4 22 0v26c-7-4-14-4-22 0V52z" />
        <path d="M82 52c-8-4-15-4-22 0v26c7-4 14-4 22 0V52z" />
        <path d="M60 52v26" strokeWidth="1" />
        <path
          d="M60 6v12M60 102v12M6 60h12M102 60h12M22 22l8.5 8.5M98 22l-8.5 8.5M22 98l8.5-8.5M98 98l-8.5-8.5"
          strokeWidth="1"
        />
        <path d="M18 44c2-3 5-3 7 0-2 3-5 3-7 0z" fill="currentColor" stroke="none" />
        <path d="M102 44c-2-3-5-3-7 0 2 3 5 3 7 0z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

export function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 60" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor">
        <path d="M4 56V20C4 10 10 4 20 4h36" strokeWidth="1.5" />
        <path d="M12 56V24c0-7 5-12 12-12h32" strokeWidth="1" opacity=".55" />
        <path d="M4 44c8 0 13-5 13-13M17 56c0-8 5-13 13-13" strokeWidth="1" />
        <circle cx="21" cy="43" r="2" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

export function Star({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z"
        fill="currentColor"
      />
    </svg>
  )
}

const TYPE_ICONS: Record<string, ReactNode> = {
  achievement: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" />
      <path d="M12 13v5M8 20h8" />
    </>
  ),
  death: (
    <>
      <path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.4 1.2 3.9 2.5 5V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.5c1.3-1.1 2.5-2.6 2.5-5A7.5 7.5 0 0 0 12 3z" />
      <circle cx="9.3" cy="11" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="11" r="1.3" fill="currentColor" stroke="none" />
      <path d="M10.5 15.5v2M13.5 15.5v2" />
    </>
  ),
  zone: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  note: (
    <>
      <path d="M20 4c-6.5 0-11.5 4-13.5 9.5L4 20l6.5-2.5C16 15.5 19.9 10.5 20 4z" />
      <path d="M4.5 19.5C8.5 13.5 13 9 19.5 5" strokeWidth="1" />
    </>
  ),
  level: (
    <>
      <path d="M12 20V6M7 11l5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  memory: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
      <path d="M20 17v4H6.5" />
    </>
  ),
}

function iconKey(type: string): string {
  const value = type.toLowerCase()
  if (value.includes('achieve')) return 'achievement'
  if (value.includes('death') || value.includes('kill')) return 'death'
  if (value.includes('zone') || value.includes('area')) return 'zone'
  if (value.includes('note') || value.includes('journal') || value.includes('entry')) return 'note'
  if (value.includes('level')) return 'level'
  return 'memory'
}

export function TypeIcon({ type }: { type: string }) {
  return (
    <svg
      className="type-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TYPE_ICONS[iconKey(type)]}
    </svg>
  )
}
