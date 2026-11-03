// Verify sample scheduling at the WebCodecs boundary. These doubles do not validate a real AAC bitstream.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

test("export submits continuous PCM timestamps and an exact final block without intermediate audio flushes", async () => {
  const samples = 14400; // 0.3 seconds at 48 kHz: final block has 64 frames, not 1024 padded frames.
  const encoded = [];
  let audioFlushes = 0;
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    connect(other) {
      return other;
    },
    gain: param(),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    start() {},
  });
  const buffer = () => {
    const channels = [0, 1].map(() =>
      Float32Array.from(
        { length: samples },
        (_, i) => 0.8 * Math.cos((2 * Math.PI * 440 * i) / 48000),
      ),
    );
    return {
      numberOfChannels: 2,
      length: samples,
      sampleRate: 48000,
      duration: 0.3,
      getChannelData: (ch) => channels[ch],
    };
  };
  class Context {
    currentTime = 0;
    destination = node();
    createGain = node;
    createDynamicsCompressor = node;
    createBufferSource = node;
    decodeAudioData = async () => buffer();
    close = async () => {};
    startRendering = async () => buffer();
  }
  class Encoder {
    state = "configured";
    encodeQueueSize = 0;
    static isConfigSupported = async () => ({ supported: true });
    configure() {}
    encode() {}
    async flush() {}
    close() {
      this.state = "closed";
    }
  }
  class AudioEncoder extends Encoder {
    encode(data) {
      encoded.push(data.options);
    }
    async flush() {
      audioFlushes++;
    }
  }
  class Video extends EventTarget {
    videoWidth = 320;
    videoHeight = 180;
    duration = 0.3;
    muted = false;
    volume = 1;
    readyState = 4;
    seeking = false;
    value = 0;
    get currentTime() {
      return this.value;
    }
    set currentTime(value) {
      this.value = value;
      this.dispatchEvent(new Event("seeked"));
    }
    pause() {}
  }
  const canvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, fillRect() {} }),
  });
  const cache = new Map();
  const globals = {
    Blob,
    Float32Array,
    Map,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    console,
    AudioContext: Context,
    OfflineAudioContext: Context,
    VideoEncoder: Encoder,
    AudioEncoder,
    AudioData: class {
      constructor(options) {
        this.options = options;
      }
      close() {}
    },
    VideoFrame: class {
      close() {}
    },
    navigator: {},
    document: {
      fonts: { ready: Promise.resolve() },
      createElement: () => canvas(),
    },
    window: {},
  };
  function load(name) {
    const full = path.resolve(__dirname, "../src/services", name);
    if (cache.has(full)) return cache.get(full);
    const exports = {};
    cache.set(full, exports);
    const code = ts.transpileModule(fs.readFileSync(full, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (dep) =>
      dep === "mp4-muxer"
        ? {
            Muxer: class {
              constructor() {
                this.target = { buffer: new ArrayBuffer(1) };
              }
              finalize() {}
            },
            ArrayBufferTarget: class {},
          }
        : dep === "fix-webm-duration"
          ? () => {}
          : load(dep + ".ts");
    vm.runInNewContext(code, { ...globals, exports, require: requireLocal });
    return exports;
  }
  const { exportVideoToMP4 } = load("mp4ExportService.ts");
  const result = await exportVideoToMP4({
    videoElement: new Video(),
    videoBlob: new Blob(["fixture"]),
    captions: [],
    trimStart: 0,
    trimEnd: 0.3,
    brightness: 1,
    subtitleStyle: "karaoke-yellow",
    exportAspectRatio: "9:16",
    onProgress() {},
  });
  assert.equal(result.type, "video/mp4");
  assert.equal(
    audioFlushes,
    1,
    "Flushing mid-stream can introduce encoder padding repeatedly",
  );
  assert.equal(
    encoded.reduce((sum, part) => sum + part.numberOfFrames, 0),
    samples,
  );
  assert.equal(encoded.at(-1).numberOfFrames, 64);
  let previous = null,
    offset = 0;
  for (const part of encoded) {
    assert.equal(part.timestamp, Math.round((offset / 48000) * 1e6));
    if (previous !== null)
      assert.ok(
        Math.abs(part.data[0] - previous) < 0.06,
        "PCM discontinuity between blocks",
      );
    previous = part.data[part.numberOfFrames - 1];
    offset += part.numberOfFrames;
    assert.equal(part.data.length, part.numberOfFrames * 2);
  }
});
