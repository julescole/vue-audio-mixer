/** Highest gain a fader can reach (+12 dB, about 3.98). 1 is unity. */
export const GAIN_MAX = 10 ** (12 / 20)

export type AudioSource = string | Blob | AudioBuffer

/** Automation points as `[seconds, value]`, sorted by time. */
export type NumberLane = [time: number, value: number][]
export type BooleanLane = [time: number, value: boolean][]

export interface TrackAutomation {
  gain?: NumberLane
  pan?: NumberLane
  reverb?: NumberLane
  muted?: BooleanLane
  soloed?: BooleanLane
}

export type MasterAutomation = Pick<TrackAutomation, 'gain' | 'pan' | 'muted'>

export interface TrackConfig {
  /** Unique, stable identifier used for keying and diffing. */
  id: string
  /** URL, uploaded file or pre-decoded audio. */
  src: AudioSource
  /** Display label. Defaults to `id`. */
  name?: string
  /** Linear gain, 0 to GAIN_MAX (+12 dB). 1 is unity. Default 1. */
  gain?: number
  /** -1 (left) to 1 (right). Default 0. */
  pan?: number
  muted?: boolean
  soloed?: boolean
  /** Plays, but has no channel strip and is unaffected by solo. */
  hidden?: boolean
  /** Send level to the shared reverb bus, 0 to 1. Default 0. */
  reverb?: number
  automation?: TrackAutomation
}

export interface MasterConfig {
  gain?: number
  pan?: number
  muted?: boolean
  automation?: MasterAutomation
}

export interface MixerConfig {
  version?: 2
  tracks: TrackConfig[]
  master?: MasterConfig
}

/** A config with every default filled in. This is what the mixer emits. */
export type ResolvedTrack = Required<TrackConfig>
export type ResolvedMaster = Required<MasterConfig>
export interface ResolvedMixerConfig {
  version: 2
  tracks: ResolvedTrack[]
  master: ResolvedMaster
}

export interface NormalizeResult {
  config: ResolvedMixerConfig
  /** Human-readable descriptions of anything that was invalid and how it was handled. */
  issues: string[]
}

type Range = readonly [min: number, max: number]

const RANGES = {
  gain: [0, GAIN_MAX],
  pan: [-1, 1],
  reverb: [0, 1],
} as const satisfies Record<string, Range>

const LANES = {
  gain: RANGES.gain,
  pan: RANGES.pan,
  reverb: RANGES.reverb,
  muted: 'boolean',
  soloed: 'boolean',
} as const satisfies Record<keyof TrackAutomation, Range | 'boolean'>

const TRACK_LANES = ['gain', 'pan', 'reverb', 'muted', 'soloed'] as const
const MASTER_LANES = ['gain', 'pan', 'muted'] as const

const isAudioBuffer = (value: unknown): value is AudioBuffer =>
  typeof AudioBuffer !== 'undefined' && value instanceof AudioBuffer

const isAudioSource = (value: unknown): value is AudioSource =>
  (typeof value === 'string' && value !== '') ||
  (typeof Blob !== 'undefined' && value instanceof Blob) ||
  isAudioBuffer(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const clamp = (value: number, [min, max]: Range) => Math.min(max, Math.max(min, value))

// Keeps messages readable when a range limit is irrational, e.g. GAIN_MAX
const formatLimit = (value: number) => String(Number(value.toFixed(2)))
const formatRange = ([min, max]: Range) => `${formatLimit(min)} to ${formatLimit(max)}`

const readNumber = (
  value: unknown,
  fallback: number,
  range: Range,
  path: string,
  issues: string[],
): number => {
  if (value === undefined) return fallback
  if (!isFiniteNumber(value)) {
    issues.push(`${path} must be a number; using ${fallback}`)
    return fallback
  }
  const clamped = clamp(value, range)
  if (clamped !== value) issues.push(`${path} is outside ${formatRange(range)}; clamped to ${formatLimit(clamped)}`)
  return clamped
}

const readBoolean = (value: unknown, fallback: boolean, path: string, issues: string[]): boolean => {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    issues.push(`${path} must be a boolean; using ${fallback}`)
    return fallback
  }
  return value
}

const isValidPoint = (point: unknown, kind: Range | 'boolean'): point is [number, number | boolean] =>
  Array.isArray(point) &&
  point.length === 2 &&
  isFiniteNumber(point[0]) &&
  point[0] >= 0 &&
  (kind === 'boolean'
    ? typeof point[1] === 'boolean'
    : isFiniteNumber(point[1]) && point[1] >= kind[0] && point[1] <= kind[1])

/**
 * Returns the lane unchanged when it is already valid, so repeated normalization
 * of a large recorded lane costs one pass and no allocation.
 */
const readLane = (
  lane: unknown,
  kind: Range | 'boolean',
  path: string,
  issues: string[],
): [number, number | boolean][] | undefined => {
  if (!Array.isArray(lane)) {
    issues.push(`${path} must be an array of [seconds, value] points; lane ignored`)
    return undefined
  }

  let previous = -Infinity
  const alreadyValid = lane.every((point) => {
    const ok = isValidPoint(point, kind) && point[0] >= previous
    if (ok) previous = point[0]
    return ok
  })
  if (alreadyValid) return lane

  const points: [number, number | boolean][] = []
  lane.forEach((point: unknown, i) => {
    const pointPath = `${path}[${i}]`
    if (!Array.isArray(point) || point.length !== 2 || !isFiniteNumber(point[0]) || point[0] < 0) {
      issues.push(`${pointPath} must be [seconds >= 0, value]; point dropped`)
    } else if (kind === 'boolean') {
      if (typeof point[1] === 'boolean') points.push([point[0], point[1]])
      else issues.push(`${pointPath} value must be a boolean; point dropped`)
    } else if (!isFiniteNumber(point[1])) {
      issues.push(`${pointPath} value must be a number; point dropped`)
    } else {
      const clamped = clamp(point[1], kind)
      if (clamped !== point[1]) issues.push(`${pointPath} value is outside ${formatRange(kind)}; clamped`)
      points.push([point[0], clamped])
    }
  })

  const isSorted = points.every((point, i) => i === 0 || points[i - 1][0] <= point[0])
  if (!isSorted) {
    issues.push(`${path} points were not in time order; sorted`)
    points.sort((a, b) => a[0] - b[0])
  }
  return points
}

const readAutomation = <K extends keyof TrackAutomation>(
  automation: unknown,
  allowed: readonly K[],
  path: string,
  issues: string[],
): Pick<TrackAutomation, K> => {
  const result: Record<string, unknown> = {}
  if (automation === undefined) return result as Pick<TrackAutomation, K>
  if (typeof automation !== 'object' || automation === null || Array.isArray(automation)) {
    issues.push(`${path} must be an object; ignored`)
    return result as Pick<TrackAutomation, K>
  }

  for (const [name, lane] of Object.entries(automation)) {
    if (!(allowed as readonly string[]).includes(name)) {
      issues.push(`${path}.${name} is not an automatable parameter; ignored`)
      continue
    }
    const read = readLane(lane, LANES[name as K], `${path}.${name}`, issues)
    if (read) result[name] = read
  }
  return result as Pick<TrackAutomation, K>
}

/**
 * Validates a config and fills in defaults. Never throws: invalid values are
 * replaced or clamped, invalid tracks are skipped, and each fix is reported in `issues`.
 */
export function normalizeConfig(input: MixerConfig): NormalizeResult {
  const issues: string[] = []
  const raw: Partial<MixerConfig> = typeof input === 'object' && input !== null ? input : {}

  if (raw.version !== undefined && raw.version !== 2) {
    issues.push(`version ${String(raw.version)} is not supported; reading it as version 2`)
  }

  if (!Array.isArray(raw.tracks)) issues.push('tracks must be an array')
  const rawTracks: unknown[] = Array.isArray(raw.tracks) ? raw.tracks : []

  const seen = new Set<string>()
  const tracks: ResolvedTrack[] = []

  rawTracks.forEach((value, i) => {
    const path = `tracks[${i}]`
    if (typeof value !== 'object' || value === null) {
      issues.push(`${path} must be an object; track skipped`)
      return
    }
    const track = value as Partial<TrackConfig>

    if (typeof track.id !== 'string' || track.id === '') {
      issues.push(`${path}.id must be a non-empty string; track skipped`)
      return
    }
    if (seen.has(track.id)) {
      issues.push(`${path}.id "${track.id}" is already used by another track; track skipped`)
      return
    }
    if (!isAudioSource(track.src)) {
      issues.push(`${path}.src must be a URL, Blob or AudioBuffer; track skipped`)
      return
    }
    seen.add(track.id)

    let name = track.id
    if (typeof track.name === 'string') name = track.name
    else if (track.name !== undefined) issues.push(`${path}.name must be a string; using the id`)

    tracks.push({
      id: track.id,
      src: track.src,
      name,
      gain: readNumber(track.gain, 1, RANGES.gain, `${path}.gain`, issues),
      pan: readNumber(track.pan, 0, RANGES.pan, `${path}.pan`, issues),
      muted: readBoolean(track.muted, false, `${path}.muted`, issues),
      soloed: readBoolean(track.soloed, false, `${path}.soloed`, issues),
      hidden: readBoolean(track.hidden, false, `${path}.hidden`, issues),
      reverb: readNumber(track.reverb, 0, RANGES.reverb, `${path}.reverb`, issues),
      automation: readAutomation(track.automation, TRACK_LANES, `${path}.automation`, issues),
    })
  })

  let rawMaster: Partial<MasterConfig> = {}
  if (typeof raw.master === 'object' && raw.master !== null) rawMaster = raw.master
  else if (raw.master !== undefined) issues.push('master must be an object; using defaults')

  const master: ResolvedMaster = {
    gain: readNumber(rawMaster.gain, 1, RANGES.gain, 'master.gain', issues),
    pan: readNumber(rawMaster.pan, 0, RANGES.pan, 'master.pan', issues),
    muted: readBoolean(rawMaster.muted, false, 'master.muted', issues),
    automation: readAutomation(rawMaster.automation, MASTER_LANES, 'master.automation', issues),
  }

  return { config: { version: 2, tracks, master }, issues }
}
