import { describe, expect, it } from 'vitest'
import { computeAudible } from '../mix'
import { audibilityChanges } from '../render'
import { normalizeConfig } from '../config'

const track = (id: string, props: { muted?: boolean; soloed?: boolean; hidden?: boolean } = {}) => ({
  id,
  hidden: false,
  muted: false,
  soloed: false,
  ...props,
})

describe('computeAudible', () => {
  it('plays everything that is not muted when nothing is soloed', () => {
    expect(computeAudible([track('a'), track('b', { muted: true })])).toEqual({ a: true, b: false })
  })

  it('plays only soloed tracks while a solo is active', () => {
    expect(computeAudible([track('a', { soloed: true }), track('b'), track('c')])).toEqual({
      a: true,
      b: false,
      c: false,
    })
  })

  it('lets mute win over solo', () => {
    expect(computeAudible([track('a', { soloed: true, muted: true }), track('b')])).toEqual({
      a: false,
      b: false,
    })
  })

  it('leaves hidden tracks playing during a solo, but still honours their mute', () => {
    expect(
      computeAudible([
        track('a', { soloed: true }),
        track('click', { hidden: true }),
        track('guide', { hidden: true, muted: true }),
      ]),
    ).toEqual({ a: true, click: true, guide: false })
  })

  it('ignores solo on hidden tracks', () => {
    expect(computeAudible([track('a'), track('click', { hidden: true, soloed: true })])).toEqual({
      a: true,
      click: true,
    })
  })
})

describe('audibilityChanges', () => {
  it('lists who is audible at the start and at every mute or solo point', () => {
    const { config } = normalizeConfig({
      tracks: [
        { id: 'a', src: '/a.mp3', automation: { soloed: [[2, true], [4, false]] } },
        { id: 'b', src: '/b.mp3', muted: true, automation: { muted: [[3, false]] } },
      ],
    })

    expect(audibilityChanges(config.tracks)).toEqual([
      { time: 0, audible: { a: true, b: false } },
      { time: 2, audible: { a: true, b: false } },
      { time: 3, audible: { a: true, b: false } },
      { time: 4, audible: { a: true, b: true } },
    ])
  })
})
