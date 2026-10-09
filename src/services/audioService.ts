import { noiseGateWorkletSource } from "./noiseReduction";
import { createVoiceAudioGraph, VoiceAudioEffects } from "./meditationAudio";
export class AudioMeterService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationId: number | null = null;
  private isRunning = false;

  public start(stream: MediaStream, onVolumeChange: (vol: number, isClipping: boolean) => void) {
    if (this.isRunning) {
      this.stop();
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.7;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.isRunning = true;

      let lastCall = 0;
      const update = (now: number) => {
        if (!this.isRunning || !this.analyser) return;

        // Throttle callback to ~20fps to prevent any thread congestion
        if (now - lastCall >= 50) {
          lastCall = now;
          this.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          let maxVal = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
            if (dataArray[i] > maxVal) maxVal = dataArray[i];
          }

          const average = sum / dataArray.length;
          // Normalized volume 0-100
          const volume = Math.min(100, Math.round((average / 128) * 100));
          const isClipping = maxVal > 240;

          onVolumeChange(volume, isClipping);
        }

        this.animationId = requestAnimationFrame(update);
      };

      this.animationId = requestAnimationFrame(update);
    } catch (e) {
      console.warn('AudioMeter initialization failed', e);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {}
      this.source = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
  }
}

export interface BoostedAudioResult {
  processedStream: MediaStream;
  isProcessed: boolean;
  noiseGateAvailable: boolean;
  setGain: (gain: number) => void;
  setEffects: (effects: VoiceAudioEffects) => void;
  resume: () => Promise<void>;
  cleanup: () => void;
}

export function createBoostedAudioPipeline(
  rawStream: MediaStream,
  initialGain = 1.2,
  effects: VoiceAudioEffects = { bassDb: 0, reverbMix: 0 },
): BoostedAudioResult {
  const fallback = (): BoostedAudioResult => ({
    processedStream: rawStream, isProcessed: false, noiseGateAvailable: false,
    setGain: () => {}, setEffects: () => {}, resume: async () => {}, cleanup: () => {},
  });
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx || !rawStream.getAudioTracks().length) return fallback();
  let context: AudioContext | undefined;
  try {
    context = new AudioCtx();
    const source = context.createMediaStreamSource(rawStream);
    const destination = context.createMediaStreamDestination();
    const bridge = context.createGain();
    source.connect(bridge);
    const graph = createVoiceAudioGraph(context, bridge, destination, initialGain, effects);
    const activeContext = context;
    let closed = false;
    let gate: AudioWorkletNode | undefined;
    let workletReady: Promise<void> | undefined;
    let currentEffects = effects;
    const initializeGate = async () => {
      if (!activeContext.audioWorklet) return;
      const url = URL.createObjectURL(new Blob([noiseGateWorkletSource()], { type: 'text/javascript' }));
      try {
        await activeContext.audioWorklet.addModule(url);
        if (closed) return;
        gate = new AudioWorkletNode(activeContext, 'studio-noise-gate');
        gate.parameters.get('enabled')!.value = currentEffects.noiseReduction === false ? 0 : 1;
        source.disconnect();
        source.connect(gate);
        gate.connect(bridge);
      } catch (error) {
        // Browser capture suppression still works when the additional gate is unavailable.
        console.warn('Additional noise gate unavailable:', error);
      } finally { URL.revokeObjectURL(url); }
    };
    return {
      processedStream: destination.stream,
      isProcessed: true,
      get noiseGateAvailable() { return !!gate; },
      setGain: graph.setGain,
      setEffects: next => {
        currentEffects = next;
        graph.setEffects(next);
        gate?.parameters.get('enabled')?.setValueAtTime(next.noiseReduction === false ? 0 : 1, activeContext.currentTime);
      },
      resume: async () => {
        if (activeContext.state === 'suspended') await activeContext.resume();
        if (activeContext.state !== 'running') throw new Error('Audio context did not start');
        workletReady ||= initializeGate();
        await workletReady;
      },
      cleanup: () => {
        if (closed) return;
        closed = true;
        graph.cleanup();
        source.disconnect();
        gate?.disconnect();
        destination.stream.getTracks().forEach(track => track.stop());
        if (activeContext.state !== 'closed') void activeContext.close().catch(() => {});
      },
    };
  } catch (error) {
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    console.warn('Audio effects unavailable; using raw microphone:', error);
    return fallback();
  }
}
