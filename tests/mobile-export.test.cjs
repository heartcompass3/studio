const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { JSDOM } = require("jsdom");

// Model engines that cannot draw an unmounted video/canvas. Actual iOS codecs still require device QA.
function runtime({ blackOutput = false, missingTrack = false } = {}) {
  const dom = new JSDOM('<div id="stage"><video id="preview"></video></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const { window: win } = dom,
    document = win.document;
  document.fonts = { ready: Promise.resolve() };
  const events = [],
    videos = win.HTMLMediaElement.prototype;
  Object.defineProperties(videos, {
    readyState: {
      configurable: true,
      get() {
        return this._ready || 0;
      },
    },
    duration: {
      configurable: true,
      get() {
        return 0.3;
      },
    },
    videoWidth: {
      configurable: true,
      get() {
        return this._ready ? 320 : 0;
      },
    },
    videoHeight: {
      configurable: true,
      get() {
        return this._ready ? 180 : 0;
      },
    },
    currentTime: {
      configurable: true,
      get() {
        return this._time || 0;
      },
      set(value) {
        this._time = value;
        queueMicrotask(() => this.dispatchEvent(new win.Event("seeked")));
      },
    },
    seeking: {
      configurable: true,
      get() {
        return false;
      },
    },
  });
  Object.defineProperties(win.HTMLVideoElement.prototype, {
    videoWidth: {
      configurable: true,
      get() {
        return this._ready ? 320 : 0;
      },
    },
    videoHeight: {
      configurable: true,
      get() {
        return this._ready ? 180 : 0;
      },
    },
  });
  videos.load = function () {
    queueMicrotask(() => {
      this._ready = 4;
      this.dispatchEvent(new win.Event("loadeddata"));
    });
  };
  videos.play = function () {
    this._playing = true;
    return Promise.resolve();
  };
  videos.pause = function () {
    this._playing = false;
  };
  videos.requestVideoFrameCallback = function (callback) {
    return setTimeout(() => {
      if (!this._playing) return;
      this._time = Math.min(0.3, (this._time || 0) + 0.05);
      callback(performance.now(), { mediaTime: this._time });
      if (this._time >= 0.3) this.dispatchEvent(new win.Event("ended"));
    }, 5);
  };
  videos.cancelVideoFrameCallback = clearTimeout;
  const track = {
    kind: "video",
    readyState: "live",
    requestFrame() {
      events.push("requestFrame");
    },
    stop() {},
  };
  win.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    if (this._ctx) return this._ctx;
    return (this._ctx = {
      fillRect() {
        canvas._luma = 0;
      },
      drawImage(source) {
        const output =
          source instanceof win.HTMLVideoElement &&
          source.src.startsWith("blob:");
        canvas._luma =
          source instanceof win.HTMLCanvasElement
            ? source._luma || 0
            : source.isConnected && source.readyState >= 2
              ? output && blackOutput
                ? 0
                : 100
              : 0;
        canvas._painted = (canvas._painted || 0) + 1;
      },
      getImageData() {
        return {
          data: Uint8ClampedArray.from({ length: 12 * 12 * 4 }, (_, i) =>
            i % 4 === 3 ? 255 : canvas._luma || 0,
          ),
        };
      },
    });
  };
  win.HTMLCanvasElement.prototype.captureStream = function () {
    events.push("captureStream");
    assert.ok(this.isConnected, "Capture canvas was outside the document");
    assert.ok(
      this._luma > 0,
      "Capture started before the first decoded picture was painted",
    );
    return {
      getVideoTracks: () => (missingTrack ? [] : [track]),
      getTracks: () => [track],
      addTrack() {},
    };
  };
  const parameter = () => ({
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    gain: parameter(),
    threshold: parameter(),
    knee: parameter(),
    ratio: parameter(),
    attack: parameter(),
    release: parameter(),
    connect(other) {
      return other;
    },
  });
  class AudioContext {
    currentTime = 0;
    state = "running";
    createGain = node;
    createDynamicsCompressor = node;
    createMediaElementSource = node;
    createMediaStreamDestination() {
      return {
        stream: { getAudioTracks: () => [{ kind: "audio", stop() {} }] },
      };
    }
    async resume() {}
    async close() {
      this.state = "closed";
    }
  }
  class MediaRecorder {
    static isTypeSupported(mime) {
      return mime === "video/mp4";
    }
    state = "inactive";
    mimeType = "video/mp4";
    start() {
      this.state = "recording";
      events.push("recorder.start");
    }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["encoded"], { type: "video/mp4" }),
      });
      this.onstop?.();
    }
  }
  const cache = new Map(),
    environment = {
      Blob,
      Map,
      Math,
      Promise,
      Float32Array,
      Uint8ClampedArray,
      console,
      performance,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      document,
      window: win,
      navigator: {},
      AudioContext,
      MediaRecorder,
      URL,
      Image: win.Image,
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    };
  function load(name) {
    const file = path.resolve(__dirname, "../src/services", name);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(code, {
      ...environment,
      exports,
      require: (dep) =>
        dep === "mp4-muxer"
          ? {}
          : dep === "fix-webm-duration"
            ? {}
            : load(dep + ".ts"),
    });
    return exports;
  }
  const preview = document.getElementById("preview");
  preview.src = "http://localhost/fixture.mp4";
  preview._ready = 4;
  return {
    exports: load("mp4ExportService.ts"),
    helpers: load("videoExportRuntime.ts"),
    events,
    document,
    win,
    preview,
    close: () => dom.window.close(),
  };
}
const options = (preview) => ({
  videoElement: preview,
  captions: [],
  trimStart: 0,
  trimEnd: 0.3,
  brightness: 1,
  subtitleStyle: "karaoke-yellow",
  exportAspectRatio: "9:16",
  onProgress() {},
});
test("mobile fallback paints and mounts picture before capture, requests frames, verifies output and cleans up", async () => {
  const r = runtime();
  try {
    const blob = await r.exports.exportVideoToMP4(options(r.preview));
    assert.equal(blob.type, "video/mp4");
    assert.ok(blob.size > 0);
    assert.ok(
      r.events.indexOf("captureStream") < r.events.indexOf("recorder.start"),
    );
    assert.ok(r.events.filter((e) => e === "requestFrame").length > 2);
    assert.equal(r.document.querySelector("[data-export-surface]"), null);
  } finally {
    r.close();
  }
});
test("mobile fallback rejects a missing picture track instead of exporting only audio", async () => {
  const r = runtime({ missingTrack: true });
  try {
    await assert.rejects(
      r.exports.exportVideoToMP4(options(r.preview)),
      /רצועת וידאו/,
    );
    assert.ok(!r.events.includes("recorder.start"));
    assert.equal(r.document.querySelector("[data-export-surface]"), null);
  } finally {
    r.close();
  }
});
test("post-export picture check rejects black output when the composed source was bright", async () => {
  const r = runtime({ blackOutput: true });
  try {
    await assert.rejects(
      r.exports.exportVideoToMP4(options(r.preview)),
      /תמונה שחורה/,
    );
    assert.equal(r.document.querySelector("[data-export-surface]"), null);
  } finally {
    r.close();
  }
});
test("picture check accepts intentionally dark footage", async () => {
  const r = runtime({ blackOutput: true });
  try {
    await r.helpers.verifyExportedVideo(
      new Blob(["encoded"]),
      r.preview.parentElement,
      { time: 0.1, luma: 0 },
    );
  } finally {
    r.close();
  }
});
