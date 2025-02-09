<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineProps, watch } from 'vue'
import hallWavPath from '../assets/audio/Hall.wav';

const props = defineProps<{
  context: AudioContext
  analyserNodes: { left: AnalyserNode; right: AnalyserNode }
}>()

const reverbLevel = ref(0) // Default reverb level (50% wet, 50% dry)
const convolverNode = ref<ConvolverNode | null>(null)
const wetGainNode = ref<GainNode | null>(null)
const dryGainNode = ref<GainNode | null>(null)

const updating = ref(false)

watch(updating, (newVal) => {
  if (!newVal) return
  setTimeout(() => {
    updating.value = false
  }, 2000)
})

const isConnected = ref(false) // Track connection state

const loadImpulseResponse = async () => {
  try {
    const response = await fetch(hallWavPath);
    const arrayBuffer = await response.arrayBuffer();

    if (!convolverNode.value) {
      convolverNode.value = props.context.createConvolver();
    }

    // ✅ Safari fix for Web Audio API decoding
    props.context.decodeAudioData(
      arrayBuffer,
      (buffer) => {
        convolverNode.value!.buffer = buffer;
        wetGainNode.value = props.context.createGain();
        dryGainNode.value = props.context.createGain();
        connectNodes();
      },
      (error) => console.error("Error decoding audio:", error)
    );
  } catch (error) {
    console.error('Error loading impulse response:', error);
  }
}

const connectNodes = () => {
  if (!isConnected.value && wetGainNode.value && dryGainNode.value && convolverNode.value) {
    props.analyserNodes.left.connect(dryGainNode.value)
    props.analyserNodes.right.connect(dryGainNode.value)
    dryGainNode.value.connect(props.context.destination)

    props.analyserNodes.left.connect(convolverNode.value)
    props.analyserNodes.right.connect(convolverNode.value)
    convolverNode.value.connect(wetGainNode.value)
    wetGainNode.value.connect(props.context.destination)

    isConnected.value = true
  }
}

const updateReverbLevel = (level: number) => {
  updating.value = true
  if (wetGainNode.value && dryGainNode.value) {
    wetGainNode.value.gain.value = level
    dryGainNode.value.gain.value = 1 - level
  }
}

const disconnectNodes = () => {
  if (isConnected.value && wetGainNode.value && dryGainNode.value && convolverNode.value) {
    try {
      props.analyserNodes.left.disconnect(dryGainNode.value)
      props.analyserNodes.right.disconnect(dryGainNode.value)
      dryGainNode.value.disconnect(props.context.destination)

      props.analyserNodes.left.disconnect(convolverNode.value)
      props.analyserNodes.right.disconnect(convolverNode.value)
      convolverNode.value.disconnect(wetGainNode.value)
      wetGainNode.value.disconnect(props.context.destination)

      isConnected.value = false
    } catch (error) {
      console.error('Error disconnecting nodes:', error)
    }
  }
}

onMounted(() => {
  loadImpulseResponse()
})

onUnmounted(() => {
  disconnectNodes()
})
</script>

<template>
  <div class="vue-audio-mixer-effects-control">
    <div class="effects-slider">
      <span class="effects-label" v-if="!updating">Reverb</span>
      <span class="effects-label updating" v-else>{{ (reverbLevel * 100).toFixed(0) }}%</span>

      <input
        id="reverb-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        v-model="reverbLevel"
        @input="updateReverbLevel(($event.target as HTMLInputElement).valueAsNumber)"
        :style="{ '--fill': (reverbLevel * 100) + '%' }"
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
