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

const props = defineProps<{
  config: MixerConfig
}>()

const emit = defineEmits<{
  'update:config': [config: ResolvedMixerConfig]
  loaded: []
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

masterAnalysers.left.fftSize = 256
masterAnalysers.right.fftSize = 256

masterGain.connect(masterPan)
masterPan.connect(masterSplitter)
masterSplitter.connect(masterAnalysers.left, 0)
masterSplitter.connect(masterAnalysers.right, 1)
masterPan.connect(context.destination)

// One reverb shared by every track. Each track feeds it through its own send gain.
const reverbBus = context.createConvolver()
reverbBus.connect(masterGain)

const loadAudio = async (src: AudioSource): Promise<AudioBuffer> => {
  if (src instanceof AudioBuffer) return src

  let data: ArrayBuffer
  if (typeof src === 'string') {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    data = await response.arrayBuffer()
  } else {
    data = await src.arrayBuffer()
  }
  return context.decodeAudioData(data)
}

loadAudio(hallWavPath)
  .then((buffer) => {
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
    if (transport.isPlaying) startSource(channel, currentTime())
  } catch (error) {
    if (!isCurrent()) return
    channelStatus[id] = 'error'
    console.error(`[vue-audio-mixer] Failed to load track "${id}":`, error)
  }
}

const createChannel = (track: ResolvedTrack) => {
  const gain = context.createGain()
  const pan = context.createStereoPanner()
  const send = context.createGain()
  const splitter = context.createChannelSplitter(2)
  const analysers = { left: context.createAnalyser(), right: context.createAnalyser() }

  analysers.left.fftSize = 256
  analysers.right.fftSize = 256
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

const startRecording = () => {
  isRecording.value = true
}

const stopRecording = () => {
  commitTouches()
  isRecording.value = false
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

  const soloActive = tracks.some((track) => !track.hidden && trackParams[track.id].soloed)
  for (const track of tracks) {
    const params = trackParams[track.id]
    params.audible = !params.muted && (track.hidden || !soloActive || params.soloed)
  }

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

const visibleTracks = computed(() =>
  mix.value.tracks.filter((track) => !track.hidden && channelStatus[track.id] === 'ready'),
)

const analysersFor = (id: string) => channels.get(id)!.analysers

const transportState = computed(() => ({ elapsed: transport.elapsed, duration: duration.value }))

const mixerContainerWidth = computed(() => ({
  width: `${(visibleTracks.value.length + 1) * 110}px`,
}))

onUnmounted(() => {
  clearInterval(tickTimer)
  for (const id of [...channels.keys()]) destroyChannel(id)
  void context.close()
})
</script>

<template>
  <div class="vue-audio-mixer-container-mask">
    <div class="vue-audio-mixer-transport-buttons">
      <button @click="startRecording" :disabled="isRecording">Start Recording</button>
      <button @click="stopRecording" :disabled="!isRecording">Stop Recording</button>
    </div>

    <div class="vue-audio-mixer-mixer-container" :style="mixerContainerWidth">
      <Loader :progress="loadProgress" v-if="!initialised" />

      <h1 class="vue-audio-mixer-mixer-title" v-if="initialised">Audio Mixer</h1>

      <!-- Tracks and Master -->
      <div class="vue-audio-mixer-tracks" v-if="initialised">
        <!-- Individual Tracks -->
        <div v-for="track in visibleTracks" :key="track.id">
          <MixerChannel
            :trackState="liveParams.tracks[track.id]"
            :label="track.name"
            :analyserNodes="analysersFor(track.id)"
            @mute="setTrackParam(track.id, 'muted', $event)"
            @solo="setTrackParam(track.id, 'soloed', $event)"
            @updateTrackPan="setTrackParam(track.id, 'pan', $event)"
            @updateTrackGain="setTrackParam(track.id, 'gain', $event)"
            @updateTrackReverb="setTrackParam(track.id, 'reverb', $event)"
          />
        </div>

        <!-- Master Controls -->
        <MixerChannel
          :trackState="liveParams.master"
          :master="true"
          :label="'master'"
          :analyserNodes="masterAnalysers"
          @updateTrackPan="setMasterParam('pan', $event)"
          @updateTrackGain="setMasterParam('gain', $event)"
        />
      </div>

      <!-- Waveform and Transport Controls -->
      <div class="vue-audio-mixer-master-controls" v-if="initialised">
        <Transport
          :masterState="transportState"
          :audioBuffers="buffers"
          :trackStates="liveParams.tracks"
          :context="context"
          @seek="seek"
        />
        <div class="vue-audio-mixer-transport-buttons">
          <button @click="play" :disabled="transport.isPlaying">Play</button>
          <button @click="pause" :disabled="!transport.isPlaying">Pause</button>
          <button @click="stop">Stop</button>
        </div>

        <div class="vue-audio-mixer-recording-status">
          <span class="vue-audio-mixer-recording-indicator" :class="{ hidden: !isRecording }"></span>
          {{ isRecording ? 'Recording...' : '' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  -webkit-touch-callout: none; /* iOS Safari */
  -webkit-user-select: none; /* Safari */
  -khtml-user-select: none; /* Konqueror HTML */
  -moz-user-select: none; /* Old versions of Firefox */
  -ms-user-select: none; /* Internet Explorer/Edge */
  user-select: none; /* Non-prefixed version, currently */
}

.vue-audio-mixer-container-mask {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  background-color: #333;
  border-radius: 10px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.vue-audio-mixer-container-mask::-webkit-scrollbar {
  display: none;
}

.vue-audio-mixer-mixer-container {
  height: 890px;
  font-family: Arial, sans-serif;
  color: #fff;
  padding: 20px;
  max-width: 1000px;
  margin: auto;
  display: flex;
  flex-direction: column;
  width: auto;
}


.vue-audio-mixer-container-mask::-webkit-scrollbar {
  display: none; /* For Chrome, Safari, and Edge */
}


p{
  margin: 0;
}

button{
  margin: 0;
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  font-size: 1rem;
  line-height: 1rem;
}


.vue-audio-mixer-mixer-title {
  text-align: center;
  margin-bottom: 20px;
  font-size: 2rem;
  color: #ffcc00;
}

.vue-audio-mixer-tracks {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: flex-end;

  flex-wrap: nowrap; /* Prevent wrapping of track items */

}

.vue-audio-mixer-track {
  background-color: #444;
  padding: 15px;
  border-radius: 10px;
  text-align: center;
  width: 100px;
}

.vue-audio-mixer-track-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.vue-audio-mixer-track-buttons button {
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 5px;
  font-size: 0.9rem;
  cursor: pointer;
  margin-bottom: 5px;
  width: 80%;
}

.vue-audio-mixer-track-buttons button:hover {
  background-color: #0056b3;
}

.vue-audio-mixer-pan-slider {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.8rem;
  color: #ddd;
}

.vue-audio-mixer-volume-slider {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.8rem;
  color: #ddd;
}

.vue-audio-mixer-volume-slider input[type='range'],
.vue-audio-mixer-pan-slider input[type='range'] {
  width: 100%;
}

.vue-audio-mixer-volume-slider input[orient='vertical'] {
  writing-mode: bt-lr; /* Vertical slider for browsers that support it */
  transform: rotate(-90deg); /* Fallback for browsers without writing-mode */
  height: 150px;
}

.vue-audio-mixer-track-label {
  font-size: 1rem;
  color: #ffcc00;
}

.vue-audio-mixer-master-controls {
  margin-top: 30px;
}

.vue-audio-mixer-transport-buttons {
  text-align: center;
  margin-top: 20px;
}

.vue-audio-mixer-transport-buttons button {
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 10px 20px;
  font-size: 1rem;
  cursor: pointer;
  margin-right: 10px;
}

.vue-audio-mixer-transport-buttons button:disabled {
  background-color: #666;
  cursor: not-allowed;
}
.vue-audio-mixer-volume-monitor {
  background-color: #444;
  border: 1px solid #555;
  border-radius: 5px;
  margin: 10px auto;
  display: block;
}

.vue-audio-mixer-recording-indicator {
  background-color: red;
  border-radius: 50%;
  width: 10px;
  height: 10px;
  display: inline-block;
  margin-right: 5px;
}
.vue-audio-mixer-recording-indicator.hidden {
  display: none;
}






.vue-audio-mixer-container-mask {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  background-color: #333;
  border-radius: 10px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.vue-audio-mixer-container-mask::-webkit-scrollbar {
  display: none;
}

.vue-audio-mixer-mixer-container {
  height: 890px;
  font-family: Arial, sans-serif;
  color: #fff;
  padding: 20px;
  max-width: 1000px;
  margin: auto;
  display: flex;
  flex-direction: column;
  width: auto;
}

/* Add media query for smaller screens */
@media (max-width: 768px) {
  .vue-audio-mixer-mixer-container {
    padding: 10px;
    max-width: 90%; /* Reduce max width */
  }

  .vue-audio-mixer-tracks {
    gap: 10px; /* Reduce spacing */
  }

  .vue-audio-mixer-track {
    width: 80px; /* Decrease track width */
    padding: 10px;
  }

  .vue-audio-mixer-track-buttons button {
    font-size: 0.8rem;
    padding: 5px;
  }

  .vue-audio-mixer-volume-slider input[type='range'],
  .vue-audio-mixer-pan-slider input[type='range'] {
    height: 120px; /* Adjust slider height */
  }

  .vue-audio-mixer-transport-buttons button {
    font-size: 0.9rem;
    padding: 8px 15px;
  }
}

@media (max-width: 480px) {
  .vue-audio-mixer-mixer-container {
    padding: 5px;
    max-width: 100%; /* Full width */
  }

  .vue-audio-mixer-track {
    width: 100%; /* Full width for small screens */
    padding: 5px;
  }

  .vue-audio-mixer-track-buttons button {
    font-size: 0.7rem;
    padding: 4px;
  }

  .vue-audio-mixer-volume-slider input[type='range'],
  .vue-audio-mixer-pan-slider input[type='range'] {
    height: 100px; /* Further adjust slider height */
  }

  .vue-audio-mixer-transport-buttons button {
    font-size: 0.8rem;
    padding: 6px 10px;
  }
}



</style>
