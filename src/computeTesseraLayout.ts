import type { LayoutOptions, LayoutRow } from './types'

const BADNESS_POWER = 3

export function computeTesseraLayout(
  items: { aspectRatio: number }[],
  containerWidth: number,
  options: LayoutOptions,
): LayoutRow[] {
  const {
    rowHeight: rowHeightOption,
    gap: gapOption = 0,
    lastRow = 'left',
    minColumns,
    maxNumRows = Infinity,
    maxShrink = 0.75,
    maxStretch = 1.5,
    justifyThreshold = 0.9,
  } = options

  const idealHeight =
    typeof rowHeightOption === 'function' ? rowHeightOption(containerWidth) : rowHeightOption

  const gap =
    typeof gapOption === 'function' ? gapOption(containerWidth) : gapOption

  const n = items.length
  if (n === 0 || containerWidth <= 0) return []

  // minColumns caps idealHeight so that rows of at least N items are viable.
  // This is a soft guarantee — actual item count per row depends on aspect ratios.
  const effectiveIdealHeight =
    minColumns !== undefined
      ? Math.min(idealHeight, (containerWidth - gap * (minColumns - 1)) / minColumns)
      : idealHeight

  const minHeight = effectiveIdealHeight * maxShrink

  // Prefix sums for O(1) aspect ratio range queries
  const prefixAR = new Array<number>(n + 1)
  prefixAR[0] = 0
  for (let i = 0; i < n; i++) {
    prefixAR[i + 1] = prefixAR[i] + items[i].aspectRatio
  }

  // Height a row spanning items[start..end) would occupy at full container width
  function rowHeightFor(start: number, end: number): number {
    const totalAR = prefixAR[end] - prefixAR[start]
    const numGaps = end - start - 1
    return (containerWidth - gap * numGaps) / totalAR
  }

  // Cost of placing a row at a given height — 0 at effectiveIdealHeight, unbounded above.
  // maxStretch controls the steepness of the penalty above idealHeight but is not a hard limit.
  function badness(h: number): number {
    if (h >= effectiveIdealHeight) {
      const range = effectiveIdealHeight * (maxStretch - 1)
      return range === 0 ? Infinity : (h - effectiveIdealHeight) ** BADNESS_POWER / range ** BADNESS_POWER
    }
    const range = effectiveIdealHeight - minHeight
    return range === 0 ? Infinity : (effectiveIdealHeight - h) ** BADNESS_POWER / range ** BADNESS_POWER
  }

  // ─── Knuth-Plass DP ──────────────────────────────────────────────────────────
  //
  // dp[j]   = min cost to place items[0..j) in valid rows
  // pred[j] = start index of the last row in the optimal path to j

  const dp = new Array<number>(n + 1).fill(Infinity)
  const pred = new Array<number>(n + 1).fill(-1)
  dp[0] = 0

  for (let i = 0; i < n; i++) {
    if (dp[i] === Infinity) continue

    // Pano special case: item is so wide that even alone it falls below minHeight.
    // Adding more items only makes the row shorter, so no valid placement exists.
    // Force it as a solo full-width row, exempt from height constraints.
    if (rowHeightFor(i, i + 1) < minHeight) {
      if (dp[i] < dp[i + 1]) {
        dp[i + 1] = dp[i]
        pred[i + 1] = i
      }
      continue
    }

    for (let j = i + 1; j <= n; j++) {
      const h = rowHeightFor(i, j)
      if (h < minHeight) break     // row too compressed — stop
      const cost = dp[i] + badness(h)
      if (cost <= dp[j]) {
        dp[j] = cost
        pred[j] = i
      }
    }
  }

  // ─── Reconstruct break points ────────────────────────────────────────────────
  //
  // If dp[n] is unreachable (no valid path covers all items), fall back:
  // find the last reachable position, then treat remaining items as the last row.

  const breaks: number[] = []

  if (dp[n] < Infinity) {
    let cur = n
    while (cur > 0) {
      breaks.unshift(cur)
      cur = pred[cur]
    }
  } else {
    let last = n - 1
    while (last > 0 && dp[last] === Infinity) last--
    let cur = last
    while (cur > 0) {
      breaks.unshift(cur)
      cur = pred[cur]
    }
    if (last < n) breaks.push(n)
  }

  // ─── Build rows ──────────────────────────────────────────────────────────────

  const rows: LayoutRow[] = []
  let start = 0
  let prevRowHeight = effectiveIdealHeight

  const effectiveBreaks = breaks.slice(0, maxNumRows)

  for (let r = 0; r < effectiveBreaks.length; r++) {
    const end = effectiveBreaks[r]
    const isLastRow = r === effectiveBreaks.length - 1
    const numGaps = end - start - 1
    const totalAR = prefixAR[end] - prefixAR[start]

    let actualHeight: number
    let justify: boolean

    if (isLastRow) {
      if (lastRow === 'hide') {
        start = end
        continue
      }

      // Justify last row if option says so, or if fill ratio meets threshold
      const naturalWidth = totalAR * effectiveIdealHeight + gap * numGaps
      const fillRatio = naturalWidth / containerWidth
      const shouldJustify = lastRow === 'justify' || fillRatio >= justifyThreshold

      if (shouldJustify) {
        actualHeight = rowHeightFor(start, end)
        justify = true
      } else {
        // Match the previous row's height so widows don't visually snap to idealHeight
        actualHeight = prevRowHeight
        justify = false
      }
    } else {
      actualHeight = rowHeightFor(start, end)
      justify = true
    }

    rows.push(buildRow(items, start, end, actualHeight, justify, containerWidth, gap))
    prevRowHeight = actualHeight
    start = end
  }

  return rows
}

// Distribute sub-pixel remainder using the largest-remainder method so that
// integer widths sum exactly to the target total.
function buildRow(
  items: { aspectRatio: number }[],
  start: number,
  end: number,
  height: number,
  justify: boolean,
  containerWidth: number,
  gap: number,
): LayoutRow {
  const count = end - start
  const numGaps = count - 1

  if (!justify) {
    return {
      height,
      items: items.slice(start, end).map(item => ({
        aspectRatio: item.aspectRatio,
        width: item.aspectRatio * height,
        height,
      })),
    }
  }

  const targetTotal = containerWidth - gap * numGaps
  const naturalWidths = items.slice(start, end).map(item => item.aspectRatio * height)
  const rawTotal = naturalWidths.reduce((s, w) => s + w, 0)
  const scale = targetTotal / rawTotal

  const scaled = naturalWidths.map(w => w * scale)
  const floored = scaled.map(Math.floor)
  const remainder = Math.round(targetTotal - floored.reduce((s, w) => s + w, 0))

  // Give the 1px remainder to items with the largest fractional parts
  const order = scaled
    .map((w, i) => ({ i, frac: w - Math.floor(w) }))
    .sort((a, b) => b.frac - a.frac)
  const finalWidths = [...floored]
  for (let k = 0; k < remainder; k++) finalWidths[order[k].i]++

  return {
    height,
    items: items.slice(start, end).map((item, idx) => ({
      aspectRatio: item.aspectRatio,
      width: finalWidths[idx],
      height,
    })),
  }
}
