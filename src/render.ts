import { sampleBooleanLane } from './automation'
import type { BooleanLane, NumberLane, ResolvedMixerConfig, ResolvedTrack } from './config'
import { computeAudible } from './mix'

export interface RenderOptions {
  config: ResolvedMixerConfig
  /** Decoded audio per track id. Tracks without a buffer are left out. */
  buffers: Record<string, AudioBuffer>
  /** Impulse response for the reverb bus, or null to render without reverb. */
  impulse: AudioBuffer | null
  sampleRate: number
}

export interface AudibilityChange {
  time: number
  audible: Record<string, boolean>
}

const booleanAt = (lane: BooleanLane | undefined, fallback: boolean, time: number) =>
  (lane && sampleBooleanLane(lane, time)) ?? fallback

/**
 * Every moment the set of audible tracks can change, with who is audible from then on.
 * Mute and solo interact across tracks, so this is worked out for all tracks together.
 */
export const audibilityChanges = (tracks: readonly ResolvedTrack[]): AudibilityChange[] => {
  const times = new Set<number>([0])
  for (const { automation } of tracks) {
    for (const [time] of automation.muted ?? []) times.add(time)
    for (const [time] of automation.soloed ?? []) times.add(time)
  }

  return [...times]
    .sort((a, b) => a - b)
    .map((time) => ({
      time,
      audible: computeAudible(
        tracks.map((track) => ({
          id: track.id,
          hidden: track.hidden,
          muted: booleanAt(track.automation.muted, track.muted, time),
          soloed: booleanAt(track.automation.soloed, track.soloed, time),
        })),
      ),
    }))
}

/** Static value until the first point, a jump to it, then linear ramps, as in live playback. */
const scheduleNumber = (param: AudioParam, value: number, lane: NumberLane | undefined) => {
  param.setValueAtTime(value, 0)
  lane?.forEach(([time, point], i) => {
    if (i === 0) param.setValueAtTime(point, time)
    else param.linearRampToValueAtTime(point, time)
  })
}

const scheduleGate = (param: AudioParam, open: boolean, lane: BooleanLane | undefined) => {
  param.setValueAtTime(open ? 1 : 0, 0)
  for (const [time, closed] of lane ?? []) param.setValueAtTime(closed ? 0 : 1, time)
}

const usesReverb = (tracks: readonly ResolvedTrack[]) =>
  tracks.some((track) => track.reverb > 0 || track.automation.reverb?.some(([, level]) => level > 0))

/**
 * Renders the mix, automation included, faster than real time. Uses the same
 * signal chain as live playback, with a level node and a mute/solo gate in series
 * so gain automation and mute/solo automation can be scheduled independently.
 */
export const renderMix = ({ config, buffers, impulse, sampleRate }: RenderOptions): Promise<AudioBuffer> => {
  const tracks = config.tracks.filter((track) => buffers[track.id])
  const duration = tracks.reduce((longest, track) => Math.max(longest, buffers[track.id].duration), 0)
  const reverb = impulse && usesReverb(tracks) ? impulse : null
  const tail = reverb ? reverb.duration : 0 // let the reverb ring out
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil((duration + tail) * sampleRate)), sampleRate)

  const { master } = config
  const masterLevel = context.createGain()
  const masterGate = context.createGain()
  const masterPan = context.createStereoPanner()
  masterLevel.connect(masterGate).connect(masterPan).connect(context.destination)
  scheduleNumber(masterLevel.gain, master.gain, master.automation.gain)
  scheduleGate(masterGate.gain, !master.muted, master.automation.muted)
  scheduleNumber(masterPan.pan, master.pan, master.automation.pan)

  let reverbBus: ConvolverNode | null = null
  if (reverb) {
    reverbBus = context.createConvolver()
    reverbBus.buffer = reverb
    reverbBus.connect(masterLevel)
  }

  const gates: Record<string, GainNode> = {}
  for (const track of tracks) {
    const source = context.createBufferSource()
    const level = context.createGain()
    const gate = context.createGain()
    const pan = context.createStereoPanner()

    source.buffer = buffers[track.id]
    source.connect(level).connect(gate).connect(pan).connect(masterLevel)
    scheduleNumber(level.gain, track.gain, track.automation.gain)
    scheduleNumber(pan.pan, track.pan, track.automation.pan)

    if (reverbBus) {
      const send = context.createGain()
      pan.connect(send).connect(reverbBus)
      scheduleNumber(send.gain, track.reverb, track.automation.reverb)
    }

    gates[track.id] = gate
    source.start(0)
  }

  for (const { time, audible } of audibilityChanges(tracks)) {
    for (const track of tracks) gates[track.id].gain.setValueAtTime(audible[track.id] ? 1 : 0, time)
  }

  return context.startRendering()
}
