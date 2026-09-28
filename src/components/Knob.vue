<script setup lang="ts">
import { computed } from 'vue'

// Pan knob: -1 (left) to 1 (right). Drag vertically, double-click to centre.
const props = defineProps<{
  value: number
}>()

const emit = defineEmits<{
  change: [value: number]
}>()

const DRAG_PIXELS = 120 // pointer travel for a full left-to-right sweep
const KEY_STEP = 0.05

const clamp = (value: number) => Math.min(Math.max(value, -1), 1)

const label = computed(() => {
  if (props.value < -0.02) return `L${Math.round(-props.value * 100)}`
  if (props.value > 0.02) return `R${Math.round(props.value * 100)}`
  return 'C'
})

let drag: { startY: number; startValue: number } | null = null

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag = { startY: event.clientY, startValue: props.value }
}

const onPointerMove = (event: PointerEvent) => {
  if (!drag) return
  emit('change', clamp(drag.startValue + (drag.startY - event.clientY) / DRAG_PIXELS))
}

const onPointerUp = () => {
  drag = null
}

const onKeyDown = (event: KeyboardEvent) => {
  const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }
  if (event.key === 'Home') emit('change', 0)
  else if (event.key in steps) emit('change', clamp(props.value + steps[event.key] * KEY_STEP))
  else return
  event.preventDefault()
}
</script>

<template>
  <div class="vue-audio-mixer-knob">
    <div
      class="vue-audio-mixer-knob-dial"
      role="slider"
      tabindex="0"
      aria-label="Pan"
      aria-valuemin="-100"
      aria-valuemax="100"
      :aria-valuenow="Math.round(value * 100)"
      :aria-valuetext="label"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="emit('change', 0)"
      @keydown="onKeyDown"
    >
      <div class="vue-audio-mixer-knob-arm" :style="{ transform: `rotate(${value * 135}deg)` }">
        <div class="vue-audio-mixer-knob-pointer"></div>
      </div>
    </div>
    <div class="vue-audio-mixer-knob-label">{{ label }}</div>
  </div>
</template>

<style lang="scss" scoped>
.vue-audio-mixer-knob {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.vue-audio-mixer-knob-dial {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--vam-knob-bg);
  border: 1px solid var(--vam-knob-border);
  cursor: ns-resize;
  touch-action: none;

  &:focus-visible {
    outline: 2px solid var(--vam-accent);
    outline-offset: 2px;
  }
}

.vue-audio-mixer-knob-arm {
  position: absolute;
  inset: 0;
}

.vue-audio-mixer-knob-pointer {
  position: absolute;
  left: 50%;
  top: 5px;
  width: 2px;
  height: 12px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--vam-knob-pointer);
}

.vue-audio-mixer-knob-label {
  font-family: var(--vam-font-mono);
  font-size: 11px;
  color: var(--vam-knob-label);
}

// Compact layout: used on narrow screens, and always when size="small"
@mixin compact {
  .vue-audio-mixer-knob-dial {
    width: 36px;
    height: 36px;
  }

  .vue-audio-mixer-knob-pointer {
    top: 4px;
    height: 10px;
  }
}

@media (max-width: 768px) {
  @include compact;
}

.vue-audio-mixer--small {
  @include compact;
}
</style>
