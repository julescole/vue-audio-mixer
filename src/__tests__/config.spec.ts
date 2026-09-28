import { describe, expect, it } from 'vitest'
import { GAIN_MAX, normalizeConfig, type MixerConfig, type NumberLane } from '../config'

describe('normalizeConfig', () => {
  it('fills in every default for a minimal config', () => {
    const { config, issues } = normalizeConfig({ tracks: [{ id: 'bass', src: '/bass.mp3' }] })

    expect(issues).toEqual([])
    expect(config).toEqual({
      version: 2,
      tracks: [
        {
          id: 'bass',
          src: '/bass.mp3',
          name: 'bass',
          gain: 1,
          pan: 0,
          muted: false,
          soloed: false,
          hidden: false,
          reverb: 0,
          automation: {},
        },
      ],
      master: { gain: 1, pan: 0, muted: false, automation: {} },
    })
  })

  it('keeps provided values', () => {
    const { config, issues } = normalizeConfig({
      tracks: [
        {
          id: 'piano',
          src: '/piano.mp3',
          name: 'Piano',
          gain: 1.5,
          pan: -0.5,
          muted: true,
          soloed: true,
          hidden: true,
          reverb: 0.25,
        },
      ],
      master: { gain: 0.8, pan: 0.1, muted: true },
    })

    expect(issues).toEqual([])
    expect(config.tracks[0]).toMatchObject({
      name: 'Piano',
      gain: 1.5,
      pan: -0.5,
      muted: true,
      soloed: true,
      hidden: true,
      reverb: 0.25,
    })
    expect(config.master).toMatchObject({ gain: 0.8, pan: 0.1, muted: true })
  })

  it('accepts Blob sources', () => {
    const blob = new Blob(['audio'])
    const { config, issues } = normalizeConfig({ tracks: [{ id: 'upload', src: blob }] })

    expect(issues).toEqual([])
    expect(config.tracks[0].src).toBe(blob)
  })

  it('clamps out-of-range numbers and reports them', () => {
    const { config, issues } = normalizeConfig({
      tracks: [{ id: 'a', src: '/a.mp3', gain: 5, pan: -3, reverb: 2 }],
      master: { gain: -1 },
    })

    expect(config.tracks[0]).toMatchObject({ gain: GAIN_MAX, pan: -1, reverb: 1 })
    expect(config.master.gain).toBe(0)
    expect(issues).toHaveLength(4)
    expect(issues[0]).toBe('tracks[0].gain is outside 0 to 3.98; clamped to 3.98')
  })

  it('replaces wrongly typed values with defaults', () => {
    const { config, issues } = normalizeConfig({
      tracks: [{ id: 'a', src: '/a.mp3', gain: '0.5', muted: 'yes', name: 3 }],
    } as unknown as MixerConfig)

    expect(config.tracks[0]).toMatchObject({ gain: 1, muted: false, name: 'a' })
    expect(issues).toHaveLength(3)
  })

  it('skips tracks with a missing id, duplicate id or missing src', () => {
    const { config, issues } = normalizeConfig({
      tracks: [
        { id: 'a', src: '/a.mp3' },
        { id: 'a', src: '/other.mp3' },
        { id: '', src: '/b.mp3' },
        { id: 'c' },
        null,
      ],
    } as unknown as MixerConfig)

    expect(config.tracks.map((track) => track.src)).toEqual(['/a.mp3'])
    expect(issues).toHaveLength(4)
    expect(issues[0]).toContain('already used')
  })

  it('handles a config that is not an object', () => {
    const { config, issues } = normalizeConfig(null as unknown as MixerConfig)

    expect(config.tracks).toEqual([])
    expect(issues).toEqual(['tracks must be an array'])
  })

  it('reports an unsupported version', () => {
    const { issues } = normalizeConfig({ version: 1, tracks: [] } as unknown as MixerConfig)

    expect(issues[0]).toContain('version 1')
  })

  describe('automation', () => {
    it('returns a valid lane unchanged, without copying it', () => {
      const gain: NumberLane = [
        [0, 1],
        [1.5, 0.5],
        [1.5, 0.6],
      ]
      const { config, issues } = normalizeConfig({
        tracks: [{ id: 'a', src: '/a.mp3', automation: { gain } }],
      })

      expect(issues).toEqual([])
      expect(config.tracks[0].automation.gain).toBe(gain)
    })

    it('sorts, clamps and drops invalid points', () => {
      const { config, issues } = normalizeConfig({
        tracks: [
          {
            id: 'a',
            src: '/a.mp3',
            automation: {
              pan: [
                [2, 0.5],
                [1, 4],
                [-1, 0],
                [3, 'left'],
              ],
              muted: [[0, 1]],
            },
          },
        ],
      } as unknown as MixerConfig)

      expect(config.tracks[0].automation.pan).toEqual([
        [1, 1],
        [2, 0.5],
      ])
      expect(config.tracks[0].automation.muted).toEqual([])
      expect(issues).toHaveLength(5)
    })

    it('ignores parameters that cannot be automated', () => {
      const { config, issues } = normalizeConfig({
        tracks: [],
        master: { automation: { soloed: [[0, true]] } },
      } as unknown as MixerConfig)

      expect(config.master.automation).toEqual({})
      expect(issues[0]).toContain('master.automation.soloed')
    })
  })
})
