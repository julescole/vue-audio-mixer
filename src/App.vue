<script setup lang="ts">
import AudioMixer from './components/Mixer.vue'

const tracks = [
{ path: '/tracks/sj-violin1.mp3', label: 'Violin 1' },
{ path: '/tracks/sj-violin2.mp3', label: 'Violin 2' },
{ path: '/tracks/sj-viola.mp3', label: 'Viola' },
{ path: '/tracks/sj-cello.mp3', label: 'Cello' },
{ path: '/tracks/sj-piano.mp3', label: 'Piano' },
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
