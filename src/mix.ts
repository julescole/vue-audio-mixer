export interface AudibilityInput {
  id: string
  hidden: boolean
  muted: boolean
  soloed: boolean
}

/**
 * Which tracks are heard. Mute always wins; while any visible track is soloed,
 * only soloed tracks play. Hidden tracks have no solo button, so solo leaves them alone.
 */
export const computeAudible = (tracks: readonly AudibilityInput[]): Record<string, boolean> => {
  const soloActive = tracks.some((track) => !track.hidden && track.soloed)
  const audible: Record<string, boolean> = {}
  for (const track of tracks) {
    audible[track.id] = !track.muted && (track.hidden || !soloActive || track.soloed)
  }
  return audible
}
