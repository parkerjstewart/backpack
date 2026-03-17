'use client'

import { useMemo } from 'react'

interface TutorLoadingAnimationProps {
  /** When true the dot uncurls into the spring; when false it's a static fuzzy dot. */
  isLoading?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function TutorLoadingAnimation({
  isLoading = false,
  size = 'md',
  className = '',
}: TutorLoadingAnimationProps) {
  const config = {
    sm:  { w: 48, h: 18, sw: 2,   dot: 6  },
    md:  { w: 80, h: 28, sw: 2.5, dot: 8  },
    lg:  { w: 120, h: 42, sw: 3,  dot: 12 },
  }
  const { w, h, sw, dot } = config[size]

  // Generate a parametric spring coil: big loops → small loops, left → right.
  const d = useMemo(() => {
    const loops = 4
    const extra = 0.3
    const totalT = (loops + extra) * 2 * Math.PI
    const steps = 120
    const cy = h / 2
    const maxR = h * 0.40
    const advance = (w - maxR) / totalT

    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * totalT
      const progress = t / totalT
      const r = maxR * Math.max(0.12, 1 - progress * 0.88)
      const x = advance * t + r * Math.sin(t) + maxR * 0.15
      const y = cy + r * Math.cos(t)
      pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
    }
    return `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ')
  }, [w, h])

  return (
    <div
      className={`tutor-presence ${className}`}
      style={{ width: isLoading ? w : dot, height: isLoading ? h : dot }}
    >
      {/* Fuzzy resting dot */}
      <div
        className="tutor-fuzzy-dot"
        style={{
          width: dot,
          height: dot,
          opacity: isLoading ? 0 : 1,
          transform: isLoading ? 'scale(0.3)' : 'scale(1)',
        }}
      />

      {/* Spring path — draws in when loading */}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className="tutor-spring-svg"
        style={{ opacity: isLoading ? 1 : 0 }}
        aria-hidden={!isLoading}
      >
        <path
          d={d}
          stroke="var(--sage-300)"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          pathLength="1"
          className={`tutor-spring-line ${isLoading ? 'tutor-spring-active' : ''}`}
        />
      </svg>
    </div>
  )
}
