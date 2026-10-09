/** Gentle linked-channel downward expander; leaves speech peaks and pauses intact. */
export class GentleNoiseGate {
  declare rate: number;
  declare level: number;
  declare hold: number;
  constructor(rate: number) { this.rate = rate; this.level = 1; this.hold = 0; }
  process(input: Float32Array[], output: Float32Array[], enabled: boolean) {
    const frames = output[0]?.length || 0;
    let peak = 0;
    for (const channel of input) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    // -50 dBFS: quiet voice stays audible, low-level room noise fades between phrases.
    const threshold = 0.00316227766;
    if (peak >= threshold) this.hold = Math.round(this.rate * 0.12);
    const target = !enabled || peak >= threshold || this.hold > 0 ? 1 : 0.12;
    const coefficient = Math.exp(-1 / (this.rate * (target > this.level ? 0.003 : 0.18)));
    for (let frame = 0; frame < frames; frame++) {
      this.level = target + coefficient * (this.level - target);
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][frame] = (input[channel]?.[frame] || 0) * this.level;
      }
      if (this.hold > 0) this.hold--;
    }
  }
}

export const noiseGateWorkletSource = () => `
const GentleNoiseGate = ${GentleNoiseGate.toString()};
class StudioNoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]; }
  constructor() { super(); this.gate = new GentleNoiseGate(sampleRate); }
  process(inputs, outputs, parameters) {
    this.gate.process(inputs[0] || [], outputs[0] || [], parameters.enabled[0] >= 0.5);
    return true;
  }
}
registerProcessor('studio-noise-gate', StudioNoiseGate);`;
