<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, defineProps } from 'vue'

import Transport from './Transport.vue'
import MixerChannel from './MixerChannel.vue'
import Loader from './Loader.vue'

const audiocontext = window.AudioContext
const context = new audiocontext()
const props = defineProps<{
  tracks: { path: string; label: string }[]
}>()

const mp3Files = props.tracks

// Store preloaded audio buffers, gain nodes, and pan nodes
const audioBuffers = ref<Record<string, AudioBuffer>>({})
const gainNodes = reactive<Record<string, GainNode>>({})
const panNodes = reactive<Record<string, StereoPannerNode>>({})
const analyserNodes = reactive<Record<string, { left: AnalyserNode; right: AnalyserNode }>>({})

// Store active buffer source nodes
const sourceNodes = ref<Record<string, AudioBufferSourceNode | null>>({})
// Track mute, solo, pan, elapsed time, and duration states
const trackStates = reactive<
  Record<
    string,
    {
      muted: boolean
      soloed: boolean
      pan: number
      volume: number
      elapsed: number
      duration: number
    }
  >
>({})
// Playback state
const playbackState = reactive({
  isPlaying: false,
  soloActive: false, // Tracks if any track is soloed
})
const intervalId: number | null = null // Timer for updating progress
let startTime = 0 // Store the playback start time

// Master track controls
const masterGainNode = context.createGain()
const masterPanNode = context.createStereoPanner()

const masterSplitterNode = context.createChannelSplitter(2)

const masterAnalyserNodes = { left: context.createAnalyser(), right: context.createAnalyser() }

masterAnalyserNodes.left.fftSize = 256 // Adjust for smoother visuals
masterAnalyserNodes.right.fftSize = 256

// Connect the master signal chain
// Connect the master signal chain
masterGainNode.connect(masterPanNode) // Pan first
masterPanNode.connect(masterSplitterNode) // Then split for analysis
masterSplitterNode.connect(masterAnalyserNodes.left, 0) // Left channel
masterSplitterNode.connect(masterAnalyserNodes.right, 1) // Right channel
masterPanNode.connect(context.destination) // Ensure output to speakers

const masterState = reactive({
  volume: 0.8, // Default volume (1 = full)
  pan: 0, // Default pan (centered)
  elapsed: 0, // Overall elapsed time
  duration: 0, // Duration of the longest track
  muted: false,
  soloed: false,
})

// Loading state
const loadingState = reactive({
  totalTracks: mp3Files.length,
  loadedTracks: 0,
  isLoading: true,
  progress: 0,
})



const trackMix = () => {
  recording.value = []
  isRecording.value = true
  recordingStartTime = masterState.elapsed // Sync with current playback time
  console.log('Mix tracking started at:', recordingStartTime)
}

const stopRecording = () => {
  isRecording.value = false
}

const recording = ref<{ time: number; type: string; track: string | 'master'; value: any }[]>([])
const isRecording = ref(false)
let recordingStartTime = 0
const mixerContainerWidth = computed(() => {
  return {
    width: `${(mp3Files.length + 1) * 110}px`,
  }
})
// Preload all MP3 files and initialize gain nodes, pan nodes, and track states

const preloadMP3s = async () => {
  for (const { path, label } of mp3Files) {
    try {
      const response = await fetch(path)
      if (!response.ok) {
        throw new Error(`Failed to load audio file: ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await context.decodeAudioData(arrayBuffer)

      // Store the audio buffer
      audioBuffers.value[label] = audioBuffer

      // Initialize audio nodes
      const gainNode = context.createGain()
      const panNode = context.createStereoPanner()
      const splitter = context.createChannelSplitter(2) // Split into left and right channels
      const leftAnalyserNode = context.createAnalyser()
      const rightAnalyserNode = context.createAnalyser()
      const merger = context.createChannelMerger(2) // Recombine left and right channels

      // Configure analyser nodes
      leftAnalyserNode.fftSize = 256 // Adjust for smoother visuals
      rightAnalyserNode.fftSize = 256

      // Connect nodes
      gainNode.connect(panNode).connect(splitter)
      splitter.connect(leftAnalyserNode, 0) // Left channel to analyser
      splitter.connect(rightAnalyserNode, 1) // Right channel to analyser
      splitter.connect(merger, 0, 0) // Left channel to merger
      splitter.connect(merger, 1, 1) // Right channel to merger
      merger.connect(masterGainNode) // Send merged signal to master

      // Store nodes
      gainNodes[label] = gainNode
      panNodes[label] = panNode
      analyserNodes[label] = { left: leftAnalyserNode, right: rightAnalyserNode }

      // Initialize track state
      trackStates[label] = {
        muted: false,
        soloed: false,
        pan: 0,
        volume: 0.8,
        elapsed: 0,
        duration: audioBuffer.duration,
      }

      // Update master duration
      masterState.duration = Math.max(masterState.duration, audioBuffer.duration)
      loadingState.loadedTracks++
      loadingState.progress = (loadingState.loadedTracks / loadingState.totalTracks) * 100
    } catch (error) {
      console.error(`Error loading ${label}:`, error)
    }
  }

  loadingState.isLoading = false
}

const pauseAll = () => {
  if (!playbackState.isPlaying) return

  playbackState.isPlaying = false

  // Stop all sources and preserve the current elapsed times
  for (const label of Object.keys(sourceNodes.value)) {
    const source = sourceNodes.value[label]
    if (source) {
      source.stop()
      sourceNodes.value[label] = null

      const state = trackStates[label]
      if (state) {
        // Calculate the elapsed time since the last play start
        state.elapsed = context.currentTime - startTime
        state.elapsed = Math.min(state.elapsed, state.duration) // Ensure it doesn't exceed duration
      }
    }
  }

  masterState.elapsed = Math.min(context.currentTime - startTime, masterState.duration)
  stopWaveformUpdates() // Stop updating the waveform
}

const playAll = () => {
  if (playbackState.isPlaying) return

  playbackState.isPlaying = true
  playbackState.soloActive = Object.values(trackStates).some((state) => state.soloed)
  startTime = context.currentTime - masterState.elapsed

  // Play all tracks
  for (const [label, buffer] of Object.entries(audioBuffers.value)) {
    const state = trackStates[label]
    playTrack(label, state.elapsed)
  }

  // Start automations
  scheduleAutomations()

  startWaveformUpdates()
}
let animationFrameId: number | null = null

const startWaveformUpdates = () => {
  const update = () => {
    if (playbackState.isPlaying) {
      updateProgress()
      animationFrameId = requestAnimationFrame(update)
    }
  }
  animationFrameId = requestAnimationFrame(update)
}

const stopWaveformUpdates = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// Update the master track's elapsed time
const updateProgress = () => {
  masterState.elapsed = Math.min(context.currentTime - startTime, masterState.duration)
}

const scheduleAutomations = () => {
  const currentPlaybackTime = masterState.elapsed

  // Filter and schedule events that occur after the current playback time
  recording.value.forEach(({ time, type, track, value }) => {
    if (time >= currentPlaybackTime) {
      const delay = (time - currentPlaybackTime) * 1000 // Convert to milliseconds
      setTimeout(() => {
        if (type === 'volume') {
          if (track === 'master') {
            masterGainNode.gain.value = value
          } else {
            updateTrackVolume(track, value)
          }
        } else if (type === 'pan') {
          if (track === 'master') {
            masterState.pan = value
          } else {
            updateTrackPan(track, value)
          }
        } else if (type === 'mute') {
          toggleMute(track)
        } else if (type === 'solo') {
          toggleSolo(track)
        }
      }, delay)
    }
  })
}

const stopAll = () => {
  playbackState.isPlaying = false

  for (const label of Object.keys(sourceNodes.value)) {
    sourceNodes.value[label]?.stop()
    sourceNodes.value[label] = null
    trackStates[label].elapsed = 0
  }

  masterState.elapsed = 0
  recordingStartTime = 0 // Reset recording start time

  stopWaveformUpdates()
}

// Play a single track from a specific position
const playTrack = (label: string, offset: number) => {
  const buffer = audioBuffers.value[label]
  const state = trackStates[label]

  if (sourceNodes.value[label]) {
    sourceNodes.value[label]?.stop()
    sourceNodes.value[label] = null
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  // Connect source to the gain node
  source.connect(gainNodes[label])

  // Set gain and pan values
  gainNodes[label].gain.value = state.muted ? 0 : state.volume
  panNodes[label].pan.value = state.pan

  source.start(0, offset)
  sourceNodes.value[label] = source
}

// Seek to a specific position in all tracks
const seekAll = (percentage: number) => {
  const newElapsed = percentage * masterState.duration
  masterState.elapsed = newElapsed

  for (const label of Object.keys(trackStates)) {
    const state = trackStates[label]
    state.elapsed = newElapsed
    playTrack(label, newElapsed) // Restart track playback at the new position
  }

  // Update the start time for recording automation at the new position
  startTime = context.currentTime - newElapsed
  recordingStartTime = newElapsed // Sync recording start time with the new position

  updateProgress()
}

const updateMasterTrackVolume = (value: number) => {
  masterState.volume = value
  masterGainNode.gain.value = value
}

const updateMasterTrackPan = (value: number) => {
  masterState.pan = value
  masterPanNode.pan.value = value
}

// Update individual track controls
const updateTrackVolume = (label: string, value: number) => {
  const state = trackStates[label]
  if (state) {
    state.volume = value
    gainNodes[label].gain.value = state.muted ? 0 : value
    //drawWaveform() // Redraw when volume changes

    // Log the event if tracking is active
    if (isRecording.value) {
      const currentTime = context.currentTime - startTime + recordingStartTime

      // Remove existing event at the same time for this track and type
      recording.value = recording.value.filter(
        (event) =>
          !(
            event.track === label &&
            event.type === 'volume' &&
            Math.abs(event.time - currentTime) < 0.01
          ),
      )

      // Add the new event
      recording.value.push({
        time: currentTime,
        type: 'volume',
        track: label,
        value,
      })
    }
  }
}

const updateTrackPan = (label: string, value: number) => {
  const state = trackStates[label]
  if (state) {
    state.pan = value
    panNodes[label].pan.value = value
    //drawWaveform() // Redraw when pan changes
  }
}

const toggleMute = (label: string) => {
  const state = trackStates[label]
  if (state) {
    state.muted = !state.muted
    gainNodes[label].gain.value = state.muted ? 0 : state.volume
    //drawWaveform() // Redraw when mute toggles
  }
}

const playRecording = () => {
  if (!recording.value.length) {
    console.warn('No recording to play')
    return
  }

  // Determine the current playback position
  const currentPlaybackTime = masterState.elapsed
  console.log('Playing recording at:', currentPlaybackTime)

  // Reset the tracks to the appropriate state
  stopAll()

  // Filter and schedule events that occur after the current playback time
  recording.value.forEach(({ time, type, track, value }) => {
    if (time >= currentPlaybackTime) {
      const delay = (time - currentPlaybackTime) * 1000 // Convert to milliseconds
      console.log(`Scheduling ${type} for ${track} in ${delay}ms with value:`, value)

      setTimeout(() => {
        if (type === 'volume') {
          if (track === 'master') {
            masterGainNode.gain.value = value
          } else {
            updateTrackVolume(track, value)
          }
        } else if (type === 'pan') {
          if (track === 'master') {
            masterState.pan = value
          } else {
            updateTrackPan(track, value)
          }
        } else if (type === 'mute') {
          toggleMute(track)
        } else if (type === 'solo') {
          toggleSolo(track)
        }
      }, delay)
    }
  })
}

const toggleSolo = (label: string) => {
  const state = trackStates[label]
  if (state) {
    state.soloed = !state.soloed
    playbackState.soloActive = Object.values(trackStates).some((s) => s.soloed)

    for (const [otherLabel, otherState] of Object.entries(trackStates)) {
      gainNodes[otherLabel].gain.value = playbackState.soloActive
        ? otherState.soloed
          ? otherState.volume
          : 0
        : otherState.muted
          ? 0
          : otherState.volume
    }

    //drawWaveform() // Redraw when solo toggles
  }
}

const masterVolumeCanvas = ref<HTMLCanvasElement | null>(null)

const volumeMonitorPeaks = reactive<
  Record<string, { left: number; right: number; leftColor: string; rightColor: string }>
>(
  Object.fromEntries(
    mp3Files.map((file) => [
      file.label,
      { left: 0, right: 0, leftColor: 'white', rightColor: 'white' },
    ]),
  ),
)

const masterMonitorPeaks = reactive({
  left: 0,
  right: 0,
  leftColor: 'white',
  rightColor: 'white',
})

onMounted(() => {
  preloadMP3s().then(() => {
    //drawWaveform() // Initial waveform render


  })

})

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})
</script>

<template>

  <div class="vue-audio-mixer-container-mask">


  <div class="vue-audio-mixer-mixer-container" :style="mixerContainerWidth">

    <Loader :progress="loadingState.progress" v-if="loadingState.isLoading" />

    <h1 class="vue-audio-mixer-mixer-title" v-if="!loadingState.isLoading">Audio Mixer</h1>

    <!-- Tracks and Master -->
    <div class="vue-audio-mixer-tracks" v-if="!loadingState.isLoading">
      <!-- Individual Tracks -->
      <div v-for="file in mp3Files" :key="file.label">
        <MixerChannel
        v-if="context"
          :context="context"
          :masterState="masterState"
          :trackState="trackStates[file.label]"
          :label="file.label"
          :analyserNodes="analyserNodes[file.label]"
          @mute="toggleMute(file.label)"
          @solo="toggleSolo(file.label)"
          @updateTrackPan="updateTrackPan(file.label, $event)"
          @updateTrackVolume="updateTrackVolume(file.label, $event)"

        />
      </div>

      <!-- Master Controls -->

      <MixerChannel
      :context="context"
        :masterState="masterState"
        :trackState="masterState"
        :master="true"
        :label="'master'"
        :analyserNodes="masterAnalyserNodes"
        @updateTrackPan="updateMasterTrackPan($event)"
        @updateTrackVolume="updateMasterTrackVolume($event)"
      />
    </div>

    <!-- Waveform and Transport Controls -->
    <div class="vue-audio-mixer-master-controls" v-if="!loadingState.isLoading">
      <Transport
        :masterState="masterState"
        :audioBuffers="audioBuffers"
        :trackStates="trackStates"
        :playbackState="playbackState"
        :context="context"
        @seek="seekAll"
      />
      <!--<div class="recording-controls">
        <button @click="trackMix" :disabled="isRecording">Track Mix</button>
      </div>-->
      <div class="vue-audio-mixer-transport-buttons">
        <button @click="playAll" :disabled="loadingState.isLoading || playbackState.isPlaying">
          Play
        </button>
        <button @click="pauseAll" :disabled="loadingState.isLoading || !playbackState.isPlaying">
          Pause
        </button>
        <button @click="stopAll" :disabled="loadingState.isLoading">Stop</button>
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
  overflow-x: auto; /* Enable horizontal scrolling */
  overflow-y: hidden; /* Prevent vertical scrolling */
  -webkit-overflow-scrolling: touch; /* Smooth scrolling on mobile */
  width: 100%; /* Full width for the scrollable container */

  background-color: #333;
  border-radius: 10px;
  scrollbar-width: none; /* For Firefox */
  -ms-overflow-style: none; /* For IE/Edge */
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

.vue-audio-mixer-mixer-container {
  height:890px;
  font-family: Arial, sans-serif;


  color: #fff;
  padding: 20px;
  max-width: 1000px;
  margin: auto;

  display: flex;
  flex-direction: column; /* Stack elements vertically */
  width: auto; /* Allow width to grow with content */


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
</style>
