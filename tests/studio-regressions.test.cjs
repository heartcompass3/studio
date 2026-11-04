const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { JSDOM } = require("jsdom");
const { indexedDB } = require("fake-indexeddb");
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLVideoElement",
  "HTMLMediaElement",
  "Event",
  "MouseEvent",
  "Image",
  "localStorage",
  "sessionStorage",
])
  global[key] = dom.window[key];
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
global.indexedDB = indexedDB;
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window,
);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLMediaElement.prototype.pause = function () {
  this._pauses = (this._pauses || 0) + 1;
};
dom.window.HTMLMediaElement.prototype.load = function () {};
dom.window.HTMLMediaElement.prototype.play = function () {
  this._plays = (this._plays || 0) + 1;
  return Promise.resolve();
};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  measureText: (text) => ({ width: text.length * 8 }),
  clearRect() {},
});
Object.defineProperties(dom.window.HTMLElement.prototype, {
  clientWidth: {
    configurable: true,
    get() {
      return this.id === "editor-stage" ? 360 : 0;
    },
  },
  clientHeight: {
    configurable: true,
    get() {
      return this.id === "editor-stage" ? 640 : 0;
    },
  },
});
const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  return this.id === "editor-stage"
    ? { left: 0, top: 0, width: 360, height: 640, right: 360, bottom: 640 }
    : originalRect.call(this);
};
dom.window.HTMLElement.prototype.setPointerCapture = function (id) {
  this._pointer = id;
};
dom.window.HTMLElement.prototype.hasPointerCapture = function (id) {
  return this._pointer === id;
};
dom.window.HTMLElement.prototype.releasePointerCapture = function () {
  this._pointer = null;
};
const audioParam = () => ({ value: 1, setTargetAtTime() {} });
const audioNode = () => ({
  connect(other) {
    return other;
  },
  gain: audioParam(),
  threshold: audioParam(),
  knee: audioParam(),
  ratio: audioParam(),
  attack: audioParam(),
  release: audioParam(),
});
global.AudioContext = class {
  state = "running";
  currentTime = 0;
  destination = audioNode();
  createGain = audioNode;
  createDynamicsCompressor = audioNode;
  createMediaElementSource = audioNode;
  resume = async () => {};
  close = async () => {};
};
document.fonts = { ready: Promise.resolve() };

const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = React;
const cache = new Map();
const gemini = {
  getStoredApiKey: () => "",
  getStoredModel: () => "test",
  FEATURED_MODELS: [],
};
function load(file) {
  const full = path.resolve(__dirname, "../src", file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} };
  cache.set(full, module);
  const js = ts.transpileModule(fs.readFileSync(full, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (name) => {
    if (name.endsWith(".css")) return {};
    if (name.includes("geminiService")) return gemini;
    // AI and encoders are external boundaries; these tests cover real UI state and IDB.
    if (name.includes("mp4ExportService")) {
      const bounds = (w, h, x = 50, y = 74) => ({
        x: (w * x) / 100 - 60,
        y: (h * y) / 100 - 20,
        width: 120,
        height: 40,
      });
      return {
        drawStudioSubtitle: (
          _ctx,
          _text,
          w,
          h,
          _style,
          _word,
          _karaoke,
          y,
          x,
        ) => bounds(w, h, x, y),
        drawTextCallout: (_ctx, item, w, h) =>
          bounds(w, h, item.positionX ?? 50, item.positionY ?? 30),
        drawHeadlineOverlay: (_ctx, _text, w, h, settings) =>
          bounds(
            w,
            h,
            settings.headlinePositionX ?? 50,
            settings.headlinePositionY ?? 10,
          ),
      };
    }
    if (name.includes("webmFixer"))
      return { fixWebmDuration: async (blob) => blob };
    if (!name.startsWith(".")) return require(name);
    const base = path.resolve(path.dirname(full), name);
    const resolved = [".ts", ".tsx", ""]
      .map((ext) => base + ext)
      .find((p) => fs.existsSync(p));
    return load(path.relative(path.resolve(__dirname, "../src"), resolved));
  };
  new Function("require", "module", "exports", js)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}
const { fitStage } = load("components/Studio/CameraStage.tsx");
const { finishAudioSamples } = load("services/audioMix.ts");
const { fitMediaFrame } = load("services/mediaGeometry.ts");
const { dragTextPosition } = load("services/textOverlay.ts");
const projectStore = load("services/studioProject.ts");
const flush = async (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
const visible = (node) => !node.closest('[style*="display: none"]');
function button(text) {
  return [...document.querySelectorAll("button")].find(
    (b) => visible(b) && b.textContent.includes(text),
  );
}
async function click(text) {
  const b = button(text);
  assert.ok(b, `Missing button: ${text}`);
  await act(async () => b.click());
}
function fill(el, value) {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

async function dragOverlay(id, dx, dy, pointerType = "touch", cancel = false) {
  const handle = document.querySelector(`[data-overlay-id="${id}"]`);
  assert.ok(handle, `Missing drag handle: ${id}`);
  const send = (type, x, y) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      isPrimary: { value: true },
      pointerType: { value: pointerType },
    });
    handle.dispatchEvent(event);
  };
  await act(async () => send("pointerdown", 100, 100));
  await act(async () => send("pointermove", 100 + dx, 100 + dy));
  await act(async () =>
    send(cancel ? "pointercancel" : "pointerup", 100 + dx, 100 + dy),
  );
  await act(async () => handle.click()); // Browsers may synthesize click after pointerup.
  return handle;
}
test("drag positioning starts at the painted box and keeps text inside the frame", () => {
  const bounds = { x: 120, y: 200, width: 120, height: 40 };
  const moved = dragTextPosition(bounds, 360, 640, 36, 64);
  assert.equal(moved.x, 60);
  assert.equal(moved.y, 44.375);
  const edge = dragTextPosition(bounds, 360, 640, 10000, -10000);
  assert.ok(edge.x < 100 && edge.y > 0);
});
test("portrait/landscape stages preserve ratio inside short, tall, keyboard and desktop containers", () => {
  for (const [w, h] of [
    [360, 560],
    [390, 788],
    [390, 320],
    [844, 314],
    [1280, 644],
    [1440, 800],
  ])
    for (const ratio of [9 / 16, 16 / 9, 1]) {
      const size = fitStage(w, h, ratio);
      assert.ok(size.width <= w + 1e-9 && size.height <= h + 1e-9);
      assert.ok(Math.abs(size.width / size.height - ratio) < 1e-10);
    }
});
test("mixed audio retains headroom and stereo balance, with continuous fade to zero at trim edges", () => {
  const left = Float32Array.from(
    { length: 48000 },
    (_, i) => 1.8 * Math.cos((2 * Math.PI * 440 * i) / 48000),
  );
  const right = Float32Array.from(left, (x) => x / 2);
  const result = finishAudioSamples([left, right], 48000);
  assert.ok(result.scale < 1);
  assert.equal(left[0], 0);
  assert.equal(left.at(-1), 0);
  let maxStep = 0;
  for (let i = 1; i < left.length; i++) {
    assert.ok(Math.abs(left[i]) <= 0.940001);
    assert.ok(Math.abs(right[i] * 2 - left[i]) < 1e-6);
    maxStep = Math.max(maxStep, Math.abs(left[i] - left[i - 1]));
  }
  assert.ok(maxStep < 0.06, `Unexpected PCM discontinuity: ${maxStep}`);
});
test("export keeps source proportions even for different ratios with the same orientation", () => {
  for (const [sw, sh] of [
    [720, 960],
    [1080, 1920],
    [1920, 1080],
    [1000, 1000],
  ])
    for (const [w, h] of [
      [1080, 1920],
      [1920, 1080],
    ])
      for (const mode of ["cover", "contain"]) {
        const f = fitMediaFrame(sw, sh, w, h, mode);
        assert.ok(
          Math.abs(f.sw / f.sh - f.width / f.height) < 1e-9,
          "Source pixels would be stretched",
        );
        assert.ok(f.sx >= -1e-9 && f.sy >= -1e-9);
        assert.ok(f.dx >= -1e-9 && f.dy >= -1e-9);
      }
});
test("project transaction round-trips original blobs, timed edits and all takes", async () => {
  const blob = new Blob(["synthetic media"], { type: "video/webm" });
  const p = {
    ...projectStore.emptyStudioProject(),
    script: "תסריט בדיקה",
    media: { id: "fixture", blob, duration: 4 },
    takes: [
      {
        id: "take1",
        takeNumber: 1,
        blob,
        url: "blob:expired",
        duration: 4,
        timestamp: 1,
        isFavorite: true,
      },
    ],
    editor: {
      captions: [{ id: 1, start: 0.1, end: 2, text: "נשמר" }],
      headlineText: "קאבר מותאם",
    },
  };
  await projectStore.writeStudioProject(p);
  const restored = await projectStore.readStudioProject();
  assert.equal(restored.script, p.script);
  assert.equal(await restored.media.blob.text(), "synthetic media");
  assert.equal(restored.editor.captions[0].text, "נשמר");
  assert.equal(restored.takes[0].isFavorite, true);
  assert.notEqual(restored.takes[0].url, "blob:expired");
  URL.revokeObjectURL(restored.takes[0].url);
  await projectStore.writeStudioProject(projectStore.emptyStudioProject());
});
test("real app keeps sheets open, synchronizes script, replaces imported video and restores edits", async () => {
  const { App } = load("App.tsx");
  let root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(App)));
  await flush(50);
  await click("הדבקת תסריט קיים");
  await act(async () =>
    fill(
      [...document.querySelectorAll("textarea")].find(visible),
      "גרסה ראשונה לבדיקה",
    ),
  );
  await click("שלח ישירות");
  await click("מילים");
  assert.ok(document.querySelector("[role=dialog]"));
  await act(async () =>
    fill(
      document.querySelector("[role=dialog] textarea"),
      "גרסה מעודכנת מתוך האולפן",
    ),
  );
  await click("תסריט");
  assert.equal(
    [...document.querySelectorAll("textarea")].find(visible).value,
    "גרסה מעודכנת מתוך האולפן",
  );
  await click("עריכה");
  async function importVideo(name) {
    const input = [...document.querySelectorAll("input[type=file]")].find(
      (e) => e.accept.includes("video/*") && visible(e),
    );
    const file = new File([name], name, { type: "video/mp4" });
    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [file],
      });
      input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    return document.querySelector("#editor-stage video").src;
  }
  const first = await importVideo("first.mp4");
  const player = document.querySelector("#editor-stage video");
  await act(async () =>
    document.querySelector('button[aria-label="נגן סרטון"]').click(),
  );
  assert.equal(player._plays, 1, "Touching the video did not start playback");
  const pauses = player._pauses || 0;
  await act(async () => player.click());
  assert.ok(
    player._pauses > pauses,
    "Touching the video did not pause playback",
  );
  assert.ok(button("כתוביות"), "Tapping video hid the editing controls");
  await act(async () => player.click());
  const playsBeforeClose = player._plays;
  await click("כתוביות");
  const pausesBeforeClose = player._pauses;
  await act(async () => player.click());
  assert.ok(!document.querySelector("#editor-stage [role=dialog]"));
  assert.ok(
    player._pauses > pausesBeforeClose,
    "Touching the frame with a sheet open must pause",
  );
  assert.equal(player._plays, playsBeforeClose);
  await click("כתוביות");
  await click("הוסף");
  assert.ok(
    document.querySelector("#editor-stage [role=dialog]"),
    "Adding a caption closed the sheet",
  );
  await act(async () =>
    fill(
      document.querySelector("#editor-stage [role=dialog] input[type=text]"),
      "כתובית שתשוחזר",
    ),
  );
  const captionInput = document.querySelector(
    "#editor-stage [role=dialog] input[type=text]",
  );
  assert.equal(captionInput.getAttribute("dir"), "rtl");
  await act(async () =>
    fill(
      document.querySelector('input[aria-label="כתוביות — גודל טקסט"]'),
      "145",
    ),
  );
  await click("מקם בגרירה");
  assert.ok(!document.querySelector("#editor-stage [role=dialog]"));
  await act(async () => player.click());
  const playsBeforeDrag = player._plays;
  await dragOverlay("caption", -79.2, -192, "touch");
  assert.equal(
    player._plays,
    playsBeforeDrag,
    "Dragging resumed playback after pointerup",
  );
  await click("מדבקות");
  await click("🔥 שימו לב!");
  const stickerInput = document.querySelector(
    'input[aria-label="טקסט המדבקה"]',
  );
  assert.equal(stickerInput.getAttribute("dir"), "rtl");
  await act(async () => {
    const input = [...document.querySelectorAll("input[aria-label]")].find(
      (item) =>
        item.getAttribute("aria-label") === "מדבקה: 🔥 שימו לב! — גודל טקסט",
    );
    fill(input, "160");
  });
  await click("מקם בגרירה");
  const stickerId = document
    .querySelector('[data-overlay-id^="callout:"]')
    .getAttribute("data-overlay-id");
  await dragOverlay(stickerId, 72, -25.6, "mouse");
  const sticker = await dragOverlay(stickerId, 0, 0, "touch", true);
  assert.equal(
    sticker._pointer,
    null,
    "Cancelled touches must release pointer capture",
  );
  await click("סגנון");
  const headline = document.querySelector('input[aria-label="טקסט הכותרת"]');
  assert.ok(headline, "Missing headline field");
  assert.equal(headline.getAttribute("dir"), "rtl");
  await act(async () => fill(headline, "כותרת לגרירה"));
  const headlinePlace = [...document.querySelectorAll("fieldset")]
    .find((el) => el.querySelector("legend")?.textContent.includes("כותרת"))
    .querySelector("button");
  await act(async () => headlinePlace.click());
  const headlineHandle = document.querySelector('[data-overlay-id="headline"]');
  assert.equal(document.activeElement, headlineHandle);
  const timeBeforeKeyboardMove = player.currentTime;
  await act(async () =>
    headlineHandle.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(
    player.currentTime,
    timeBeforeKeyboardMove,
    "Moving selected text must not seek the video",
  );
  await flush(750);
  const positioned = (await projectStore.readStudioProject()).editor;
  assert.ok(Math.abs(positioned.headlinePositionX - 55) < 1e-8);
  assert.ok(Math.abs(positioned.captionPositionX - 28) < 1e-8);
  assert.ok(Math.abs(positioned.captionPositionY - 44) < 1e-8);
  assert.equal(positioned.captionFontScale, 1.45);
  assert.equal(positioned.textCallouts[0].positionX, 70);
  assert.ok(Math.abs(positioned.textCallouts[0].positionY - 26) < 1e-8);
  assert.equal(positioned.textCallouts[0].fontScale, 1.6);
  assert.equal(
    (await projectStore.readStudioProject()).editor.captions[0].text,
    "כתובית שתשוחזר",
  );
  const placementBeforeReload = [
    ...document.querySelectorAll("[data-overlay-id]"),
  ].map((el) => ({
    id: el.getAttribute("data-overlay-id"),
    left: el.style.left,
    top: el.style.top,
  }));
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(App)));
  await flush(50);
  await click("עריכה");
  for (const previous of placementBeforeReload) {
    const restored = document.querySelector(
      `[data-overlay-id="${previous.id}"]`,
    );
    assert.ok(restored, `Overlay missing after reload: ${previous.id}`);
    assert.equal(restored.style.left, previous.left);
    assert.equal(restored.style.top, previous.top);
  }
  await click("כתוביות");
  assert.equal(
    document.querySelector('input[aria-label="כתוביות — גודל טקסט"]').value,
    "145",
  );
  assert.ok(
    !document.querySelector('input[aria-label="כתוביות — מיקום אופקי"]'),
    "Position sliders should be replaced by direct dragging",
  );
  assert.equal(
    document.querySelector("#editor-stage [role=dialog] input[type=text]")
      .value,
    "כתובית שתשוחזר",
  );
  assert.equal(
    document.querySelector("#studio-stage").closest('[style*="display: none"]')
      .style.display,
    "none",
  );
  // File input inside the active editor remains usable when replacing an existing asset.
  const second = await importVideo("second.mp4");
  assert.notEqual(second, first);
  assert.ok(
    !document
      .querySelector("#editor-stage")
      .textContent.includes("כתובית שתשוחזר"),
    "Old caption leaked into new media",
  );
  // A simulated capture exercises the real record -> take -> App -> editor callbacks.
  class Stream {
    constructor(tracks = []) {
      this.tracks = tracks;
    }
    getTracks() {
      return this.tracks;
    }
    getAudioTracks() {
      return this.tracks.filter((t) => t.kind === "audio");
    }
    getVideoTracks() {
      return this.tracks.filter((t) => t.kind === "video");
    }
    addTrack(track) {
      this.tracks.push(track);
    }
  }
  const track = (kind) => ({
    kind,
    stop() {},
    getSettings: () => ({ width: 720, height: 1280 }),
    getCapabilities: () => ({}),
    applyConstraints: async () => {},
  });
  global.MediaStream = Stream;
  navigator.mediaDevices = {
    getUserMedia: async () => new Stream([track("video")]),
    enumerateDevices: async () => [],
  };
  dom.window.HTMLCanvasElement.prototype.captureStream = () =>
    new Stream([track("video")]);
  global.MediaRecorder = class {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable({
        data: new Blob(["new capture"], { type: "video/webm" }),
      });
      void this.onstop();
    }
  };
  await click("צילום");
  await click("הפעל מצלמה");
  await click("3s");
  await click("5s");
  await click("10s");
  await act(async () =>
    document.querySelector('button[title="התחל הקלטה"]').click(),
  );
  assert.ok(document.querySelector('button[title="סיים הקלטה"]'));
  await act(async () =>
    document.querySelector('button[title="סיים הקלטה"]').click(),
  );
  await click("עבור לעריכה וכתוביות");
  const captured = document.querySelector("#editor-stage video").src;
  assert.notEqual(captured, second);
  await flush(750);
  const savedCapture = await projectStore.readStudioProject();
  assert.equal(await savedCapture.media.blob.text(), "new capture");
  assert.equal(savedCapture.takes.length, 1);
  URL.revokeObjectURL(savedCapture.takes[0].url);
  await click("צילום");
  await click("טייקים");
  assert.ok(document.querySelector('[aria-label="סמן טייק 1 כמועדף"]'));
  await act(async () => root.unmount());
});
after(() => dom.window.close());
