// Smooth HSL gradient for score-based colors:
// 0% = red, 25% = red, 50% = orange, 75% = yellow-green, 100% = green
export function goalBadgeColor(score: number): string {
  const stops = [
    { pct: 0,   h: 0,   s: 72, l: 71 },
    { pct: 25,  h: 0,   s: 72, l: 71 },
    { pct: 50,  h: 30,  s: 90, l: 76 },
    { pct: 75,  h: 55,  s: 70, l: 74 },
    { pct: 100, h: 130, s: 60, l: 74 },
  ]

  const pct = Math.max(0, Math.min(100, score * 100))

  if (pct <= stops[0].pct) return `hsl(${stops[0].h}, ${stops[0].s}%, ${stops[0].l}%)`
  const last = stops[stops.length - 1]
  if (pct >= last.pct) return `hsl(${last.h}, ${last.s}%, ${last.l}%)`

  let lo = stops[0]
  let hi = stops[1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (pct >= stops[i].pct && pct <= stops[i + 1].pct) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }

  const t = (pct - lo.pct) / (hi.pct - lo.pct)
  const h = Math.round(lo.h + t * (hi.h - lo.h))
  const s = Math.round(lo.s + t * (hi.s - lo.s))
  const l = Math.round(lo.l + t * (hi.l - lo.l))
  return `hsl(${h}, ${s}%, ${l}%)`
}
