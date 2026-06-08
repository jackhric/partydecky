// Plays the Steam Deck UI join/leave sounds. The audio is bundled as base64 data
// URIs (see soundData.ts, sourced from assets/sounds/) so playback depends on
// nothing external — no Steam internals, no asset serving, no backend. Each call
// is guarded so a playback hiccup never throws into the caller.

import { joinSoundUri, leaveSoundUri } from "./soundData";

function makePlayer(uri: string): () => void {
  const audio = new Audio(uri);
  return () => {
    try {
      audio.currentTime = 0; // restart so rapid repeats still sound
      void audio.play();
    } catch {
      /* best-effort */
    }
  };
}

export const playJoinSound = makePlayer(joinSoundUri);
export const playLeaveSound = makePlayer(leaveSoundUri);
