<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    masterState: {
      duration: number
      elapsed: number
    }
    audioBuffers: Record<string, AudioBuffer>
    trackStates: Record<string, { audible: boolean; gain: number }>
    showTotalTime?: boolean
    /** Only used to redraw when the theme's colours change. */
    theme?: string
  }>(),
  { showTotalTime: true },
)

const emit = defineEmits<{
  seek: [fraction: number]
}>()

const HEIGHT = 56 // CSS pixels
const KEY_SEEK_SECONDS = 5

const container = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const cssWidth = ref(0)

// While scrubbing, the playhead follows the pointer and playback only jumps on
// release, so audio isn't restarted on every pointer move
const scrubFraction = ref<number | null>(null)

const displayElapsed = computed(() =>
  scrubFraction.value === null ? props.masterState.elapsed : scrubFraction.value * props.masterState.duration,
)

// Average level per device pixel column for each track, computed once per size or track change
let peaks: Record<string, Float32Array> = {}

const computePeaks = () => {
  const columns = Math.round(cssWidth.value * devicePixelRatio)
  const next: Record<string, Float32Array> = {}
  if (columns > 0) {
    for (const [id, buffer] of Object.entries(props.audioBuffers)) {
      // Columns cover the longest track, so shorter tracks end early rather than stretch
      const samplesPerColumn = (props.masterState.duration * buffer.sampleRate) / columns
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
      const levels = new Float32Array(columns)
      for (let column = 0; column < columns; column++) {
        const start = Math.floor(column * samplesPerColumn)
        const end = Math.min(Math.floor((column + 1) * samplesPerColumn), buffer.length)
        if (start >= end) break
        let sum = 0
        for (const data of channels) for (let i = start; i < end; i++) sum += Math.abs(data[i])
        levels[column] = sum / ((end - start) * channels.length)
      }
      next[id] = levels
    }
  }
  peaks = next
  draw()
}

const draw = () => {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return

  const ratio = devicePixelRatio
  const width = Math.round(cssWidth.value * ratio)
  const height = Math.round(HEIGHT * ratio)
  if (el.width !== width) el.width = width
  if (el.height !== height) el.height = height
  ctx.clearRect(0, 0, width, height)

  // Only audible tracks shape the waveform, weighted by their current gain
  const combined = new Float32Array(width)
  for (const [id, levels] of Object.entries(peaks)) {
    const state = props.trackStates[id]
    if (!state?.audible) continue
    for (let x = 0; x < width && x < levels.length; x++) combined[x] += levels[x] * state.gain
  }
  const loudest = combined.reduce((max, value) => Math.max(max, value), 0)
  if (loudest === 0) return

  // Canvas can't use CSS variables directly, so read the theme's colours
  const style = getComputedStyle(el)
  const unplayed = style.getPropertyValue('--vam-waveform').trim() || '#3a3a3e'
  const played = style.getPropertyValue('--vam-waveform-played').trim() || '#e8c547'

  const playheadX = props.masterState.duration ? (displayElapsed.value / props.masterState.duration) * width : 0
  const middle = height / 2
  for (let x = 0; x < width; x++) {
    const barHeight = Math.max((combined[x] / loudest) * height * 0.9, ratio)
    ctx.fillStyle = x < playheadX ? played : unplayed
    ctx.fillRect(x, middle - barHeight / 2, 1, barHeight)
  }
}

// Draw after the DOM updates, so colours from a theme change in the same tick are picked up
watch([displayElapsed, () => props.trackStates, () => props.theme], draw, { flush: 'post' })
watch(() => props.audioBuffers, computePeaks, { flush: 'post' })

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width
    if (width === cssWidth.value) return
    cssWidth.value = width
    computePeaks()
  })
  if (container.value) resizeObserver.observe(container.value)
})

onUnmounted(() => resizeObserver?.disconnect())

// Scrubbing. Pointer events cover mouse, touch and pen; capture keeps the drag
// going when the pointer leaves the waveform.

const fractionAt = (event: PointerEvent) => {
  const rect = canvas.value!.getBoundingClientRect()
  return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
}

const onScrubStart = (event: PointerEvent) => {
  if (event.button !== 0) return
  canvas.value?.setPointerCapture(event.pointerId)
  scrubFraction.value = fractionAt(event)
}

const onScrubMove = (event: PointerEvent) => {
  if (scrubFraction.value !== null) scrubFraction.value = fractionAt(event)
}

const onScrubEnd = (event: PointerEvent) => {
  if (scrubFraction.value === null) return
  emit('seek', fractionAt(event))
  scrubFraction.value = null
}

const onScrubCancel = () => {
  scrubFraction.value = null
}

const onKeyDown = (event: KeyboardEvent) => {
  const { duration, elapsed } = props.masterState
  if (!duration) return
  const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }
  if (event.key === 'Home') emit('seek', 0)
  else if (event.key in steps) emit('seek', (elapsed + steps[event.key] * KEY_SEEK_SECONDS) / duration)
  else return
  event.preventDefault()
}

// mm:ss.mmm
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}
</script>

<template>
  <div class="vue-audio-mixer-timeline">
    <div class="vue-audio-mixer-time">
      <span class="vue-audio-mixer-time-now">{{ formatTime(displayElapsed || 0) }}</span>
      <span v-if="showTotalTime" class="vue-audio-mixer-time-total"> / {{ formatTime(masterState.duration || 0) }}</span>
    </div>
    <div ref="container" class="vue-audio-mixer-waveform">
      <canvas
        ref="canvas"
        role="slider"
        tabindex="0"
        aria-label="Playback position"
        aria-valuemin="0"
        :aria-valuemax="Math.round(masterState.duration)"
        :aria-valuenow="Math.round(displayElapsed)"
        :aria-valuetext="formatTime(displayElapsed || 0)"
        @pointerdown="onScrubStart"
        @pointermove="onScrubMove"
        @pointerup="onScrubEnd"
        @pointercancel="onScrubCancel"
        @keydown="onKeyDown"
      ></canvas>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vue-audio-mixer-timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.vue-audio-mixer-time {
  font-family: var(--vam-font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.vue-audio-mixer-time-now {
  color: var(--vam-text-strong);
}

.vue-audio-mixer-time-total {
  color: var(--vam-text-muted);
}

.vue-audio-mixer-waveform {
  width: 100%;
  // The canvas's pixel size mustn't set the mixer's width; the channel strips do
  contain: inline-size;

  canvas {
    display: block;
    width: 100%;
    height: 56px;
    border-radius: 4px;
    cursor: pointer;
    touch-action: none; // let touch drags scrub instead of scrolling the page

    &:focus-visible {
      outline: 2px solid var(--vam-accent);
      outline-offset: 2px;
    }
  }
}
</style>
