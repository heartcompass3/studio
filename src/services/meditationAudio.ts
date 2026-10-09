export interface VoiceAudioEffects {
  /** Capture suppression and a gentle expander between speech phrases. */
  noiseReduction?: boolean;
  bassDb: number;
  reverbMix: number;
}

export const VOICE_AUDIO_PRESETS = {
  speech: { bassDb: 0, reverbMix: 0, noiseReduction: true },
  meditation: { bassDb: 3, reverbMix: 0.15, noiseReduction: true },
} satisfies Record<string, VoiceAudioEffects>;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));

/** Shared graph for live recording and OfflineAudioContext signal tests. */
export function createVoiceAudioGraph(
  context: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  initialGain: number,
  effects: VoiceAudioEffects,
) {
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 80;
  const bass = context.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 160;
  const gain = context.createGain();
  gain.gain.value = clamp(initialGain, 0.5, 5);
  const speechCompressor = context.createDynamicsCompressor();
  speechCompressor.threshold.value = -24;
  speechCompressor.knee.value = 30;
  speechCompressor.ratio.value = 4;
  speechCompressor.attack.value = 0.003;
  speechCompressor.release.value = 0.25;

  const dry = context.createGain();
  const convolver = context.createConvolver();
  const wet = context.createGain();
  const reverbLowpass = context.createBiquadFilter();
  reverbLowpass.type = 'lowpass';
  reverbLowpass.frequency.value = 4200;
  // Deterministic stereo room response; short pre-delay preserves speech clarity.
  const length = Math.ceil(context.sampleRate * 1.8);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let seed = 98765 + channel * 77;
    const preDelay = Math.round(context.sampleRate * 0.025);
    for (let i = preDelay; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      data[i] = noise * Math.pow(1 - i / length, 3);
    }
  }
  convolver.buffer = impulse;
  // A limiter after dry/wet summation catches peaks added by bass and reverb.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.15;

  input.connect(highpass);
  highpass.connect(bass);
  bass.connect(gain);
  gain.connect(speechCompressor);
  speechCompressor.connect(dry);
  speechCompressor.connect(convolver);
  convolver.connect(reverbLowpass);
  reverbLowpass.connect(wet);
  dry.connect(limiter);
  wet.connect(limiter);
  limiter.connect(output);

  const setEffects = (next: VoiceAudioEffects, immediate = false) => {
    const mix = clamp(next.reverbMix, 0, 0.45);
    const params: Array<[AudioParam, number]> = [
      [bass.gain, clamp(next.bassDb, 0, 9)],
      [dry.gain, 1 - mix],
      [wet.gain, mix],
    ];
    for (const [param, value] of params) {
      if (immediate) param.value = value;
      else param.setTargetAtTime(value, context.currentTime, 0.05);
    }
  };
  setEffects(effects, true);
  return {
    setEffects,
    setGain: (value: number) => gain.gain.setTargetAtTime(clamp(value, 0.5, 5), context.currentTime, 0.05),
    cleanup: () => {
      for (const node of [input, highpass, bass, gain, speechCompressor, dry, convolver, reverbLowpass, wet, limiter]) {
        try { node.disconnect(); } catch {}
      }
    },
  };
}
