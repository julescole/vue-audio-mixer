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


const logAutomationEvent = (type: string, track: string, value: any) => {
  if (isRecording.value) {
    const currentTime = context.currentTime - startTime;

    // Ensure we're using the correct state keys
    const correctedType = type === "mute" ? "muted" : type === "solo" ? "soloed" : type;

    // Prevent duplicate events at the same time
    recording.value = recording.value.filter(
      (event) => !(event.track === track && event.type === correctedType && Math.abs(event.time - currentTime) < 0.01)
    );

    // Store the event with corrected key
    recording.value.push({
      time: currentTime,
      type: correctedType,
      track,
      value,
    });

    console.log(`🎬 Recorded ${correctedType} change on ${track}: ${value} at ${currentTime}s`);
  }
};



const applyLatestAutomationState = (currentTime: number) => {
  console.log(`🎯 Applying automation state at ${currentTime}s`);

  const latestState: Record<string, {
    volume?: number;
    pan?: number;
    muted?: boolean;
    soloed?: boolean;
  }> = {};

  // Find the most recent automation states for each track
  recording.value.forEach(({ time, type, track, value }) => {
    if (time <= currentTime) {
      if (!latestState[track]) latestState[track] = {};
      latestState[track][type] = value; // Store the latest value
    }
  });

  // Apply the last known state for each track
  Object.entries(latestState).forEach(([track, state]) => {
    if (state.volume !== undefined) {
      if (track === "master") {
        masterGainNode.gain.value = state.volume;
      } else {
        updateTrackVolume(track, state.volume);
      }
    }
    if (state.pan !== undefined) {
      if (track === "master") {
        masterPanNode.pan.value = state.pan;
      } else {
        updateTrackPan(track, state.pan);
      }
    }
    if (state.muted !== undefined) {
      console.log(`🔇 Applying muted state: ${track} -> ${state.muted}`);
      setMuteState(track, state.muted); // ✅ Use setMuteState
    }
    if (state.soloed !== undefined) {
      console.log(`🎵 Applying soloed state: ${track} -> ${state.soloed}`);
      setSoloState(track, state.soloed); // ✅ Use setSoloState
    }
  });

  console.log(`✅ Automation applied at ${currentTime}s`);
};








let pendingAutomationTimers: number[] = [];

const startRecording = () => {
  isRecording.value = true;
};

const clearRecording = () => {
  recording.value = [];

};


const stopRecording = () => {
  isRecording.value = false
}

let automationTimers: number[] = [];

const recording = ref<{ time: number; type: string; track: string | 'master'; value: any }[]>([])
const isRecording = ref(false)
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

const logInitialState = (track: string, type: string) => {

  if(isRecording.value){
    return;
  }

  const correctedType = type === "mute" ? "muted" : type === "solo" ? "soloed" : type;

  // Check if there's already an initial log entry
  const hasInitialState = recording.value.some(
    (event) => event.track === track && event.type === correctedType && event.time !== 0
  );

  const value = trackStates[track][correctedType];

  if (!hasInitialState) {
    recording.value.push({
      time: 0,
      type: correctedType,
      track,
      value,
    });

    console.log(`📌 Logged initial ${correctedType} for ${track} at 0s: ${value}`);
  }
};


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

const rescheduleAutomation = (currentTime: number) => {
  console.log(`🔄 Rescheduling automation from ${currentTime}s onward`);

  pendingAutomationTimers.forEach(clearTimeout);
  pendingAutomationTimers = [];

  recording.value.forEach(({ time, type, track, value }) => {
    if (time >= currentTime) {
      const delay = (time - currentTime) * 1000;

      const timerId = setTimeout(() => {
        if (type === "volume") {
          if (track === "master") {
            masterGainNode.gain.value = value;
          } else {
            updateTrackVolume(track, value);
          }
        } else if (type === "pan") {
          if (track === "master") {
            masterPanNode.pan.value = value;
          } else {
            updateTrackPan(track, value);
          }
        } else if (type === "muted") { // ✅ Correct key
          console.log(`🔇 Setting mute state at ${time}s -> ${value}`);
          setMuteState(track, value);
        } else if (type === "soloed") { // ✅ Correct key
          console.log(`🎵 Setting solo state at ${time}s -> ${value}`);
          setSoloState(track, value);
        }
      }, delay);

      pendingAutomationTimers.push(timerId);
    }
  });

  console.log(`✅ Rescheduled automation from ${currentTime}s onward`);
};




const playAll = () => {
  if (playbackState.isPlaying) return;

  playbackState.isPlaying = true;
  playbackState.soloActive = Object.values(trackStates).some((state) => state.soloed);
  startTime = context.currentTime - masterState.elapsed;

  applyLatestAutomationState(masterState.elapsed);

  // Play all tracks
  for (const [label, buffer] of Object.entries(audioBuffers.value)) {
    const state = trackStates[label];
    playTrack(label, state.elapsed);
  }
  rescheduleAutomation(masterState.elapsed);

  startWaveformUpdates();
};

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


const stopAll = () => {
  stopRecording();
  playbackState.isPlaying = false

  for (const label of Object.keys(sourceNodes.value)) {
    sourceNodes.value[label]?.stop()
    sourceNodes.value[label] = null
    trackStates[label].elapsed = 0
  }

  masterState.elapsed = 0

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

const seekAll = (percentage: number) => {
  const newElapsed = percentage * masterState.duration;
  masterState.elapsed = newElapsed;

  console.log(`⏩ Seeking to ${newElapsed}s`);

  // Stop all sources and restart playback at new time
  for (const label of Object.keys(trackStates)) {
    trackStates[label].elapsed = newElapsed;
    playTrack(label, newElapsed);
  }

  // ✅ Apply automation state at the new seek position
  applyLatestAutomationState(newElapsed);

  // 🚀 Reschedule future automation events
  rescheduleAutomation(newElapsed);

  // Update recording time references
  startTime = context.currentTime - newElapsed;

  updateProgress();
};








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

    logAutomationEvent("volume", label, value);

  }
}

const updateTrackPan = (label: string, value: number) => {
  const state = trackStates[label]
  if (state) {
    state.pan = value
    panNodes[label].pan.value = value
    logAutomationEvent("pan", label, value);
  }
}



const setMuteState = (label: string, isMuted: boolean) => {
  const state = trackStates[label];
  if (state) {
    state.muted = isMuted; // ✅ Directly set mute state
    gainNodes[label].gain.value = isMuted ? 0 : state.volume; // Adjust gain

    logAutomationEvent("muted", label, isMuted); // ✅ Store exact mute state
  }
};



const setSoloState = (label: string, isSoloed: boolean) => {
  const state = trackStates[label];
  if (state) {
    state.soloed = isSoloed; // ✅ Explicitly set solo state
    playbackState.soloActive = Object.values(trackStates).some((s) => s.soloed);

    // Update all track gains based on solo state
    Object.entries(trackStates).forEach(([otherLabel, otherState]) => {
      gainNodes[otherLabel].gain.value = playbackState.soloActive
        ? otherState.soloed
          ? otherState.volume
          : 0
        : otherState.muted
          ? 0
          : otherState.volume;
    });

    // Log automation event for solo (only if recording is active)
    logAutomationEvent("soloed", label, isSoloed);
  }
};


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
    {{ recording }}





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
          @mute="setMuteState(file.label, $event)"
          @solo="setSoloState(file.label, $event)"
          @updateTrackPan="updateTrackPan(file.label, $event)"
          @updateTrackVolume="updateTrackVolume(file.label, $event)"
          @logInitialState="logInitialState(file.label, $event)"

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
        :recording="recording"
        @seek="seekAll"
      />
      <!--<div class="recording-controls">
        <button @click="trackMix" :disabled="isRecording">Track Mix</button>
      </div>-->
      <div class="vue-audio-mixer-transport-buttons">
        <button @click="playAll" class="button" :disabled="loadingState.isLoading || playbackState.isPlaying">
          Play
        </button>
        <button @click="pauseAll" class="button" :disabled="loadingState.isLoading || !playbackState.isPlaying">
          Pause
        </button>
        <button @click="startRecording" class="recording_button" :class="{active: isRecording}" :disabled="isRecording">Record mix</button>
        <button @click="clearRecording" class="" >Clear recording</button>
        <button @click="stopAll" class="button" :disabled="loadingState.isLoading">Stop</button>
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

@keyframes fadeRed {
  0% {
    background-color: rgba(255, 0, 0, 0.3);
  }
  100% {
    background-color: rgba(255, 0, 0, 1);
  }
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

  &.recording_button{
    &:disabled{
      background-color: #000;
      cursor: not-allowed;
      animation: fadeRed 2s infinite alternate ease-in-out;

    }
    background-color: #d01f1f;
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 10px 20px;
    font-size: 1rem;
    cursor: pointer;
    margin-right: 10px;
    transition: background-color 0.3s ease-in-out;
  }

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
