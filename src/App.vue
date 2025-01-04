<script setup lang="ts">
import AudioMixer from './components/Mixer.vue'

const tracks = [
  { path: '/tracks/flutes.mp3', label: 'flutes' },

  { path: '/tracks/perc.mp3', label: 'perc' },
  { path: '/tracks/stereo-test.mp3', label: 'stereo' },
  { path: '/tracks/strings.mp3', label: 'strings' },
]
</script>

<template>
  <main>
    <div>
      <AudioMixer :tracks="tracks" />
    </div>
  </main>
</template>

<style scoped></style>
