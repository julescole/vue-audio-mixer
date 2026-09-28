import { GAIN_MAX } from './config'

/** Fader travel (0 to 1) at which gain is unity, as on a hardware console. */
const UNITY_POSITION = 0.75

// Power curve through (0, 0), (UNITY_POSITION, 1) and (1, GAIN_MAX), giving
// finer control near unity than a linear fader
const EXPONENT = Math.log(1 / GAIN_MAX) / Math.log(UNITY_POSITION)

export const faderToGain = (position: number): number =>
  GAIN_MAX * Math.pow(Math.min(Math.max(position, 0), 1), EXPONENT)

export const gainToFader = (gain: number): number =>
  Math.pow(Math.min(Math.max(gain, 0), GAIN_MAX) / GAIN_MAX, 1 / EXPONENT)
