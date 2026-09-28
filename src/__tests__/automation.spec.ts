import { describe, expect, it } from 'vitest'
import { overwriteLane, sampleBooleanLane, sampleNumberLane } from '../automation'
import type { BooleanLane, NumberLane } from '../config'

describe('sampleNumberLane', () => {
  const lane: NumberLane = [
    [1, 0],
    [3, 1],
    [4, 0.5],
  ]

  it('is undefined before the first point', () => {
    expect(sampleNumberLane(lane, 0.5)).toBeUndefined()
    expect(sampleNumberLane([], 1)).toBeUndefined()
  })

  it('interpolates between points', () => {
    expect(sampleNumberLane(lane, 1)).toBe(0)
    expect(sampleNumberLane(lane, 2)).toBe(0.5)
    expect(sampleNumberLane(lane, 3.5)).toBe(0.75)
  })

  it('holds the last value after the last point', () => {
    expect(sampleNumberLane(lane, 10)).toBe(0.5)
  })

  it('jumps at points that share a time', () => {
    const step: NumberLane = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ]
    expect(sampleNumberLane(step, 1)).toBe(1)
    expect(sampleNumberLane(step, 0.999)).toBeCloseTo(0)
  })
})

describe('sampleBooleanLane', () => {
  const lane: BooleanLane = [
    [1, true],
    [2, false],
  ]

  it('steps between points', () => {
    expect(sampleBooleanLane(lane, 0)).toBeUndefined()
    expect(sampleBooleanLane(lane, 1.5)).toBe(true)
    expect(sampleBooleanLane(lane, 2)).toBe(false)
  })
})

describe('overwriteLane', () => {
  it('creates a lane when there is none', () => {
    expect(overwriteLane(undefined, [[1, 0.5]])).toEqual([[1, 0.5]])
  })

  it('replaces only the span covered by the new points', () => {
    const lane: NumberLane = [
      [0, 1],
      [2, 1],
      [3, 1],
      [5, 1],
    ]
    expect(
      overwriteLane(lane, [
        [1, 0],
        [4, 0],
      ]),
    ).toEqual([
      [0, 1],
      [1, 0],
      [4, 0],
      [5, 1],
    ])
  })

  it('leaves the lane alone when nothing was recorded', () => {
    const lane: NumberLane = [[0, 1]]
    expect(overwriteLane(lane, [])).toBe(lane)
  })
})
