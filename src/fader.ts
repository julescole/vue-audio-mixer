import { GAIN_MAX } from './config'

/**
 * Fader scale in dB from the top of travel to the bottom, with the marks evenly
 * spaced. Below the last mark the fader reaches silence at the very bottom.
 */
export const FADER_SCALE = [12, 6, 0, -6, -12, -18, -24, -36, -48, -60] as const

const SEGMENTS = FADER_SCALE.length - 1

export const gainToDb = (gain: number): number => (gain > 0 ? 20 * Math.log10(gain) : -Infinity)

export const dbToGain = (db: number): number => (db === -Infinity ? 0 : 10 ** (db / 20))

/** dB at a fader position, where 0 is the top of travel and 1 the bottom. */
export const positionToDb = (position: number): number => {
  if (position >= 1) return -Infinity
  const scaled = Math.max(position, 0) * SEGMENTS
  const i = Math.floor(scaled)
  return FADER_SCALE[i] + (FADER_SCALE[i + 1] - FADER_SCALE[i]) * (scaled - i)
}

/** Fader position for a dB value: 0 at the top of travel, 1 at the bottom. */
export const dbToPosition = (db: number): number => {
  if (db >= FADER_SCALE[0]) return 0
  if (db <= FADER_SCALE[SEGMENTS]) return 1
  for (let i = 0; i < SEGMENTS; i++) {
    const [upper, lower] = [FADER_SCALE[i], FADER_SCALE[i + 1]]
    if (db <= upper && db >= lower) return (i + (upper - db) / (upper - lower)) / SEGMENTS
  }
  return 1
}

export const positionToGain = (position: number): number =>
  Math.min(dbToGain(positionToDb(position)), GAIN_MAX)

export const gainToPosition = (gain: number): number => dbToPosition(gainToDb(gain))

/** "+3.0", "0.0", "−6.5" or "−∞", using a true minus sign. */
export const formatDb = (db: number): string => {
  if (db === -Infinity) return '−∞'
  const sign = db > 0.05 ? '+' : db < -0.05 ? '−' : ''
  return sign + Math.abs(db).toFixed(1)
}
