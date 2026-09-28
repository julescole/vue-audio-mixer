<script lang="ts" setup>
import { defineProps, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  progress: number;
}>();

// Create a reactive property for the animated progress
const animatedProgress = ref(0);
let interval: ReturnType<typeof setInterval> | undefined;

// Watch the `progress` prop for changes
watch(
  () => props.progress,
  (newVal) => {
    const stepTime = 15; // Time in ms for each increment
    clearInterval(interval); // Only one animation at a time
    interval = setInterval(() => {
      if (animatedProgress.value < newVal) {
        animatedProgress.value++; // Increment up
      } else if (animatedProgress.value > newVal) {
        animatedProgress.value--; // Decrement down
      }

      // Check if close enough to the target and set directly
      if (Math.abs(animatedProgress.value - newVal) <= 1) {
        animatedProgress.value = Math.round(newVal);
        clearInterval(interval); // Stop the interval
      }
    }, stepTime);
  },
  { immediate: true } // Start watching immediately
);

onUnmounted(() => clearInterval(interval));
</script>

<template>
  <div class="vue-audio-mixer-loader">
    <p class="vue-audio-mixer-progress">{{ animatedProgress }}%</p>

    <div class="vue-audio-mixer-ajax-loader">
      <div class="vue-audio-mixer-ajax-loader-circle">
        <svg class="vue-audio-mixer-ajax-loader-circle-svg" viewBox="0 0 500 500">
          <circle cx="250" cy="250" r="239" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$loader_duration: 1.4s;
$loader_offset: 1570; // (2 x pie x r = 250 (from svg))

.vue-audio-mixer-loader {
  width: 100%;
  height: 100%;
}

.vue-audio-mixer-progress {
  width: 100%;
  text-align: center;
  top: 65px;
  position: relative;
  font-family: var(--vam-font-mono);
  font-size: 13px;
  color: var(--vam-text-muted);
}

.vue-audio-mixer-ajax-loader {
  position: relative;
  width: 100px;
  height: 100px;
  transform-origin: (50%, 50%);
  animation: ajaxLoaderSpin $loader_duration linear infinite;
  margin: 0 auto;
}

.vue-audio-mixer-ajax-loader-circle-svg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform-origin: (50%, 50%);
  animation: ajaxLoaderDashSpin $loader_duration ease-in-out infinite;
}

circle {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  animation: ajaxLoaderDash $loader_duration ease-in-out infinite;
  stroke: var(--vam-accent);
  stroke-dasharray: $loader_offset;
  stroke-width: 19;
  fill: none;
}

// Spinner
@keyframes ajaxLoaderSpin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(270deg);
  }
}

@keyframes ajaxLoaderDash {
  0% {
    stroke-dashoffset: $loader_offset;
  }
  50% {
    stroke-dashoffset: $loader_offset * 0.25;
  }
  100% {
    stroke-dashoffset: $loader_offset;
  }
}



@keyframes ajaxLoaderDashSpin {
  0% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(135deg);
  }
  100% {
    transform: rotate(450deg);
  }
}
</style>
