export class SpeechProviderReachabilityError extends Error {
  readonly code = "speech_provider_direct_unreachable";

  constructor(readonly platform: "browser" | "desktop") {
    super("The client could not reach the speech provider directly.");
    this.name = "SpeechProviderReachabilityError";
  }
}
