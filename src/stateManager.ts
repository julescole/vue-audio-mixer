import { reactive } from 'vue';

export const trackStates = reactive<Record<string, {
  muted: boolean,
  soloed: boolean,
  pan: number,
  volume: number,
  elapsed: number,
  duration: number,
  wetGainNode?: GainNode,
  dryGainNode?: GainNode,
  reverbLevel: number,
}>>({})
