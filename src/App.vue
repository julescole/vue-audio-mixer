<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import AudioMixer from './components/Mixer.vue'
import type { MixerConfig } from './config'

// Local copies in development (public/tracks, gitignored); the hosted files in production builds
const tracksUrl = import.meta.env.DEV ? '/tracks' : 'https://beta.audiomixer.io/tracks'

const config = shallowRef<MixerConfig>({
  tracks: [
    { id: 'flutes', name: 'Flutes', src: `${tracksUrl}/flutes.mp3` },
    { id: 'piano', name: 'Piano', src: `${tracksUrl}/piano.mp3`, pan: -0.3 },
    { id: 'bass', name: 'Bass', src: `${tracksUrl}/bass.mp3` },
    { id: 'perc', name: 'Perc', src: `${tracksUrl}/perc.mp3`, pan: 0.3 },
    { id: 'strings', name: 'Strings', src: `${tracksUrl}/strings.mp3`, reverb: 0.3 },
  ],
})

const size = ref<'small' | 'medium'>('medium')
const theme = ref<'dark' | 'light'>('dark')
const showPan = ref(true)
const showTotalTime = ref(true)
</script>

<template>
  <main class="demo" :class="`demo--${theme}`">
    <form class="demo-options" @submit.prevent>
      <label>
        Size
        <select v-model="size">
          <option value="medium">Medium</option>
          <option value="small">Small</option>
        </select>
      </label>
      <label>
        Theme
        <select v-model="theme">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label><input type="checkbox" v-model="showPan" /> Show pan</label>
      <label><input type="checkbox" v-model="showTotalTime" /> Show total time</label>
    </form>

    <AudioMixer
      v-model:config="config"
      title="Audio Mixer"
      :size="size"
      :theme="theme"
      :showPan="showPan"
      :showTotalTime="showTotalTime"
    />

    <details class="demo-config">
      <summary>Current config</summary>
      <pre>{{ config }}</pre>
    </details>
  </main>
</template>

<style scoped>
.demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  min-height: 100vh;
  padding: 32px 16px;
  background: #0c0c0d;
  color: #a0a0a5;
}

.demo--light {
  background: #e4e4e7;
  color: #3f3f46;
}

.demo-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 20px;
  font-size: 13px;
}

.demo-options label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.demo-config {
  width: min(720px, 100%);
  font-size: 13px;
}

.demo-config summary {
  cursor: pointer;
}

.demo-config pre {
  overflow: auto;
  max-height: 360px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
}
</style>
