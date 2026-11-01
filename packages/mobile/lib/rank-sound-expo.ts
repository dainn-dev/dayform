import { createAudioPlayer, type AudioPlayer } from "expo-audio";

/** expo-audio glue for the rank-up chimes (untested). A step is a new stage or layer; a realm is a new great realm. */
export type RankSound = "step" | "realm";

const SOURCES: Record<RankSound, number> = {
  step: require("../assets/sounds/rank-step.wav"),
  realm: require("../assets/sounds/rank-realm.wav"),
};

const players: Partial<Record<RankSound, AudioPlayer>> = {};

/** Plays the chime from its start. Never throws: a missing audio system just means no sound. */
export function playRankSound(kind: RankSound): void {
  try {
    const player = players[kind] ?? (players[kind] = createAudioPlayer(SOURCES[kind]));
    void player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // No sound is better than a failed celebration.
  }
}
