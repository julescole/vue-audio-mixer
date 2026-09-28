<script setup lang="ts">
import { ref } from 'vue'

// Send level to the mixer's shared reverb bus, 0 to 1
const props = defineProps<{
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

// Show the percentage briefly while the slider is being moved
const updating = ref(false)
let updatingTimer: ReturnType<typeof setTimeout> | undefined

const onInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLInputElement).valueAsNumber)
  updating.value = true
  clearTimeout(updatingTimer)
  updatingTimer = setTimeout(() => {
    updating.value = false
  }, 2000)
}
</script>

<template>
  <div class="vue-audio-mixer-effects-control">
    <div class="effects-slider">
      <span class="effects-label" v-if="!updating">Reverb</span>
      <span class="effects-label updating" v-else>{{ (props.modelValue * 100).toFixed(0) }}%</span>

      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="props.modelValue"
        @input="onInput"
        :style="{ '--fill': props.modelValue * 100 + '%' }"
      />

      <span class="effects-percentage"></span>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Anonymous+Pro:wght@400;700&display=swap');

.vue-audio-mixer-effects-control {
  font-size: 0.8rem;
  color: white;
}

.effects-slider {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  z-index: 2;
}

.effects-label {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Anonymous Pro', serif;
  font-weight: 800;
  font-size: 1rem;
  color: white;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}

.effects-label.updating {
  color: white;
}


input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 80%;
  height: 22px;
  border-radius: 5px;
  background: linear-gradient(to right, rgb(116, 174, 235) var(--fill), #555 var(--fill));
  border: none;
  cursor: pointer;
  outline: none;
  transition: background 0.3s ease;
}

/* 🎯 **Only Apply These Fixes in Safari** */
@supports (-webkit-appearance: none) {
  input[type='range']::-webkit-slider-runnable-track {
    width: 100%;
    height: 0;
    background: linear-gradient(to right, rgb(116, 174, 235) var(--fill), #333 var(--fill));
    border-radius: 5px;
    border: none;
  }



  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;

    width: 0;
    height: 0;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.2);
    cursor: grab;
    position: relative;
  }
}
input[type='range']::-moz-range-thumb,
  input[type='range']::-ms-thumb {
    width: 0;
    height: 0;
  }



.effects-percentage {
  margin-top: 5px;
  font-size: 0.8rem;
}

/* **Mobile Adjustments** */
@media (max-width: 768px) {
  .effects-label {
    font-size: 0.7rem;
  }

  input[type='range'] {
    height: 16px;
  }
  .effects-label{
    top: -1px;

  }
}
</style>
