<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import Knob from './Knob.vue'
import ReverbEffect from './ReverbEffect.vue'
import { FADER_SCALE, dbToPosition, formatDb, gainToDb, gainToPosition, positionToGain, dbToGain } from '../fader'

const props = withDefaults(
  defineProps<{
    label: string
    trackState: {
      gain: number
      pan: number
      muted: boolean
      soloed?: boolean
      reverb?: number
    }
    analyserNodes: {
      left: AnalyserNode
      right: AnalyserNode
    }
    master?: boolean
    showPan?: boolean
  }>(),
  {
    master: false,
    showPan: true,
  },
)

const emit = defineEmits<{
  mute: [muted: boolean]
  solo: [soloed: boolean]
  updateTrackPan: [pan: number]
  updateTrackGain: [gain: number]
  updateTrackReverb: [level: number]
}>()

// Fader

const faderRef = ref<HTMLElement | null>(null)
const capPosition = computed(() => gainToPosition(props.trackState.gain))
const db = computed(() => gainToDb(props.trackState.gain))

let draggingFader = false

const setFromPointer = (event: PointerEvent) => {
  const rect = faderRef.value!.getBoundingClientRect()
  const position = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1)
  emit('updateTrackGain', positionToGain(position))
}

const onFaderDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  faderRef.value?.setPointerCapture(event.pointerId)
  draggingFader = true
  setFromPointer(event)
}

const onFaderMove = (event: PointerEvent) => {
  if (draggingFader) setFromPointer(event)
}

const onFaderUp = () => {
  draggingFader = false
}

// Arrow keys move 1 dB; the step below the scale's last mark is silence
const onFaderKeyDown = (event: KeyboardEvent) => {
  const lowest = FADER_SCALE[FADER_SCALE.length - 1]
  const current = db.value === -Infinity ? lowest - 1 : db.value
  let next: number
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = Math.max(current + 1, lowest)
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = current - 1
  else if (event.key === 'Home') next = 0
  else return
  event.preventDefault()
  emit('updateTrackGain', next < lowest ? 0 : Math.min(dbToGain(next), positionToGain(0)))
}

const scaleLabel = (mark: number, index: number) =>
  index === FADER_SCALE.length - 1 ? '∞' : String(Math.abs(mark))

// Peak meters: a full-height gradient clipped down to the current level. Levels use
// the fader's dB scale and fall back slowly, like a hardware meter.

const leftLit = ref<HTMLElement | null>(null)
const rightLit = ref<HTMLElement | null>(null)
const METER_FALL_PER_FRAME = 0.012

const buffers = {
  left: new Float32Array(props.analyserNodes.left.fftSize),
  right: new Float32Array(props.analyserNodes.right.fftSize),
}
const shown = { left: 0, right: 0 }

const peakLevel = (analyser: AnalyserNode, buffer: Float32Array) => {
  analyser.getFloatTimeDomainData(buffer)
  let peak = 0
  for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]))
  return 1 - dbToPosition(gainToDb(peak))
}

let meterFrameId: number | null = null

const updateMeters = () => {
  for (const side of ['left', 'right'] as const) {
    const level = peakLevel(props.analyserNodes[side], buffers[side])
    shown[side] = Math.max(level, shown[side] - METER_FALL_PER_FRAME)
  }
  if (leftLit.value) leftLit.value.style.clipPath = `inset(${(1 - shown.left) * 100}% 0 0 0)`
  if (rightLit.value) rightLit.value.style.clipPath = `inset(${(1 - shown.right) * 100}% 0 0 0)`
  meterFrameId = requestAnimationFrame(updateMeters)
}

onMounted(updateMeters)

onUnmounted(() => {
  if (meterFrameId !== null) cancelAnimationFrame(meterFrameId)
})
</script>

<template>
  <div class="vue-audio-mixer-strip" :class="{ 'is-master': master }">
    <div class="vue-audio-mixer-strip-name">{{ label }}</div>

    <Knob v-if="showPan" :value="trackState.pan" @change="emit('updateTrackPan', $event)" />

    <template v-if="!master">
      <ReverbEffect :modelValue="trackState.reverb ?? 0" @update:modelValue="emit('updateTrackReverb', $event)" />

      <div class="vue-audio-mixer-toggles">
        <button
          type="button"
          class="vue-audio-mixer-toggle is-mute"
          :class="{ 'is-on': trackState.muted }"
          :aria-pressed="trackState.muted"
          :aria-label="`Mute ${label}`"
          @click="emit('mute', !trackState.muted)"
        >
          M
        </button>
        <button
          type="button"
          class="vue-audio-mixer-toggle is-solo"
          :class="{ 'is-on': trackState.soloed }"
          :aria-pressed="!!trackState.soloed"
          :aria-label="`Solo ${label}`"
          @click="emit('solo', !trackState.soloed)"
        >
          S
        </button>
      </div>
    </template>

    <div class="vue-audio-mixer-fader-section">
      <div class="vue-audio-mixer-meters" aria-hidden="true">
        <div class="vue-audio-mixer-meter"><div ref="leftLit" class="vue-audio-mixer-meter-lit"></div></div>
        <div class="vue-audio-mixer-meter"><div ref="rightLit" class="vue-audio-mixer-meter-lit"></div></div>
      </div>

      <div
        ref="faderRef"
        class="vue-audio-mixer-fader"
        role="slider"
        tabindex="0"
        :aria-label="`${label} level`"
        :aria-valuenow="db === -Infinity ? -100 : Number(db.toFixed(1))"
        :aria-valuetext="`${formatDb(db)} dB`"
        @pointerdown="onFaderDown"
        @pointermove="onFaderMove"
        @pointerup="onFaderUp"
        @pointercancel="onFaderUp"
        @dblclick="emit('updateTrackGain', 1)"
        @keydown="onFaderKeyDown"
      >
        <div class="vue-audio-mixer-fader-track"></div>
        <div class="vue-audio-mixer-fader-cap" :style="{ top: `${capPosition * 100}%` }">
          <div class="vue-audio-mixer-fader-cap-line"></div>
        </div>
      </div>

      <div class="vue-audio-mixer-scale" aria-hidden="true">
        <span v-for="(mark, i) in FADER_SCALE" :key="mark" :class="{ 'is-unity': mark === 0 }">
          {{ scaleLabel(mark, i) }}
        </span>
      </div>
    </div>

    <div class="vue-audio-mixer-db">
      {{ formatDb(db) }}<span class="vue-audio-mixer-db-unit">dB</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vue-audio-mixer-strip {
  width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 16px 10px 14px;
  background: var(--vam-strip-bg);
  border: 1px solid var(--vam-strip-border);
  border-radius: 12px;

  &.is-master {
    width: 112px;
    margin-left: 8px;
    background: var(--vam-master-bg);
    border-color: var(--vam-master-border);
  }
}

.vue-audio-mixer-strip-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--vam-strip-name);
  text-transform: capitalize;

  .is-master & {
    font-weight: 600;
    color: var(--vam-text-strong);
  }
}

.vue-audio-mixer-toggles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  width: 100%;
}

.vue-audio-mixer-toggle {
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: var(--vam-control-bg);
  color: var(--vam-control-text);
  font-family: var(--vam-font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &.is-mute.is-on {
    background: var(--vam-mute);
    color: var(--vam-on-mute);
  }

  &.is-solo.is-on {
    background: var(--vam-accent);
    color: var(--vam-on-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--vam-accent);
    outline-offset: 2px;
  }
}

.vue-audio-mixer-fader-section {
  margin-top: auto; // keeps faders aligned across strips with and without controls
  display: grid;
  grid-template-columns: 10px 28px 18px;
  gap: 6px;
  height: 300px;
  padding: 10px 0;

  .is-master & {
    grid-template-columns: 14px 28px 18px;
  }
}

.vue-audio-mixer-meters {
  display: flex;
  gap: 2px;
}

.vue-audio-mixer-meter {
  position: relative;
  flex: 1;
  overflow: hidden;
  border-radius: 2px;
  background: var(--vam-meter-off);
}

.vue-audio-mixer-meter-lit {
  position: absolute;
  inset: 0;
  background: var(--vam-meter-gradient);
  clip-path: inset(100% 0 0 0);
}

.vue-audio-mixer-fader {
  position: relative;
  cursor: ns-resize;
  touch-action: none;

  &:focus-visible {
    outline: 2px solid var(--vam-accent);
    outline-offset: 4px;
    border-radius: 4px;
  }
}

.vue-audio-mixer-fader-track {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--vam-fader-track);
}

.vue-audio-mixer-fader-cap {
  position: absolute;
  left: 0;
  width: 28px;
  height: 36px;
  margin-top: -18px;
  background: var(--vam-fader-cap);
  border: 1px solid var(--vam-fader-cap-border);
  border-radius: 6px;
  box-shadow: 0 2px 6px var(--vam-shadow);
}

.vue-audio-mixer-fader-cap-line {
  position: absolute;
  top: 50%;
  left: 5px;
  right: 5px;
  height: 2px;
  margin-top: -1px;
  border-radius: 1px;
  background: var(--vam-fader-cap-line);

  .is-master & {
    background: var(--vam-accent);
  }
}

.vue-audio-mixer-scale {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-family: var(--vam-font-mono);
  font-size: 9px;
  color: var(--vam-scale);

  span {
    display: flex;
    align-items: center;
    height: 0;
  }

  .is-unity {
    color: var(--vam-scale-unity);
  }
}

.vue-audio-mixer-db {
  display: flex;
  align-items: baseline;
  gap: 3px;
  font-family: var(--vam-font-mono);
  font-size: 13px;
  color: var(--vam-text);

  .is-master & {
    color: var(--vam-text-strong);
  }
}

.vue-audio-mixer-db-unit {
  font-size: 10px;
  color: var(--vam-text-muted);
}

// Compact layout: used on narrow screens, and always when size="small"
@mixin compact {
  .vue-audio-mixer-strip {
    width: 80px;
    gap: 10px;
    padding: 12px 8px 10px;

    &.is-master {
      width: 90px;
      margin-left: 4px;
    }
  }

  .vue-audio-mixer-strip-name {
    font-size: 12px;
  }

  .vue-audio-mixer-toggle {
    height: 26px;
    font-size: 12px;
  }

  .vue-audio-mixer-fader-section {
    grid-template-columns: 8px 24px 16px;
    gap: 4px;
    height: 220px;

    .is-master & {
      grid-template-columns: 10px 24px 16px;
    }
  }

  .vue-audio-mixer-fader-cap {
    width: 24px;
    height: 30px;
    margin-top: -15px;
  }

  .vue-audio-mixer-db {
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  @include compact;
}

.vue-audio-mixer--small {
  @include compact;
}
</style>
