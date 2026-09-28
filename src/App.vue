<script setup lang="ts">
import { shallowRef } from 'vue'
import AudioMixer from './components/Mixer.vue'
import type { MixerConfig } from './config'

const config = shallowRef<MixerConfig>({
  tracks: [
    { id: 'flutes', name: 'Flutes', src: '/tracks/flutes.mp3' },
    { id: 'piano', name: 'Piano', src: '/tracks/piano.mp3', pan: -0.3 },
    { id: 'bass', name: 'Bass', src: '/tracks/bass.mp3' },
    { id: 'perc', name: 'Perc', src: '/tracks/perc.mp3', pan: 0.3 },
    { id: 'strings', name: 'Strings', src: '/tracks/strings.mp3', reverb: 0.3 },
  ],
})
</script>

<template>
  <main>
    <div>
      <AudioMixer v-model:config="config" />
    </div>
    <pre>{{ config }}</pre>
  </main>
</template>

<style scoped></style>
