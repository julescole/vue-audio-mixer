<script lang="ts" setup>
import { defineProps, defineEmits, ref } from 'vue'

interface KnobProps {
  rotation: number // Now expects a value between -1 and 1
  color: string
  active: boolean
  style: number
}

// Refs for the paths
const leftPathRef = ref<SVGPathElement | null>(null)
const rightPathRef = ref<SVGPathElement | null>(null)

// Reactive variables for path lengths
const leftPathLength = ref(125.6) // Default value
const rightPathLength = ref(125.6) // Default value

const props = defineProps<KnobProps>()
const emit = defineEmits<{
  (e: 'update:rotation', rotation: number): void
}>()

// Calculate stroke lengths dynamically
const calculateLeftStrokeLength = () => {
  if (leftPathRef.value) {
    leftPathLength.value = leftPathRef.value.getTotalLength()
  }

  return props.rotation < 0 ? leftPathLength.value * Math.abs(props.rotation) : 0
}

const calculateRightStrokeLength = () => {
  if (rightPathRef.value) {
    rightPathLength.value = rightPathRef.value.getTotalLength()
  }
  return props.rotation > 0 ? rightPathLength.value * props.rotation : 0
}

// State
let currentY = 0

let internalRotation = props.rotation * 132

// Methods
const onMouseDown = (event: MouseEvent) => {
  currentY = event.pageY
  const onMouseMove = (e: MouseEvent) => {
    const delta = e.pageY - currentY
    currentY = e.pageY

    // Convert prop rotation (-1 to 1) to internal rotation (-132 to 132)
    internalRotation = props.rotation * 132

    // Update internal rotation
    internalRotation -= delta
    internalRotation = Math.max(-132, Math.min(internalRotation, 132)) // Clamp values

    // Convert internal rotation (-132 to 132) back to normalized value (-1 to 1)
    const newRotation = internalRotation / 132
    emit('update:rotation', newRotation)
  }

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div :class="['vue-audio-mixer-rela-inline', 'vue-audio-mixer-knob', `style${style}`]">
    <div class="vue-audio-mixer-rela-block vue-audio-mixer-knob-dial" :style="{ color: active ? color : '#888' }">
      <div
        class="vue-audio-mixer-abs-center vue-audio-mixer-dial-grip"
        :style="{ transform: `translate(-50%,-50%) rotate(${internalRotation}deg)` }"
        @mousedown="onMouseDown"
      ></div>
      <svg class="vue-audio-mixer-dial-svg" viewBox="0 0 100 100">
        <!-- Background arc (right-hand path) -->
        <path d="M50,10 A 40 40 0 0 0 20,75" fill="none" stroke="#55595C" />
        <path d="M50,10 A 40 40 0 0 1 80,75" fill="none" stroke="#55595C" />

        <!-- Left arc -->
        <path
          ref="leftPathRef"
          d="M50,10 A 40 40 0 0 0 20,75"
          fill="none"
          :stroke="active ? color : '#888'"
          :style="{
            strokeDasharray: `${calculateLeftStrokeLength()} ${leftPathLength}`,
            strokeDashoffset: '0',
          }"
        />

        <!-- Right arc -->
        <path
          ref="rightPathRef"
          d="M50,10 A 40 40 0 0 1 80,75"
          fill="none"
          :stroke="active ? color : '#888'"
          :style="{
            strokeDasharray: `${calculateRightStrokeLength()} ${rightPathLength}`,
            strokeDashoffset: '0',
          }"
        />
      </svg>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// --- COLORS ---
$grey: '#888';
$darkgrey: #55595c;
$dark: #2c2d2f;
$black: #181b1c;

// Positioning Mixin
@mixin setup($pos, $top: null, $right: null, $bottom: null, $left: null) {
  position: $pos;
  top: $top;
  left: $left;
  right: $right;
  bottom: $bottom;
}

// --- SETUP STUFF ---
* {
  box-sizing: border-box;
  transition: 0.3s cubic-bezier(0.6, 0, 0.2, 1);
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

.vue-audio-mixer-abs-center {
  @include setup(absolute, 50%, null, null, 50%);
  transform: translate(-50%, -50%);
}




.vue-audio-mixer-rela-block {
  display: block;
  position: relative;
}

.vue-audio-mixer-rela-inline {
  display: inline-block;
  position: relative;
}

.left {
  position: relative;
  float: left;
}

.right {
  position: relative;
  float: right;
}

// --- PAGE STYLING ---
.container {
  margin: 20px auto;
  max-width: 700px;
  text-align: center;
}

.effect-container {
  width: 140px;
  border-radius: 3px;
  text-align: center;
  margin: 0 10px 20px;

  &.wide {
    width: auto;
  }

  .knob {
    padding: 0;
    margin: 0 0 10px;
  }
}

.effect-label {
  user-select: none;
  padding: 10px 0 10px 10px;
  border-bottom: 4px solid $black;
}

.effect-active-light {
  @include setup(absolute, 50%, null, null, 10px);
  transform: translateY(-50%);
  height: 10px;
  width: 10px;
  border-radius: 100%;
}

.knob-container {
  padding: 10px 0;
}

.vue-audio-mixer-knob {
  border-radius: 3px;
  display: flex;
  justify-content: center;

  &.style1 {
    .vue-audio-mixer-dial-grip {
      cursor: pointer;
      height: 50px;
      width: 50px;
      border: 6px solid $black;

      &::after {
        @include setup(absolute, 5px, null, null, 50%);
        height: 10px;
        background-color: #e4e8ea; // or currentColor
      }
    }
  }

  &.style2 {
    .vue-audio-mixer-dial-svg {
      stroke-width: 2.5;
    }

    .vue-audio-mixer-dial-grip {
      height: 60px;
      width: 60px;
      background-color: $grey;

      &::after {
        height: 15px;
        background-color: $dark;
      }
    }
  }

  &.style3 {
    .vue-audio-mixer-dial-svg {
      stroke-width: 2.75;
    }

    .vue-audio-mixer-dial-grip {
      z-index: 5;
      height: 82px;
      width: 82px;
      transition: 0.3s cubic-bezier(0, 0, 0.24, 1);

      &::after {
        height: 25px;
        width: 3px;
        border-radius: 4px;
        background-color: currentColor;
        // background-color: #FFF;
      }
    }
  }
}

.knob-active-light {
  @include setup(absolute, 12px, null, null, 12px);
  height: 10px;
  width: 10px;
  border-radius: 100%;
}

.vue-audio-mixer-knob-dial {
  height: 80px;
  width: 80px;
  text-align: left !important; // SVG position breaks without this
  transition: 0s;
}

.vue-audio-mixer-dial-grip {
  border-radius: 100%;
  transition: 0s;

  &::after {
    content: '';
    @include setup(absolute, 0, null, null, 50%);
    width: 2px;
    transform: translateX(-50%);
  }
}

.vue-audio-mixer-dial-svg {
  pointer-events: none;
  position: absolute;
  stroke-width: 5;
  stroke-dasharray: 184 184;
  stroke-linecap: round !important;

  path {
    transition: 0s cubic-bezier(0, 0, 0.24, 1);
  }
}


</style>
