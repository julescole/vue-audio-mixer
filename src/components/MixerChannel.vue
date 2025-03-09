<script setup lang="ts">
import {
  ref,
  reactive,
  onMounted,
  defineProps,
  defineEmits,
  computed,
} from 'vue'

import Knob from './Knob.vue'
import ReverbEffect from './ReverbEffect.vue'

const emit = defineEmits(['mute', 'solo', 'updateTrackPan', 'updateTrackVolume', 'effectEnabled'])

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

// Start dragging (mouse or touch)
const startFaderDrag = (event: MouseEvent | TouchEvent) => {
  isDragging.value = true;

  if (event instanceof TouchEvent) {
    updateVolume(event.touches[0]); // Use the first touch point
  } else {
    updateVolume(event);
  }

  // Add both mouse and touch event listeners
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", stopFaderDrag);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", stopFaderDrag);
};

// Stop dragging (mouse or touch)
const stopFaderDrag = () => {
  isDragging.value = false;

  // Remove both mouse and touch event listeners
  window.removeEventListener("mousemove", onMove);
  window.removeEventListener("mouseup", stopFaderDrag);
  window.removeEventListener("touchmove", onMove);
  window.removeEventListener("touchend", stopFaderDrag);


};

// Handle movement (mouse or touch)
const onMove = (event: MouseEvent | TouchEvent) => {
  if (event instanceof TouchEvent) {
    event.preventDefault(); // Prevent page scrolling
    updateVolume(event.touches[0]); // Use the first touch point
  } else {
    updateVolume(event);
  }
};


// Update volume based on mouse or touch position
const updateVolume = (event: { clientY: number }) => {
  const faderTrack = faderTrackRef.value;
  if (!faderTrack) return;

  updateVolumeCanvasHeight();

  const vc = volumeCanvas.value;
  if (!vc) return;
  vc.height = faderTrack.clientHeight;

  const trackHeight = faderTrack.clientHeight;
  const trackTop = faderTrack.getBoundingClientRect().top;

  // Calculate touch/mouse position clamped between 0 and trackHeight
  const pointerY = Math.min(Math.max(event.clientY - trackTop, 0), trackHeight);

  // Map touch/mouse position to volume (0 to 1)
  const newVolume = 1 - pointerY / trackHeight;

  emit("updateTrackVolume", newVolume);
};

const updateVolumeCanvasHeight = () => {
  const faderTrack = faderTrackRef.value
  const vc = volumeCanvas.value

  if (!faderTrack || !vc) return // Ensure both references exist

  vc.height = faderTrack.clientHeight // Now it's safe to access `height`
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
    context: AudioContext
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
  <div class="vue-audio-mixer-track-controls">
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

    <div class="vue-audio-mixer-channel" :class="{ master: master }">
      <Knob
        :key="label"
        :rotation="trackState?.pan"
        :color="'#20CC1E'"
        :active="true"
        :style="1"
        @update:rotation="updateKnobRotation($event)"
      />

       <!-- Effects Section -->

       <div class="vue-audio-mixer-effect-pannel"  v-if="!master">
        <ReverbEffect
          :context="context"
          :analyserNodes="analyserNodes"
        />
      </div>
      <div class="vue-audio-mixer-bus-control" v-if="!master">
        <!-- Mute and Solo Buttons -->

        <button
          class="vue-audio-mixer-button vue-audio-mixer-button--bus"
          :class="{ muted: trackState.muted }"
          @click="
          emit('mute', !trackState.muted);
          "
          v-if="!master"
        >
          M
        </button>
        <button
          class="vue-audio-mixer-button vue-audio-mixer-button--bus"
          :class="{ soloed: trackState.soloed }"
          @click="
          emit('solo', !trackState.soloed);

          "
          v-if="!master"
        >
          S
        </button>
      </div>
      <div v-else>
        <div class="vue-audio-mixer-bus-control-master"><div class="vue-audio-mixer-master-spacer">&nbsp;</div></div>
      </div>
      <div class="vue-audio-mixer-knob knob--pan"></div>
      <div class="vue-audio-mixer-slider-value">
        {{ (typeof trackState?.volume === 'number' ? trackState.volume : 0).toFixed(2) }}
      </div>
      <div class="vue-audio-mixer-slider">
        <div class="vue-audio-mixer-vca">
          <canvas class="vue-audio-mixer-volume-monitor" width="25" height="150" ref="volumeCanvas"></canvas>

          <div class="vue-audio-mixer-fader-holder">
            <div class="vue-audio-mixer-fader-track" ref="faderTrackRef"   @touchstart="startFaderDrag"
            @mousedown="startFaderDrag">
              <div class="vue-audio-mixer-fader" :style="faderStyle"></div>
            </div>
          </div>
          <div class="vue-audio-mixer-vca__markers">
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
    <span class="vue-audio-mixer-track-label">{{ label }}</span>
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

p{
  margin: 0;
}

button{
  margin: 0;
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  font-size: 1rem;
  line-height: 1rem;
}

body {
  text-align: center;
}

.vue-audio-mixer-track-label{
  color: #e4e8ea;
  font-size: 0.8rem;
  margin-top: 0.5rem;
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
}




.vue-audio-mixer-bus-control,
.vue-audio-mixer-bus-control-master {
  display: flex;
  flex-flow: row nowrap;
  justify-content: center;
  padding: 0.5rem;

  .vue-audio-mixer-pan-slider {
    display: flex;
    flex-flow: column nowrap;
    justify-content: center;
    align-items: center;
    margin-right: 0.5rem;
    width: 10px;
  }

  .vue-audio-mixer-button,
  .vue-audio-mixer-master-spacer {
    flex: 1 1 25px;
    text-align: center;
  }
}

.vue-audio-mixer-master-spacer {
  padding: 1.2rem;
}
.vue-audio-mixer-button {
  color: #e4e8ea;
  cursor: pointer;
  border: none; /* Ensure no border */
  outline: none !important; /* Remove focus outline */
  box-shadow: none !important; /* Prevent Safari from adding a focus shadow */
  -webkit-appearance: none; /* Normalize button appearance on WebKit browsers */
  appearance: none; /* Ensure consistent appearance */
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
.vue-audio-mixer-bus-control {
  .button:first-child {
    margin-right: 0.25rem;
  }
}
.vue-audio-mixer-slider-value {
  display: flex;
  flex-flow: row nowrap;
  justify-content: center;
}
.vue-audio-mixer-slider-value__wrap {
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
.vue-audio-mixer-slider {
  display: flex;
  flex-flow: row nowrap;
  height: 340px;
  padding-top: 1rem;
  padding-bottom: 1rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
.vue-audio-mixer-fader-holder {
  display: flex;
  flex-flow: column nowrap;
  justify-content: center; /* Center vertically */
  align-items: center; /* Center horizontally */
  width: 100%;
  height: 100%;
  margin-right: 5px;
  margin-left: 15px;
}

.vue-audio-mixer-fader-track {
  position: relative;
  height: 340px; /* Set a fixed height */
  width: 5px;
  margin: 0 auto; /* Center horizontally */
  background: #222; /* Optional: add a visible background for testing */
  border-radius: 5px; /* Optional styling */
  cursor: pointer; /* Indicate interactivity */
}

.vue-audio-mixer-fader {
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

.vue-audio-mixer-vca {
  display: flex;
  width: 25px;
  height: 100%;
  // position: relative;
}
.vue-audio-mixer-vca__meter {
  width: 8px;
  height: 100%;
  margin-right: 0.25rem;
  background: black;
  // position: absolute;
  // top: 1rem;
}
.vue-audio-mixer-vca__markers {
  display: flex;
  flex-flow: column nowrap;
  justify-content: space-between;
  height: 100%;
  font-size: 0.5rem;
  color: #808080;
}


/* General styles */

.vue-audio-mixer-channel {
  display: inline-block;
  width: 100%;
  max-width: 100px; /* Default maximum width */
  background: #353434;
  color: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0px 0px 4px 0px rgba(0, 0, 0, 0.75);
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;

  &.master {
    background: #464646;
  }
}

/* Responsive styles for tablets */
@media (max-width: 768px) {

  .vue-audio-mixer-master-spacer {
    flex: 1 1 25px;
    font-size: 0.45rem;
    text-align: center;
    width:60px;
    height:56px;

  }

  .vue-audio-mixer-channel {
    max-width: 80px; /* Reduce the maximum width */
  }

  .vue-audio-mixer-slider {
    height: 300px; /* Adjust the height of the slider */
  }

  .vue-audio-mixer-fader-track {
    height: 300px; /* Adjust the height of the fader track */
  }

  .vue-audio-mixer-fader-holder{
    margin-left: 10px;
  }

  .vue-audio-mixer-fader {
    width: 20px; /* Reduce the width of the fader */
    height: 50px; /* Reduce the height of the fader */
  }

  .vue-audio-mixer-vca__markers {
    font-size: 0.4rem; /* Reduce font size of markers */
  }

  .vue-audio-mixer-track-label {
    font-size: 0.7rem; /* Reduce the font size of the track label */
  }


  .vue-audio-mixer-button{
    padding: 0.3rem;
    font-size: 0.8rem
  }
}

/* Responsive styles for mobile screens */
@media (max-width: 500px) {
  .vue-audio-mixer-channel {
    max-width: 70px; /* Further reduce the maximum width */
  }

  .vue-audio-mixer-slider {
    height: 250px; /* Further adjust the height of the slider */
  }

  .vue-audio-mixer-fader-track {
    height: 250px; /* Further adjust the height of the fader track */
  }

  .vue-audio-mixer-fader {
    width: 15px; /* Further reduce the width of the fader */
    height: 40px; /* Further reduce the height of the fader */
  }

  .vue-audio-mixer-vca__markers {
    display: none;
    font-size: 0.35rem; /* Further reduce font size of markers */
  }

  .vue-audio-mixer-track-label {
    font-size: 0.6rem; /* Further reduce the font size of the track label */
  }
}

</style>
