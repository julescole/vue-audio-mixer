<script lang="ts" setup>
import { defineProps, ref, watch } from 'vue';

const props = defineProps<{
  progress: number;
}>();

// Create a reactive property for the animated progress
const animatedProgress = ref(0);

// Watch the `progress` prop for changes
watch(
  () => props.progress,
  (newVal, oldVal) => {
    const stepTime = 15; // Time in ms for each increment
    const interval = setInterval(() => {
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
  font-size: 1rem;
  color: #fff;
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
  animation: ajaxLoaderColors ($loader_duration * 4) ease-in-out infinite,
    ajaxLoaderDash $loader_duration ease-in-out infinite;
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

@keyframes ajaxLoaderColors {
  0% {
    stroke: #2275e8;
  }
  25% {
    stroke: #00d6fd;
  }
  50% {
    stroke: #0995ff;
  }
  75% {
    stroke: #2275e8;
  }
  100% {
    stroke: #00d6fd;
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

p{
  margin: 0 !important;
  font-family: 'Anonymous Pro', serif;
  font-weight: 600;

}

button{
  margin: 0;
  font-family: 'Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  font-size: 1rem;
  line-height: 1rem;
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
