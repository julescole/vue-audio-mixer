<script setup lang="ts">
import { computed, ref } from 'vue'

// Send level to the mixer's shared reverb bus, 0 to 1. Looks like an on/off
// button: click toggles, dragging sideways sets the amount, double-click resets.
const props = defineProps<{
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const DEFAULT_LEVEL = 0.3
const DRAG_THRESHOLD = 3 // pixels before a press counts as a drag rather than a click
const KEY_STEP = 0.05

const clamp = (value: number) => Math.min(Math.max(value, 0), 1)

const percent = computed(() => Math.round(props.modelValue * 100))
const isOn = computed(() => props.modelValue > 0)

// Remember the level while switched off, so toggling back on restores it
let lastLevel = props.modelValue > 0 ? props.modelValue : DEFAULT_LEVEL

const set = (value: number) => {
  if (value > 0) lastLevel = value
  emit('update:modelValue', value)
}

const toggle = () => set(isOn.value ? 0 : lastLevel)

const dragging = ref(false)
let press: { startX: number; startValue: number; width: number } | null = null

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  press = { startX: event.clientX, startValue: props.modelValue, width: target.offsetWidth }
}

const onPointerMove = (event: PointerEvent) => {
  if (!press) return
  const dx = event.clientX - press.startX
  if (!dragging.value && Math.abs(dx) < DRAG_THRESHOLD) return
  dragging.value = true
  set(clamp(press.startValue + dx / press.width))
}

const onPointerUp = () => {
  if (press && !dragging.value) toggle()
  press = null
  dragging.value = false
}

const onPointerCancel = () => {
  press = null
  dragging.value = false
}

const onKeyDown = (event: KeyboardEvent) => {
  const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }
  if (event.key === 'Enter' || event.key === ' ') toggle()
  else if (event.key in steps) set(clamp(props.modelValue + steps[event.key] * KEY_STEP))
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    class="vue-audio-mixer-send"
    :class="{ 'is-on': isOn }"
    role="slider"
    tabindex="0"
    aria-label="Reverb send"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :aria-valuetext="`${percent}%`"
    :style="{ '--level': `${percent}%` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @dblclick="set(0)"
    @keydown="onKeyDown"
  >
    {{ dragging ? `${percent}%` : 'Reverb' }}
  </div>
</template>

<style lang="scss" scoped>
.vue-audio-mixer-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 28px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: var(--vam-control-bg);
  color: var(--vam-control-text);
  font-family: var(--vam-font-sans);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  touch-action: none;
  user-select: none;

  &.is-on {
    border-color: var(--vam-accent);
    color: var(--vam-accent);
    // The fill shows how much signal is sent
    background: linear-gradient(to right, var(--vam-accent-soft) var(--level), transparent var(--level));
  }

  &:focus-visible {
    outline: 2px solid var(--vam-accent);
    outline-offset: 2px;
  }
}

// Compact layout: used on narrow screens, and always when size="small"
@mixin compact {
  .vue-audio-mixer-send {
    height: 24px;
    font-size: 11px;
  }
}

@media (max-width: 768px) {
  @include compact;
}

.vue-audio-mixer--small {
  @include compact;
}
</style>
