import AudioMixer from './components/Mixer.vue'

export { AudioMixer }
export { normalizeConfig, GAIN_MAX } from './config'
export type {
  AudioSource,
  BooleanLane,
  MasterAutomation,
  MasterConfig,
  MixerConfig,
  NormalizeResult,
  NumberLane,
  ResolvedMaster,
  ResolvedMixerConfig,
  ResolvedTrack,
  TrackAutomation,
  TrackConfig,
} from './config'
export default AudioMixer
