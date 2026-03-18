'use client'

import { goalBadgeColor } from '@/lib/utils/score-colors'

// Reference dimensions used for the viewBox — the SVG scales to fill its container.
const REF_WIDTH = 300
const REF_HEIGHT = 40
const PAD_X = 4
const PAD_Y_TOP = 6
const PAD_Y_BOTTOM = 6

interface ScoreProgressionChartProps {
  scores: number[]
  /** Kept for backwards-compat but ignored — chart fills its container width. */
  width?: number
  /** Kept for backwards-compat but ignored. */
  height?: number
}

export function ScoreProgressionChart({ scores }: ScoreProgressionChartProps) {
  if (!scores || scores.length === 0) return null

  if (scores.length === 1) {
    return (
      <span
        className="inline-block text-xs font-semibold rounded-full px-2 py-0.5"
        style={{ backgroundColor: goalBadgeColor(scores[0]) }}
      >
        {Math.round(scores[0] * 100)}%
      </span>
    )
  }

  const w = REF_WIDTH - PAD_X * 2
  const h = REF_HEIGHT - PAD_Y_TOP - PAD_Y_BOTTOM

  const points = scores.map((s, i) => {
    const x = PAD_X + (i / (scores.length - 1)) * w
    const y = PAD_Y_TOP + (1 - s) * h
    return `${x},${y}`
  })

  const finalScore = scores[scores.length - 1]

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${REF_WIDTH} ${REF_HEIGHT}`}
      aria-label={`Score progression ending at ${Math.round(finalScore * 100)}%`}
    >
      {/* Baseline */}
      <line
        x1={PAD_X}
        y1={PAD_Y_TOP + h}
        x2={PAD_X + w}
        y2={PAD_Y_TOP + h}
        stroke="currentColor"
        strokeOpacity="0.1"
        strokeWidth="1"
      />
      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={goalBadgeColor(finalScore)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {scores.map((s, i) => {
        const x = PAD_X + (i / (scores.length - 1)) * w
        const y = PAD_Y_TOP + (1 - s) * h
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === scores.length - 1 ? 3 : 2}
            fill={goalBadgeColor(s)}
          />
        )
      })}
    </svg>
  )
}
