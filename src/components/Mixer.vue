<script setup lang="ts">
import { ref, shallowRef, reactive, computed, watch, watchEffect, onUnmounted, toRaw } from 'vue'

import Transport from './Transport.vue'
import MixerChannel from './MixerChannel.vue'
import Loader from './Loader.vue'
import hallWavPath from '../assets/audio/Hall.wav'
import {
  normalizeConfig,
  type AudioSource,
  type MasterAutomation,
  type MixerConfig,
  type ResolvedMixerConfig,
  type ResolvedTrack,
  type TrackAutomation,
} from '../config'
import { overwriteLane, sampleBooleanLane, sampleNumberLane } from '../automation'
import { computeAudible } from '../mix'
import { renderMix as renderOffline } from '../render'
import { encodeWav } from '../wav'

const props = withDefaults(
  defineProps<{
    config: MixerConfig
    /** "small" uses the compact layout at every screen width. */
    size?: 'small' | 'medium'
    /** Built-in colour scheme. Any --vam-* variable can also be overridden on .vue-audio-mixer. */
    theme?: 'dark' | 'light'
    showPan?: boolean
    showTotalTime?: boolean
    /** Heading shown above the channels. */
    title?: string
  }>(),
  {
    size: 'medium',
    theme: 'dark',
    showPan: true,
    showTotalTime: true,
  },
)

const emit = defineEmits<{
  'update:config': [config: ResolvedMixerConfig]
  loaded: []
  'load-error': [event: { trackId: string; error: unknown }]
}>()

type TrackParam = keyof TrackAutomation
type MasterParam = keyof MasterAutomation
type ParamValue<P extends TrackParam> = P extends 'muted' | 'soloed' ? boolean : number

interface ChannelParams {
  gain: number
  pan: number
  reverb: number
  muted: boolean
  soloed: boolean
  /** Whether the track is heard, once mute and solo are taken into account. */
  audible: boolean
}

interface MasterParams {
  gain: number
  pan: number
  muted: boolean
}

// Master bus: gain -> pan -> speakers, with a stereo split feeding the meters

const context = new AudioContext()

const masterGain = context.createGain()
const masterPan = context.createStereoPanner()
const masterSplitter = context.createChannelSplitter(2)
const masterAnalysers = { left: context.createAnalyser(), right: context.createAnalyser() }

// Peak meters read a frame's worth of samples (about 43 ms at 48 kHz) so short peaks aren't missed
const METER_WINDOW = 2048

masterAnalysers.left.fftSize = METER_WINDOW
masterAnalysers.right.fftSize = METER_WINDOW

masterGain.connect(masterPan)
masterPan.connect(masterSplitter)
masterSplitter.connect(masterAnalysers.left, 0)
masterSplitter.connect(masterAnalysers.right, 1)
masterPan.connect(context.destination)

// One reverb shared by every track. Each track feeds it through its own send gain.
const reverbBus = context.createConvolver()
reverbBus.connect(masterGain)
let impulse: AudioBuffer | null = null

class LoadError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

const loadAudio = async (src: AudioSource): Promise<AudioBuffer> => {
  if (src instanceof AudioBuffer) return src

  let data: ArrayBuffer
  if (typeof src === 'string') {
    let response: Response
    try {
      response = await fetch(src)
    } catch (error) {
      // fetch only rejects on network failures, which includes a missing CORS header
      throw new LoadError(
        "couldn't be downloaded. If it's hosted on another domain, that server must allow cross-origin requests (CORS).",
        error,
      )
    }
    if (!response.ok) throw new LoadError(`couldn't be downloaded: the server responded ${response.status}.`)
    // Many hosts answer unknown paths with their HTML page and a 200 status
    if (response.headers.get('content-type')?.startsWith('text/html')) {
      throw new LoadError("couldn't be found: the server returned a web page instead of audio.")
    }
    data = await response.arrayBuffer()
  } else {
    data = await src.arrayBuffer()
  }

  try {
    return await context.decodeAudioData(data)
  } catch (error) {
    throw new LoadError("isn't in an audio format this browser can play.", error)
  }
}

loadAudio(hallWavPath)
  .then((buffer) => {
    impulse = buffer
    reverbBus.buffer = buffer
  })
  .catch((error) => console.error('[vue-audio-mixer] Failed to load reverb impulse response:', error))

// Channels: source -> gain -> pan -> master, with pan also feeding the reverb send and the meters

interface Channel {
  src: AudioSource
  buffer: AudioBuffer | null
  source: AudioBufferSourceNode | null
  gain: GainNode
  pan: StereoPannerNode
  send: GainNode
  splitter: ChannelSplitterNode
  analysers: { left: AnalyserNode; right: AnalyserNode }
}

const channels = new Map<string, Channel>()

// Reactive mirrors of what the template and waveform need from `channels`
const channelStatus = reactive<Record<string, 'loading' | 'ready' | 'error'>>({})
const channelErrors = reactive<Record<string, string>>({})
const buffers = shallowRef<Record<string, AudioBuffer>>({})
const channelsVersion = ref(0)

const setBuffer = (id: string, buffer: AudioBuffer | null) => {
  const next = { ...buffers.value }
  if (buffer) next[id] = buffer
  else delete next[id]
  buffers.value = next
}

const loadChannel = async (id: string, channel: Channel) => {
  const src = channel.src
  const isCurrent = () => channels.get(id) === channel && channel.src === src

  channelStatus[id] = 'loading'
  try {
    const buffer = await loadAudio(src)
    if (!isCurrent()) return
    channel.buffer = buffer
    setBuffer(id, buffer)
    channelStatus[id] = 'ready'
    delete channelErrors[id]
    if (transport.isPlaying) startSource(channel, currentTime())
  } catch (error) {
    if (!isCurrent()) return
    channelStatus[id] = 'error'
    channelErrors[id] = error instanceof LoadError ? error.message : "couldn't be loaded."
    console.error(`[vue-audio-mixer] Failed to load track "${id}":`, error)
    emit('load-error', { trackId: id, error })
  }
}

const createChannel = (track: ResolvedTrack) => {
  const gain = context.createGain()
  const pan = context.createStereoPanner()
  const send = context.createGain()
  const splitter = context.createChannelSplitter(2)
  const analysers = { left: context.createAnalyser(), right: context.createAnalyser() }

  analysers.left.fftSize = METER_WINDOW
  analysers.right.fftSize = METER_WINDOW
  send.gain.value = 0

  gain.connect(pan)
  pan.connect(masterGain)
  pan.connect(send)
  send.connect(reverbBus)
  pan.connect(splitter)
  splitter.connect(analysers.left, 0)
  splitter.connect(analysers.right, 1)

  const channel: Channel = { src: track.src, buffer: null, source: null, gain, pan, send, splitter, analysers }
  channels.set(track.id, channel)
  channelsVersion.value++
  loadChannel(track.id, channel)
}

const reloadChannel = (id: string, channel: Channel, src: AudioSource) => {
  stopSource(channel)
  channel.src = src
  channel.buffer = null
  setBuffer(id, null)
  loadChannel(id, channel)
}

const destroyChannel = (id: string) => {
  const channel = channels.get(id)
  if (!channel) return
  stopSource(channel)
  for (const node of [channel.gain, channel.pan, channel.send, channel.splitter]) node.disconnect()
  channels.delete(id)
  delete channelStatus[id]
  delete channelErrors[id]
  setBuffer(id, null)
  channelsVersion.value++
}

// Config: `mix` holds the static values and automation; the parent gets a new copy on every change

const mix = shallowRef<ResolvedMixerConfig>(normalizeConfig({ tracks: [] }).config)
let lastEmitted: ResolvedMixerConfig | null = null

const applyConfig = (input: MixerConfig) => {
  const raw = toRaw(input)
  if (raw === lastEmitted) return // our own update coming back through v-model

  const { config, issues } = normalizeConfig(raw)
  for (const issue of issues) console.warn(`[vue-audio-mixer] ${issue}`)
  mix.value = config

  const ids = new Set(config.tracks.map((track) => track.id))
  for (const id of [...channels.keys()]) {
    if (!ids.has(id)) destroyChannel(id)
  }
  for (const track of config.tracks) {
    const channel = channels.get(track.id)
    if (!channel) createChannel(track)
    else if (channel.src !== track.src) reloadChannel(track.id, channel, track.src)
  }
}

const commit = (next: ResolvedMixerConfig) => {
  mix.value = next
  lastEmitted = next
  emit('update:config', next)
}

watch(() => props.config, applyConfig, { immediate: true })

// Transport

const transport = reactive({ isPlaying: false, elapsed: 0 })
const duration = computed(() =>
  Object.values(buffers.value).reduce((longest, buffer) => Math.max(longest, buffer.duration), 0),
)

let startedAt = 0 // context time corresponding to position 0

// A timer rather than requestAnimationFrame: animation frames stop in background
// tabs, which would freeze automation and end-of-track detection while audio plays on
const TICK_MS = 16
let tickTimer: ReturnType<typeof setInterval> | undefined

const currentTime = () =>
  transport.isPlaying ? Math.min(context.currentTime - startedAt, duration.value) : transport.elapsed

const stopSource = (channel: Channel) => {
  channel.source?.stop()
  channel.source?.disconnect()
  channel.source = null
}

const startSource = (channel: Channel, offset: number) => {
  stopSource(channel)
  if (!channel.buffer || offset >= channel.buffer.duration) return
  const source = context.createBufferSource()
  source.buffer = channel.buffer
  source.connect(channel.gain)
  source.start(0, offset)
  channel.source = source
}

const tick = () => {
  transport.elapsed = currentTime()
  if (transport.elapsed >= duration.value) pause()
}

const play = () => {
  if (transport.isPlaying || duration.value === 0) return
  commitTouches()
  if (transport.elapsed >= duration.value) transport.elapsed = 0

  void context.resume()
  startedAt = context.currentTime - transport.elapsed
  for (const channel of channels.values()) startSource(channel, transport.elapsed)
  transport.isPlaying = true
  tickTimer = setInterval(tick, TICK_MS)
}

const pause = () => {
  if (!transport.isPlaying) return
  transport.elapsed = currentTime()
  transport.isPlaying = false
  for (const channel of channels.values()) stopSource(channel)
  clearInterval(tickTimer)
  commitTouches()
}

const stop = () => {
  pause()
  commitTouches()
  transport.elapsed = 0
}

const togglePlay = () => (transport.isPlaying ? pause() : play())

const seek = (fraction: number) => {
  commitTouches()
  const time = Math.min(Math.max(fraction, 0), 1) * duration.value
  transport.elapsed = time
  if (transport.isPlaying) {
    startedAt = context.currentTime - time
    for (const channel of channels.values()) startSource(channel, time)
  }
}

// Automation recording. While recording, each control the user moves becomes a
// "touch": it overrides playback of that lane and collects points. Touches are
// written into the config at the end of the pass (pause, stop, seek, or stop recording).

interface Touch {
  target: string | null // track id, or null for master
  param: TrackParam
  value: number | boolean
  points: [number, number | boolean][]
}

const isRecording = ref(false)
const touches = new Map<string, Touch>()
const touchesVersion = ref(0)

const touchKey = (target: string | null, param: TrackParam) =>
  `${target === null ? 'master' : `track:${target}`}|${param}`

const record = (target: string | null, param: TrackParam, value: number | boolean) => {
  const key = touchKey(target, param)
  const time = currentTime()
  const touch = touches.get(key) ?? { target, param, value, points: [] }
  touches.set(key, touch)

  const last = touch.points[touch.points.length - 1]
  if (last && time - last[0] < 0.001) last[1] = value
  else touch.points.push([time, value])

  touch.value = value
  touchesVersion.value++
}

const withLane = <A extends TrackAutomation>(automation: A, param: TrackParam, points: Touch['points']): A =>
  ({ ...automation, [param]: overwriteLane(automation[param], points) }) as A

const commitTouches = () => {
  if (touches.size === 0) return
  let { tracks, master } = mix.value

  for (const { target, param, points } of touches.values()) {
    if (target === null) {
      master = { ...master, automation: withLane(master.automation, param, points) }
    } else {
      tracks = tracks.map((track) =>
        track.id === target ? { ...track, automation: withLane(track.automation, param, points) } : track,
      )
    }
  }

  touches.clear()
  touchesVersion.value++
  commit({ ...mix.value, tracks, master })
}

const toggleRecording = () => {
  if (isRecording.value) commitTouches()
  isRecording.value = !isRecording.value
}

// Live values: a touch wins, then automation at the current position, then the static value

const resolveNumber = (
  target: string | null,
  param: TrackParam,
  lane: [number, number][] | undefined,
  fallback: number,
  time: number,
): number => {
  const touch = touches.get(touchKey(target, param))
  if (touch) return touch.value as number
  return (lane && sampleNumberLane(lane, time)) ?? fallback
}

const resolveBoolean = (
  target: string | null,
  param: TrackParam,
  lane: [number, boolean][] | undefined,
  fallback: boolean,
  time: number,
): boolean => {
  const touch = touches.get(touchKey(target, param))
  if (touch) return touch.value as boolean
  return (lane && sampleBooleanLane(lane, time)) ?? fallback
}

const liveParams = computed(() => {
  void touchesVersion.value
  const time = transport.elapsed
  const { tracks, master } = mix.value

  const trackParams: Record<string, ChannelParams> = {}
  for (const { id, automation, ...track } of tracks) {
    trackParams[id] = {
      gain: resolveNumber(id, 'gain', automation.gain, track.gain, time),
      pan: resolveNumber(id, 'pan', automation.pan, track.pan, time),
      reverb: resolveNumber(id, 'reverb', automation.reverb, track.reverb, time),
      muted: resolveBoolean(id, 'muted', automation.muted, track.muted, time),
      soloed: resolveBoolean(id, 'soloed', automation.soloed, track.soloed, time),
      audible: false,
    }
  }

  const audible = computeAudible(tracks.map(({ id, hidden }) => ({ id, hidden, ...trackParams[id] })))
  for (const { id } of tracks) trackParams[id].audible = audible[id]

  const masterParams: MasterParams = {
    gain: resolveNumber(null, 'gain', master.automation.gain, master.gain, time),
    pan: resolveNumber(null, 'pan', master.automation.pan, master.pan, time),
    muted: resolveBoolean(null, 'muted', master.automation.muted, master.muted, time),
  }

  return { tracks: trackParams, master: masterParams }
})

// Push live values into the audio graph, smoothing changes to avoid clicks

const lastApplied = new WeakMap<AudioParam, number>()

const setAudioParam = (param: AudioParam, value: number) => {
  if (lastApplied.get(param) === value) return
  lastApplied.set(param, value)
  if (context.state === 'running') {
    param.setTargetAtTime(value, context.currentTime, 0.01)
  } else {
    param.cancelScheduledValues(0)
    param.value = value
  }
}

watchEffect(() => {
  void channelsVersion.value
  const { tracks, master } = liveParams.value
  for (const [id, params] of Object.entries(tracks)) {
    const channel = channels.get(id)
    if (!channel) continue
    setAudioParam(channel.gain.gain, params.audible ? params.gain : 0)
    setAudioParam(channel.pan.pan, params.pan)
    setAudioParam(channel.send.gain, params.reverb)
  }
  setAudioParam(masterGain.gain, master.muted ? 0 : master.gain)
  setAudioParam(masterPan.pan, master.pan)
})

// User input: recorded as automation while recording, otherwise written to the config

const setTrackParam = <P extends TrackParam>(id: string, param: P, value: ParamValue<P>) => {
  if (isRecording.value) {
    record(id, param, value)
    return
  }
  commit({
    ...mix.value,
    tracks: mix.value.tracks.map((track) => (track.id === id ? { ...track, [param]: value } : track)),
  })
}

const setMasterParam = <P extends MasterParam>(param: P, value: ParamValue<P>) => {
  if (isRecording.value) {
    record(null, param, value)
    return
  }
  commit({ ...mix.value, master: { ...mix.value.master, [param]: value } })
}

// Mixdown: renders the whole mix, automation included, faster than real time

const rendering = ref(false)

/** Renders the current mix to a WAV file. */
const renderMix = async (): Promise<Blob> => {
  commitTouches()
  const audio = await renderOffline({
    config: mix.value,
    buffers: buffers.value,
    impulse,
    sampleRate: context.sampleRate,
  })
  const channelData = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  return encodeWav(channelData, audio.sampleRate)
}

const downloadMix = async () => {
  if (rendering.value) return
  rendering.value = true
  try {
    const url = URL.createObjectURL(await renderMix())
    const link = document.createElement('a')
    link.href = url
    link.download = 'mix.wav'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {
    console.error('[vue-audio-mixer] Failed to render mix:', error)
  } finally {
    rendering.value = false
  }
}

defineExpose({ play, pause, stop, seek, renderMix })

// Loading

const initialised = ref(false)

const loadProgress = computed(() => {
  const statuses = Object.values(channelStatus)
  if (statuses.length === 0) return 100
  return (statuses.filter((status) => status !== 'loading').length / statuses.length) * 100
})

watchEffect(() => {
  if (initialised.value) return
  if (Object.values(channelStatus).some((status) => status === 'loading')) return
  initialised.value = true
  emit('loaded')
})

const failedTracks = computed(() => mix.value.tracks.filter((track) => channelStatus[track.id] === 'error'))

const visibleTracks = computed(() =>
  mix.value.tracks.filter((track) => !track.hidden && channelStatus[track.id] === 'ready'),
)

const analysersFor = (id: string) => channels.get(id)!.analysers

const transportState = computed(() => ({ elapsed: transport.elapsed, duration: duration.value }))

onUnmounted(() => {
  clearInterval(tickTimer)
  for (const id of [...channels.keys()]) destroyChannel(id)
  void context.close()
})
</script>

<template>
  <div class="vue-audio-mixer" :class="[`vue-audio-mixer--${size}`, `vue-audio-mixer--${theme}`]">
    <header v-if="title || initialised" class="vue-audio-mixer-header">
      <div v-if="title" class="vue-audio-mixer-title">{{ title }}</div>
      <span v-if="initialised" class="vue-audio-mixer-hint">Double-click a control to reset</span>
    </header>

    <Loader v-if="!initialised" :progress="loadProgress" />

    <template v-else>
      <ul v-if="failedTracks.length" class="vue-audio-mixer-load-errors" role="alert">
        <li v-for="track in failedTracks" :key="track.id">
          <strong>{{ track.name }}</strong> {{ channelErrors[track.id] }}
        </li>
      </ul>

      <div class="vue-audio-mixer-strips">
        <MixerChannel
          v-for="track in visibleTracks"
          :key="track.id"
          :label="track.name"
          :trackState="liveParams.tracks[track.id]"
          :analyserNodes="analysersFor(track.id)"
          :showPan="showPan"
          @mute="setTrackParam(track.id, 'muted', $event)"
          @solo="setTrackParam(track.id, 'soloed', $event)"
          @updateTrackPan="setTrackParam(track.id, 'pan', $event)"
          @updateTrackGain="setTrackParam(track.id, 'gain', $event)"
          @updateTrackReverb="setTrackParam(track.id, 'reverb', $event)"
        />
        <MixerChannel
          label="Master"
          master
          :trackState="liveParams.master"
          :analyserNodes="masterAnalysers"
          :showPan="showPan"
          @updateTrackPan="setMasterParam('pan', $event)"
          @updateTrackGain="setMasterParam('gain', $event)"
        />
      </div>

      <section class="vue-audio-mixer-transport" aria-label="Transport">
        <Transport
          :masterState="transportState"
          :audioBuffers="buffers"
          :trackStates="liveParams.tracks"
          :showTotalTime="showTotalTime"
          :theme="theme"
          @seek="seek"
        />

        <div class="vue-audio-mixer-controls">
          <button
            type="button"
            class="vue-audio-mixer-button is-primary"
            :disabled="duration === 0"
            @click="togglePlay"
          >
            <svg v-if="transport.isPlaying" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="3" width="3" height="10" rx="1" />
              <rect x="9.5" y="3" width="3" height="10" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.2-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" /></svg>
            {{ transport.isPlaying ? 'Pause' : 'Play' }}
          </button>

          <button type="button" class="vue-audio-mixer-button" @click="stop">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /></svg>
            Stop
          </button>

          <button
            type="button"
            class="vue-audio-mixer-button is-record"
            :class="{ 'is-on': isRecording }"
            :aria-pressed="isRecording"
            @click="toggleRecording"
          >
            <span class="vue-audio-mixer-record-dot" aria-hidden="true"></span>
            {{ isRecording ? 'Recording automation' : 'Record automation' }}
          </button>

          <span class="vue-audio-mixer-controls-spacer"></span>

          <button
            type="button"
            class="vue-audio-mixer-button"
            :disabled="rendering || duration === 0"
            @click="downloadMix"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ rendering ? 'Rendering…' : 'Download mix' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.vue-audio-mixer {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: fit-content;
  max-width: 100%;
  padding: 28px;
  border-radius: 16px;
  background: var(--vam-bg);
  color: var(--vam-text);
  font-family: var(--vam-font-sans);
}

.vue-audio-mixer-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.vue-audio-mixer-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--vam-text-strong);
}

.vue-audio-mixer-hint {
  margin-left: auto;
  font-family: var(--vam-font-mono);
  font-size: 12px;
  color: var(--vam-text-muted);
}

.vue-audio-mixer-load-errors {
  margin: 0;
  padding: 10px 14px;
  list-style: none;
  border-left: 3px solid var(--vam-record);
  border-radius: 6px;
  background: var(--vam-error-bg);
  color: var(--vam-error-text);
  font-size: 13px;
  line-height: 1.45;

  li + li {
    margin-top: 4px;
  }
}

.vue-audio-mixer-strips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: 10px;
  user-select: none;
}

.vue-audio-mixer-transport {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--vam-strip-border);
  border-radius: 12px;
  background: var(--vam-strip-bg);
}

.vue-audio-mixer-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.vue-audio-mixer-controls-spacer {
  flex: 1;
}

.vue-audio-mixer-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: var(--vam-control-bg);
  color: var(--vam-control-text);
  font-family: var(--vam-font-sans);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }

  &.is-primary {
    min-width: 88px;
    justify-content: center;
    background: var(--vam-accent);
    color: var(--vam-on-accent);
  }

  &.is-record.is-on {
    background: var(--vam-record);
    color: var(--vam-on-record);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--vam-accent);
    outline-offset: 2px;
  }
}

.vue-audio-mixer-record-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vam-record);

  .is-on & {
    background: currentColor;
    animation: vue-audio-mixer-pulse 1.2s ease-in-out infinite;
  }
}

@keyframes vue-audio-mixer-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vue-audio-mixer-record-dot {
    animation: none !important;
  }
}

// Compact layout: used on narrow screens, and always when size="small"
@mixin compact {
  &.vue-audio-mixer,
  .vue-audio-mixer {
    gap: 16px;
    padding: 16px;
  }

  .vue-audio-mixer-title {
    font-size: 17px;
  }

  .vue-audio-mixer-strips {
    gap: 6px;
  }

  .vue-audio-mixer-transport {
    padding: 12px;
  }

  .vue-audio-mixer-button {
    height: 30px;
    padding: 0 10px;
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  :root {
    @include compact;
  }
}

.vue-audio-mixer--small {
  @include compact;
}

@media (max-width: 480px) {
  .vue-audio-mixer {
    padding: 12px;
    border-radius: 12px;
  }

  .vue-audio-mixer-hint {
    display: none;
  }
}
</style>

<style>
/*
 * Theme variables. :where() gives these zero specificity, so a plain
 * `.vue-audio-mixer { --vam-accent: … }` rule in your app overrides them.
 */
:where(.vue-audio-mixer),
:where(.vue-audio-mixer) *,
:where(.vue-audio-mixer) *::before,
:where(.vue-audio-mixer) *::after {
  box-sizing: border-box;
}

:where(.vue-audio-mixer) {
  --vam-font-sans: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --vam-font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  --vam-accent: #e8c547;
  --vam-accent-soft: rgba(232, 197, 71, 0.14);
  --vam-on-accent: #141415;
  --vam-mute: #e0823d;
  --vam-on-mute: #141415;
  --vam-record: #e5534b;
  --vam-on-record: #141415;

  --vam-bg: #141415;
  --vam-text: #e6e6e8;
  --vam-text-strong: #f2f2f3;
  --vam-text-muted: #77777c;
  --vam-shadow: rgba(0, 0, 0, 0.4);

  --vam-strip-bg: #1d1d1f;
  --vam-strip-border: #29292c;
  --vam-strip-name: #d4d4d7;
  --vam-master-bg: #232326;
  --vam-master-border: #3a3a3e;

  --vam-control-bg: #2a2a2d;
  --vam-control-text: #9a9aa0;

  --vam-knob-bg: #28282b;
  --vam-knob-border: #38383c;
  --vam-knob-pointer: #f2f2f3;
  --vam-knob-label: #8a8a90;

  --vam-fader-track: #0f0f10;
  --vam-fader-cap: #3a3a3e;
  --vam-fader-cap-border: #4a4a4f;
  --vam-fader-cap-line: #f2f2f3;
  --vam-scale: #65656a;
  --vam-scale-unity: #a0a0a5;

  --vam-meter-gradient: linear-gradient(to bottom, #e5534b 0%, #e8c547 18%, #5cc27a 34%, #3f9c5d 100%);
  --vam-meter-off: #0f0f10;

  --vam-waveform: #3a3a3e;
  --vam-waveform-played: var(--vam-accent);

  --vam-error-bg: rgba(229, 83, 75, 0.12);
  --vam-error-text: #f2b8b3;
}

:where(.vue-audio-mixer--light) {
  --vam-accent: #8f6400;
  --vam-accent-soft: rgba(143, 100, 0, 0.1);
  --vam-on-accent: #ffffff;
  --vam-mute: #c2410c;
  --vam-on-mute: #ffffff;
  --vam-record: #d42f26;
  --vam-on-record: #ffffff;

  --vam-bg: #f4f4f5;
  --vam-text: #27272a;
  --vam-text-strong: #18181b;
  --vam-text-muted: #6b6b73;
  --vam-shadow: rgba(24, 24, 27, 0.14);

  --vam-strip-bg: #ffffff;
  --vam-strip-border: #e4e4e7;
  --vam-strip-name: #3f3f46;
  --vam-master-bg: #fafafa;
  --vam-master-border: #d4d4d8;

  --vam-control-bg: #f0f0f2;
  --vam-control-text: #52525b;

  --vam-knob-bg: #f4f4f5;
  --vam-knob-border: #d4d4d8;
  --vam-knob-pointer: #18181b;
  --vam-knob-label: #6b6b73;

  --vam-fader-track: #d4d4d8;
  --vam-fader-cap: #ffffff;
  --vam-fader-cap-border: #c4c4ca;
  --vam-fader-cap-line: #27272a;
  --vam-scale: #6b6b73;
  --vam-scale-unity: #18181b;

  --vam-meter-off: #e8e8eb;

  --vam-waveform: #d4d4d8;

  --vam-error-bg: #fdecea;
  --vam-error-text: #8f1d17;
}
</style>
