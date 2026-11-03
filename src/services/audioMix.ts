/** One transparent gain scale for preview and both export engines. */
export function createMixBus(context: BaseAudioContext, output: AudioNode) {
  const source = context.createGain();
  const music = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  const master = context.createGain();
  master.gain.value = 0.9;
  source.connect(limiter);
  music.connect(limiter);
  limiter.connect(master).connect(output);
  return {
    source,
    music,
    master,
    setLevels(voice: number, background: number, muted = false) {
      source.gain.setTargetAtTime(
        muted ? 0 : Math.max(0, Math.min(1, voice)),
        context.currentTime,
        0.015,
      );
      music.gain.setTargetAtTime(
        muted ? 0 : Math.max(0, Math.min(1, background)),
        context.currentTime,
        0.015,
      );
    },
  };
}

/** Preserve relative levels, retain AAC headroom, and remove discontinuities at trim edges. */
export function finishAudioSamples(
  channels: Float32Array[],
  sampleRate: number,
) {
  let peak = 0;
  for (const channel of channels)
    for (const value of channel)
      if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0.94 ? 0.94 / peak : 1;
  const fade = Math.min(
    Math.round(sampleRate * 0.005),
    Math.floor((channels[0]?.length || 0) / 2),
  );
  for (const channel of channels)
    for (let i = 0; i < channel.length; i++) {
      const envelope = fade
        ? Math.min(1, i / fade, (channel.length - 1 - i) / fade)
        : 1;
      channel[i] =
        (Number.isFinite(channel[i]) ? channel[i] : 0) * scale * envelope;
    }
  return { peak, scale };
}
