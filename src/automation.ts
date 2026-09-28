import type { BooleanLane, NumberLane } from './config'

type Lane<T> = readonly (readonly [number, T])[]

/** Index of the last point at or before `time`, or -1 if `time` is before the first point. */
const indexAt = <T>(lane: Lane<T>, time: number): number => {
  let low = 0
  let high = lane.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lane[mid][0] <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/** Value at `time`, interpolated linearly between points. Undefined before the first point. */
export const sampleNumberLane = (lane: NumberLane, time: number): number | undefined => {
  const i = indexAt(lane, time)
  if (i === -1) return undefined
  const [t0, v0] = lane[i]
  const next = lane[i + 1]
  if (!next) return v0
  const [t1, v1] = next
  return v0 + ((v1 - v0) * (time - t0)) / (t1 - t0)
}

/** Value of the last point at or before `time`. Undefined before the first point. */
export const sampleBooleanLane = (lane: BooleanLane, time: number): boolean | undefined => {
  const i = indexAt(lane, time)
  return i === -1 ? undefined : lane[i][1]
}

/**
 * Writes a recorded pass into a lane: existing points inside the time span
 * covered by `points` are replaced, points outside it are kept.
 */
export const overwriteLane = <T>(
  lane: Lane<T> | undefined,
  points: readonly [number, T][],
): [number, T][] => {
  const existing = (lane ?? []) as [number, T][]
  if (points.length === 0) return existing
  const from = points[0][0]
  const to = points[points.length - 1][0]
  return [
    ...existing.filter(([time]) => time < from),
    ...points,
    ...existing.filter(([time]) => time > to),
  ]
}
