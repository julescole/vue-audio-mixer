<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, defineProps, watch, defineEmits, computed, nextTick } from 'vue'

const props = defineProps<{
  recording: { time: number; type: string; track: string | 'master'; value: any }[],
  masterState: {
    duration: number
    elapsed: number
  }
  context: AudioContext
  audioBuffers: Record<string, AudioBuffer>
  playbackState: {
    isPlaying: boolean
    soloActive: boolean
  }
  trackStates: Record<
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
}>()

const waveformWidth = ref(500); // Default width
const waveformCanvasContainer = ref<HTMLDivElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

const updateWaveformWidth = () => {
  nextTick(() => {
    waveformWidth.value = waveformCanvasContainer.value?.clientWidth || 500;
    preComputedWaveform(); // Update precomputed waveform whenever the width changes
  });
};

const updateWindowSize = () => {
  windowWidth.value = window.innerWidth;
  windowHeight.value = window.innerHeight;
};

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

const emit = defineEmits(['seek'])

watch(
  () => props.masterState.elapsed,
  () => {
    drawWaveform()
  },
)

watch(() => props.recording, () => {
  precomputeAutomationStates();
}, { deep: true });

watch(waveformWidth, () => {
  precomputeAutomationStates();
});

const waveformCanvas = ref<HTMLCanvasElement | null>(null)


const waveforms = reactive<Record<string, number[]>>({})

const drawAutomationMarkers = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.strokeStyle = '#7679cf';
  ctx.lineWidth = 2;

  automationMarkers.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, height - (height/2)-4);
    ctx.lineTo(x, height - (height/2)+4);
    ctx.stroke();
  });
};


// Precomputed automation states for fast lookup
const automationStates = reactive<Record<string, { volume: number[]; pan: number[] }>>({});
  const automationMarkers = reactive<number[]>([]); // Store x-positions of markers

  const precomputeAutomationStates = () => {
  console.time("Precomputing Automation");

  const numSamples = waveformWidth.value; // Number of pixels in the waveform
  const duration = props.masterState.duration;
  if (!duration || numSamples <= 0) return;

  automationMarkers.length = 0; // Clear previous markers

  // Initialize empty automation state arrays
  Object.keys(props.trackStates).forEach((track) => {
    automationStates[track] = {
      volume: new Array(numSamples).fill(1),
      pan: new Array(numSamples).fill(0),
    };
  });

  // Process automation events into precomputed time slices
  props.recording.forEach(({ time, type, track, value }) => {
    if (!automationStates[track]) return;
    const index = Math.floor((time / duration) * numSamples);
    if (index < 0 || index >= numSamples) return;

    if (type === "volume") {
      automationStates[track].volume[index] = value;
    } else if (type === "pan") {
      automationStates[track].pan[index] = value;
    }

    // Store marker positions for drawing later
    const markerX = Math.floor((time / duration) * waveformWidth.value);
    if (!automationMarkers.includes(markerX)) {
      automationMarkers.push(markerX);
    }
  });

  // Fill in gaps by propagating last known values
  Object.keys(automationStates).forEach((track) => {
    let lastVolume = 1;
    let lastPan = 0;
    for (let i = 0; i < numSamples; i++) {
      if (automationStates[track].volume[i] !== 1) lastVolume = automationStates[track].volume[i];
      automationStates[track].volume[i] = lastVolume;

      if (automationStates[track].pan[i] !== 0) lastPan = automationStates[track].pan[i];
      automationStates[track].pan[i] = lastPan;
    }
  });

  console.timeEnd("Precomputing Automation");
};


const drawWaveform = () => {

  const canvas = waveformCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = waveformWidth.value ?? 0;
  const width = canvas.width;
  const height = canvas.height;
  const midY = height / 2;

  ctx.clearRect(0, 0, width, height);

  const combinedData: number[] = new Array(width).fill(0);
  let totalWeight = 0;

  // Iterate through each track and apply precomputed automation
  Object.entries(waveforms).forEach(([label, waveform]) => {
    if (!props.trackStates[label]) return;

    for (let i = 0; i < waveform.length; i++) {
      const time = (i / width) * props.masterState.duration; // Calculate time for this pixel
      const index = Math.floor((time / props.masterState.duration) * width);

      const volume = automationStates[label]?.volume[index] ?? 1;
      const pan = automationStates[label]?.pan[index] ?? 0;

      const adjustedAmplitude = waveform[i] * volume * (pan === 0 ? 1 : 1 - Math.abs(pan));
      combinedData[i] += adjustedAmplitude;
    }

    totalWeight++;
  });

  // Normalize combined waveform
  if (totalWeight > 0) {
    for (let i = 0; i < combinedData.length; i++) {
      combinedData[i] /= totalWeight;
    }
  }

  // Find max amplitude
  const maxAmplitude = Math.max(...combinedData);
  const normalizedData = combinedData.map((value) => (value / maxAmplitude) * height);

  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#2275E8');
  gradient.addColorStop(0.5, '#00D6FD');
  gradient.addColorStop(1, '#0995FF');


  const progressGradient = ctx.createLinearGradient(0, 0, width, 0)
      progressGradient.addColorStop(0, '#193CF0') // Start color
      progressGradient.addColorStop(0.5, '#0077FD') // Start color
      progressGradient.addColorStop(1, '#0332FF') // End color




  ctx.fillStyle = gradient;

  // Draw waveform with automation effects
  for (let i = 0; i < normalizedData.length; i++) {
    const x = i;
    const y = midY - normalizedData[i] / 2;
    const barHeight = normalizedData[i];

    const progressX = (props.masterState.elapsed / props.masterState.duration) * width;
    ctx.fillStyle = x < progressX ? progressGradient : gradient;
    ctx.fillRect(x, y, 1, barHeight);
  }
  drawAutomationMarkers(ctx, width, height);

};




const preComputedWaveform = () => {

  const width = waveformCanvasContainer.value?.clientWidth

  if (width === undefined) return

  if (waveformCanvas.value === null) return

  waveformCanvas.value.width = width

  for (const [label, audioBuffer] of Object.entries(props.audioBuffers)) {
    // Precompute waveform
    const leftChannel = audioBuffer.getChannelData(0)
    const rightChannel = audioBuffer.getChannelData(1) || new Float32Array(leftChannel.length)
    const samplesPerPixel = Math.floor(leftChannel.length / (waveformCanvas.value?.width || 1))

    const waveform = Array.from({ length: waveformCanvas.value?.width || 0 }, (_, i) => {
      const start = i * samplesPerPixel
      const end = start + samplesPerPixel

      const leftSegment = leftChannel.slice(start, end)
      const rightSegment = rightChannel.slice(start, end)

      const avgLeft =
        leftSegment.reduce((sum, value) => sum + Math.abs(value), 0) / leftSegment.length
      const avgRight =
        rightSegment.reduce((sum, value) => sum + Math.abs(value), 0) / rightSegment.length

      return (avgLeft + avgRight) / 2 // Average the two channels
    })

    waveforms[label] = waveform
  }
  nextTick(() => {
    drawWaveform()
  })
}

const handleSeek = (event: MouseEvent) => {
  const canvas = waveformCanvas.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const cssWidth = rect.width
  const logicalWidth = canvas.width

  const logicalClickX = (clickX / cssWidth) * logicalWidth

  const percentage = logicalClickX / logicalWidth
  emit('seek', percentage)
}

// Format time as MM:SS:ms
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return [
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    ms.toString().padStart(3, '0'),
  ].join(':')
}

onUnmounted(() => {
  if (resizeObserver && waveformCanvasContainer.value) {
    resizeObserver.unobserve(waveformCanvasContainer.value);
  }
});


onMounted(() => {
  const maxRetries = 10 // Maximum number of retries
  let attempts = 0




  const ensureContainerIsReady = () => {
    attempts++

    if (waveformCanvasContainer.value) {


      if (waveformCanvasContainer.value) {
        // Initialize the ResizeObserver
        resizeObserver = new ResizeObserver(() => {
          updateWaveformWidth();
        });

        // Observe the container element
        resizeObserver.observe(waveformCanvasContainer.value);
      }



    } else if (attempts < maxRetries) {
      setTimeout(ensureContainerIsReady, 500) // Retry after 50ms
    } else {
      console.warn('waveformCanvasContainer is not ready after max retries.')
    }
  }

  ensureContainerIsReady()
})
</script>

<template>
  <div class="vue-audio-mixer-master-transport" ref="waveformCanvasContainer">


    <p class="vue-audio-mixer-master-time">
      {{ formatTime(masterState.elapsed || 0) }} /
      {{ formatTime(masterState.duration || 0) }}
    </p>
    <canvas
      ref="waveformCanvas"
      :width="waveformWidth"
      height="80"
      class="vue-audio-mixer-waveform-canvas"
      @click="handleSeek"
    ></canvas>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Anonymous+Pro:ital,wght@0,400;0,700;1,400;1,700&display=swap');

p{
  margin: 0;
}

button{
  margin: 0;
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  font-size: 1rem;
  line-height: 1rem;
}

.vue-audio-mixer-master-transport {
  width: 100%;
  font-family: 'Anonymous Pro', serif;
  font-weight: 400;
  font-style: normal;
}
.vue-audio-mixer-master-time {
  text-align: center;
  width: 100%;
  margin-bottom: 1rem;
}
.vue-audio-mixer-anonymous-pro-regular {
  font-family: 'Anonymous Pro', serif;
  font-weight: 400;
  font-style: normal;
}

.vue-audio-mixer-anonymous-pro-bold {
  font-family: 'Anonymous Pro', serif;
  font-weight: 700;
  font-style: normal;
}

.vue-audio-mixer-anonymous-pro-regular-italic {
  font-family: 'Anonymous Pro', serif;
  font-weight: 400;
  font-style: italic;
}

.vue-audio-mixer-anonymous-pro-bold-italic {
  font-family: 'Anonymous Pro', serif;
  font-weight: 700;
  font-style: italic;
}
</style>
