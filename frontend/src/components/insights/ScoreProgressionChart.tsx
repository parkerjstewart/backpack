'use client'

import { goalBadgeColor } from '@/lib/utils/score-colors'

interface ScoreProgressionChartProps {
  scores: number[]
  width?: number
  height?: number
}

export function ScoreProgressionChart({
  scores,
  width = 120,
  height = 32,
}: ScoreProgressionChartProps) {
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

  const padX = 4
  const padY = 4
  const w = width - padX * 2
  const h = height - padY * 2

  const points = scores.map((s, i) => {
    const x = padX + (i / (scores.length - 1)) * w
    const y = padY + (1 - s) * h
    return `${x},${y}`
  })

  const finalScore = scores[scores.length - 1]
  const lastX = padX + w
  const lastY = padY + (1 - finalScore) * h

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`Score progression ending at ${Math.round(finalScore * 100)}%`}
    >
      {/* Baseline */}
      <line
        x1={padX}
        y1={padY + h}
        x2={padX + w}
        y2={padY + h}
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
        const x = padX + (i / (scores.length - 1)) * w
        const y = padY + (1 - s) * h
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
      {/* Final score label */}
      <text
        x={lastX - 2}
        y={lastY - 5}
        fontSize="8"
        fill="currentColor"
        fillOpacity="0.7"
        textAnchor="end"
      >
        {Math.round(finalScore * 100)}%
      </text>
    </svg>
  )
}
