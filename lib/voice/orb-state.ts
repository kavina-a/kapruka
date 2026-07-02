export type VoiceOrbState = "idle" | "listening" | "speaking" | "thinking";

export function resolveVoiceOrbState(options: {
  connected: boolean;
  connecting: boolean;
  speaker: "bot" | "user" | null;
}): VoiceOrbState {
  if (options.connecting) return "thinking";
  if (!options.connected) return "idle";
  if (options.speaker === "bot") return "speaking";
  if (options.speaker === "user") return "listening";
  return "idle";
}
