import { describe, expect, it } from 'vitest'
import { GAIN_MAX } from '../config'
import {
  dbToGain,
  dbToPosition,
  formatDb,
  gainToDb,
  gainToPosition,
  positionToDb,
  positionToGain,
} from '../fader'

describe('fader scale', () => {
  it('puts each scale mark at an even step down the fader', () => {
    expect(positionToDb(0)).toBe(12)
    expect(positionToDb(2 / 9)).toBeCloseTo(0)
    expect(positionToDb(7 / 9)).toBeCloseTo(-36)
    expect(positionToDb(1)).toBe(-Infinity)
  })

  it('interpolates between marks', () => {
    expect(positionToDb(2.5 / 9)).toBeCloseTo(-3)
    expect(positionToDb(6.5 / 9)).toBeCloseTo(-30)
  })

  it('maps dB back to the same position', () => {
    for (const db of [12, 7.5, 0, -3, -20, -30, -59]) {
      expect(positionToDb(dbToPosition(db))).toBeCloseTo(db)
    }
  })

  it('clamps outside the scale', () => {
    expect(dbToPosition(20)).toBe(0)
    expect(dbToPosition(-80)).toBe(1)
    expect(dbToPosition(-Infinity)).toBe(1)
    expect(positionToDb(-0.5)).toBe(12)
  })

  it('converts between fader position and gain', () => {
    expect(positionToGain(2 / 9)).toBeCloseTo(1)
    expect(positionToGain(0)).toBeCloseTo(GAIN_MAX)
    expect(positionToGain(1)).toBe(0)
    expect(gainToPosition(1)).toBeCloseTo(2 / 9)
    expect(gainToPosition(0)).toBe(1)
  })
})

describe('dB conversion', () => {
  it('converts gain to dB and back', () => {
    expect(gainToDb(1)).toBe(0)
    expect(gainToDb(0)).toBe(-Infinity)
    expect(dbToGain(gainToDb(0.5))).toBeCloseTo(0.5)
    expect(dbToGain(-Infinity)).toBe(0)
  })

  it('formats with a sign and one decimal', () => {
    expect(formatDb(0)).toBe('0.0')
    expect(formatDb(0.04)).toBe('0.0')
    expect(formatDb(3)).toBe('+3.0')
    expect(formatDb(-6.54)).toBe('−6.5')
    expect(formatDb(-Infinity)).toBe('−∞')
  })
})
