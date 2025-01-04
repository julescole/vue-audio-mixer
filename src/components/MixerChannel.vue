<script setup lang="ts">
import {
  ref,
  reactive,
  onMounted,
  defineProps,
  watch,
  defineEmits,
  computed,
  setBlockTracking,
} from 'vue'

import Knob from './Knob.vue'

const emit = defineEmits(['mute', 'solo', 'updateTrackPan', 'updateTrackVolume'])

const isDragging = ref(false)
const faderTrackRef = ref<HTMLElement | null>(null)
const volumeCanvas = ref<HTMLCanvasElement | null>(null)

// Calculate the fader's position based on volume
const faderStyle = computed(() => {
  if (!faderTrackRef.value) return {} // If the track is not yet mounted, return an empty style

  const trackHeight = faderTrackRef.value.clientHeight // Get the height of the fader track
  const faderHeight = 60 // Height of the fader itself (in px, matching the CSS)

  // Calculate the position in pixels based on volume
  const volume = props.trackState.volume || 0 // Volume is normalized (0 to 1)
  const position = (1 - volume) * (trackHeight - faderHeight) // Scale position within the track

  return {
    transform: `translate( -50%,${position}px)`,
  }
})

// Start dragging
const startFaderDrag = (event: MouseEvent) => {
  isDragging.value = true
  updateVolume(event) // Update the volume immediately on mousedown

  // Add mouse event listeners
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', stopFaderDrag)
}

// Stop dragging
const stopFaderDrag = () => {
  isDragging.value = false

  // Remove mouse event listeners
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', stopFaderDrag)
}

// Mousemove handler to update volume
const onMouseMove = (event: MouseEvent) => {
  updateVolume(event) // Call updateVolume directly
}

const updateVolumeCanvasHeight = () => {
  const faderTrack = faderTrackRef.value
  const vc = volumeCanvas.value

  if (!faderTrack || !vc) return // Ensure both references exist

  vc.height = faderTrack.clientHeight // Now it's safe to access `height`
}

// Update volume based on mouse position
const updateVolume = (event: MouseEvent) => {
  const faderTrack = faderTrackRef.value // Access the fader track reference
  if (!faderTrack) return

  updateVolumeCanvasHeight()

  const vc = volumeCanvas.value

  if (!vc) return
  vc.height = faderTrack.clientHeight

  const trackHeight = faderTrack.clientHeight // Use clientHeight to exclude borders
  const trackTop = faderTrack.getBoundingClientRect().top

  // Calculate mouse position clamped between 0 and trackHeight
  const mouseY = Math.min(Math.max(event.clientY - trackTop, 0), trackHeight)

  // Map mouse position to volume (0 to 1)
  const newVolume = 1 - mouseY / trackHeight

  emit('updateTrackVolume', newVolume) // Emit the updated volume
}

const updateKnobRotation = (rotation: number) => {
  emit('updateTrackPan', rotation) // Emit the updated volume
}

///////

// Clear volume monitors
if (volumeCanvas.value) {
  const ctx = volumeCanvas.value.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, volumeCanvas.value.width, volumeCanvas.value.height)
}

const props = withDefaults(
  defineProps<{
    masterState: {
      duration: number
      elapsed: number
    }
    master?: boolean // Mark as optional
    analyserNodes: {
      left: AnalyserNode
      right: AnalyserNode
    }
    context?: AudioContext
    playbackState?: {
      isPlaying: boolean
      soloActive: boolean
    }
    label: string
    trackState: {
      muted: boolean | null
      soloed: boolean | null
      pan: number
      volume: number
      elapsed: number | null
      duration: number | null
    }
  }>(),
  {
    master: false, // Provide default value
  },
)

onMounted(() => {
  drawVolumeMonitors()
  updateVolumeCanvasHeight()
})

const volumeMonitorPeak = reactive({
  left: 0,
  right: 0,
  leftColor: 'green',
  rightColor: 'green',
})

const drawVolumeMonitors = () => {
  const decayRate = 0.005 // Controls the rate at which peaks fall

  const getGradientColor = (
    ctx: CanvasRenderingContext2D,
    gradient: CanvasGradient,
    y: number,
    height: number,
  ) => {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 1
    tempCanvas.height = height

    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return 'white'

    tempCtx.fillStyle = gradient
    tempCtx.fillRect(0, 0, 1, height)

    const pixelData = tempCtx.getImageData(0, y, 1, 1).data
    return `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`
  }

  // Draw individual track volume monitors

  const left = props.analyserNodes.left
  const right = props.analyserNodes.right
  const canvas = volumeCanvas.value

  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const leftData = new Uint8Array(left.fftSize)
  const rightData = new Uint8Array(right.fftSize)
  left.getByteFrequencyData(leftData)
  right.getByteFrequencyData(rightData)

  const calculateRMS = (data: Uint8Array) =>
    Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length)

  const normalizedLeft = Math.min(Math.max(calculateRMS(leftData) / 128, 0), 1)
  const normalizedRight = Math.min(Math.max(calculateRMS(rightData) / 128, 0), 1)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0)
  gradient.addColorStop(0, 'green')
  gradient.addColorStop(0.5, 'yellow')
  gradient.addColorStop(1, 'red')

  const barWidth = canvas.width / 2 - 5

  // Update peaks and colors
  if (normalizedLeft > volumeMonitorPeak.left) {
    volumeMonitorPeak.left = normalizedLeft
    const peakY = canvas.height * (1 - normalizedLeft) - 1
    volumeMonitorPeak.leftColor = getGradientColor(ctx, gradient, peakY, canvas.height)
  } else {
    volumeMonitorPeak.left = Math.max(0, volumeMonitorPeak.left - decayRate)
  }

  if (normalizedRight > volumeMonitorPeak.right) {
    volumeMonitorPeak.right = normalizedRight
    const peakY = canvas.height * (1 - normalizedRight) - 1
    volumeMonitorPeak.rightColor = getGradientColor(ctx, gradient, peakY, canvas.height)
  } else {
    volumeMonitorPeak.right = Math.max(0, volumeMonitorPeak.right - decayRate)
  }

  // Draw left channel bar

  // fill the ctx black to start
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, barWidth, canvas.height)

  ctx.fillStyle = gradient
  ctx.fillRect(0, canvas.height * (1 - normalizedLeft), barWidth, canvas.height * normalizedLeft)
  const barMargin = 5
  // Draw right channel bar

  // fill the ctx black to start
  ctx.fillStyle = 'black'
  ctx.fillRect(barWidth + barMargin, 0, barWidth, canvas.height)

  ctx.fillStyle = gradient
  ctx.fillRect(
    barWidth + barMargin,
    canvas.height * (1 - normalizedRight),
    barWidth,
    canvas.height * normalizedRight,
  )

  // Draw peak indicators with stored colors
  if (normalizedLeft > 0) {
    ctx.fillStyle = volumeMonitorPeak.leftColor
    ctx.fillRect(0, canvas.height * (1 - volumeMonitorPeak.left) - 1, barWidth, 1)
  }

  if (normalizedRight > 0) {
    ctx.fillStyle = volumeMonitorPeak.rightColor
    ctx.fillRect(
      barWidth + barMargin,
      canvas.height * (1 - volumeMonitorPeak.right) - 1,
      barWidth,
      1,
    )
  }

  requestAnimationFrame(drawVolumeMonitors) // Continuously update
}
</script>

<template>
  <div class="track-controls">
    <input
      v-show="false"
      type="range"
      min="0"
      max="1"
      step="0.01"
      orient="vertical"
      @input="
        (event) => emit('updateTrackVolume', parseFloat((event.target as HTMLInputElement).value))
      "
      :value="trackState?.volume || 1"
    />

    <!-- Track Label -->

    <div class="channel" :class="{ master: master }">
      <Knob
        :key="label"
        :rotation="trackState?.pan"
        :color="'#20CC1E'"
        :active="true"
        :style="1"
        @update:rotation="updateKnobRotation($event)"
      />
      <div class="bus-control" v-if="!master">
        <!-- Mute and Solo Buttons -->

        <button
          class="button button--bus"
          :class="{ muted: trackState.muted }"
          @click="emit('mute')"
          v-if="!master"
        >
          M
        </button>
        <button
          class="button button--bus"
          :class="{ soloed: trackState.soloed }"
          @click="emit('solo')"
          v-if="!master"
        >
          S
        </button>
      </div>
      <div v-else>
        <div class="bus-control-master"><div class="master-spacer">&nbsp;</div></div>
      </div>
      <div class="knob knob--pan"></div>
      <div class="slider-value">
        {{ (typeof trackState?.volume === 'number' ? trackState.volume : 0).toFixed(2) }}
      </div>
      <div class="slider">
        <div class="vca">
          <canvas class="volume-monitor" width="25" height="150" ref="volumeCanvas"></canvas>

          <div class="fader-holder">
            <div class="fader-track" ref="faderTrackRef" @mousedown="startFaderDrag">
              <div class="fader" :style="faderStyle"></div>
            </div>
          </div>
          <div class="vca__markers">
            <div>12</div>
            <div>6</div>
            <div>0</div>
            <div>3</div>
            <div>6</div>
            <div>9</div>
            <div>12</div>
            <div>15</div>
            <div>18</div>
            <div>21</div>
            <div>24</div>
            <div>30</div>
            <div>35</div>
            <div>40</div>
            <div>45</div>
            <div>50</div>
            <div>60</div>
          </div>
        </div>
      </div>
    </div>
    <h3 class="track-label">{{ label }}</h3>
  </div>
</template>

<style lang="scss" scoped>
////////////////////////////////////
////////////////////////////////////
/// VOLUME MONITOR
///
///
* {
  box-sizing: border-box;
}
body {
  text-align: center;
}

.channel {
  display: inline-block;
  width: 100%;
  max-width: 100px;
  background: #353434;
  color: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0px 0px 4px 0px rgba(0, 0, 0, 0.75);
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  &.master {
    background: #464646;
  }
}

.bus-control,
.bus-control-master {
  display: flex;
  flex-flow: row nowrap;
  justify-content: center;
  padding: 0.5rem;

  .pan-slider {
    display: flex;
    flex-flow: column nowrap;
    justify-content: center;
    align-items: center;
    margin-right: 0.5rem;
    width: 10px;
  }

  .button,
  .master-spacer {
    flex: 1 1 25px;
    text-align: center;
  }
}

.master-spacer {
  padding: 0.45rem;
}
.button {
  color: #e4e8ea;
  cursor: pointer;
  &.muted {
    color: black;
    background: #ee2122;
  }
  &.soloed {
    color: black;

    background: #fefb43;
  }
  padding: 0.55rem;
  border-radius: 2px;
  background: linear-gradient(to bottom, rgba(79, 79, 79, 1) 0%, rgba(14, 14, 14, 1) 100%);
  box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.5);
}
.bus-control {
  .button:first-child {
    margin-right: 0.25rem;
  }
}
.slider-value {
  display: flex;
  flex-flow: row nowrap;
  justify-content: center;
}
.slider-value__wrap {
  min-width: 24px;
  width: 80%;
  padding: 0.25rem;
  border-radius: 2px;
  color: #1fcc1f;
  background: #333;
  box-shadow: inset 0 0 3px 3px rgba(0, 0, 0, 0.5);
  font-family: 'VT323', monospace;
  text-align: center;
  // font-family: 'Cutive Mono', monospace;
}
.slider {
  display: flex;
  flex-flow: row nowrap;
  height: 340px;
  padding-top: 1rem;
  padding-bottom: 1rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
.fader-holder {
  display: flex;
  flex-flow: column nowrap;
  justify-content: center; /* Center vertically */
  align-items: center; /* Center horizontally */
  width: 100%;
  height: 100%;
  margin-right: 15px;
  margin-left: 15px;
}

.fader-track {
  position: relative;
  height: 340px; /* Set a fixed height */
  width: 5px;
  margin: 0 auto; /* Center horizontally */
  background: #222; /* Optional: add a visible background for testing */
  border-radius: 5px; /* Optional styling */
  cursor: pointer; /* Indicate interactivity */
}

.fader {
  position: absolute; /* Positioning relative to the track */
  top: 0; /* Start at the top of the track */
  width: 25px;
  height: 60px;
  left: 50%; /* Align relative to the track */
  transform: translateX(-50%); /* Center horizontally */
  background: linear-gradient(
    to bottom,
    rgba(14, 14, 14, 1) 0%,
    rgba(79, 79, 79, 1) 5%,
    rgba(79, 79, 79, 1) 5%,
    rgba(79, 79, 79, 1) 10%,
    rgba(14, 14, 14, 1) 25%,
    rgba(22, 22, 22, 1) 34%,
    rgba(22, 22, 22, 1) 34%,
    rgba(79, 79, 79, 1) 73%,
    rgba(79, 79, 79, 1) 75%,
    rgba(14, 14, 14, 1) 100%
  );
  box-shadow: 0 0 3px 0 rgba(0, 0, 0, 0.5);
  z-index: 10;
  transition: transform 0.1s ease-out;
}

.vca {
  display: flex;
  width: 25px;
  height: 100%;
  // position: relative;
}
.vca__meter {
  width: 8px;
  height: 100%;
  margin-right: 0.25rem;
  background: black;
  // position: absolute;
  // top: 1rem;
}
.vca__markers {
  display: flex;
  flex-flow: column nowrap;
  justify-content: space-between;
  height: 100%;
  font-size: 0.5rem;
  color: #808080;
}
</style>
