const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
const cache = new Map();
function load(name) {
  const file = path.resolve(__dirname, "../src/services", name);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (dep) =>
      dep === "mp4-muxer" || dep === "fix-webm-duration"
        ? {}
        : load(dep + ".ts"),
  });
  return exports;
}
const painter = load("mp4ExportService.ts");
function context() {
  const result = {
    font: "",
    text: [],
    boxes: [],
    save() {},
    restore() {},
    beginPath() {},
    fill() {},
    stroke() {},
    strokeText() {},
    measureText(text) {
      return {
        width:
          text.length *
          (parseFloat(this.font.match(/[\d.]+(?=px)/)?.[0]) || 12) *
          0.55,
      };
    },
    fillText(text, x, y) {
      this.text.push({
        text,
        x,
        y,
        font: parseFloat(this.font.match(/[\d.]+(?=px)/)[0]),
      });
    },
    roundRect(x, y, w, h) {
      this.boxes.push({ x, y, w, h });
    },
    rect(x, y, w, h) {
      this.boxes.push({ x, y, w, h });
    },
  };
  return result;
}
test("caption XY and font scale are proportional between preview and full-size export", () => {
  const a = context(),
    b = context();
  painter.drawStudioSubtitle(
    a,
    "טקסט קצר לבדיקה",
    1080,
    1920,
    "karaoke-yellow",
    1,
    true,
    42,
    30,
    1.45,
  );
  painter.drawStudioSubtitle(
    b,
    "טקסט קצר לבדיקה",
    360,
    640,
    "karaoke-yellow",
    1,
    true,
    42,
    30,
    1.45,
  );
  assert.equal(a.text.length, b.text.length);
  assert.ok(a.text.length > 0);
  a.text.forEach((text, i) => {
    assert.ok(Math.abs(text.x / 3 - b.text[i].x) < 0.001);
    assert.ok(Math.abs(text.y / 3 - b.text[i].y) < 0.001);
    assert.ok(Math.abs(text.font / 3 - b.text[i].font) < 0.001);
  });
});
test("sticker position/size changes affect the actual export painter, with safe frame edges", () => {
  const a = context(),
    b = context();
  painter.drawTextCallout(
    a,
    {
      text: "טיפ",
      style: "fire-pill",
      positionX: 25,
      positionY: 35,
      fontScale: 1,
    },
    1080,
    1920,
  );
  painter.drawTextCallout(
    b,
    {
      text: "טיפ",
      style: "fire-pill",
      positionX: 75,
      positionY: 65,
      fontScale: 1.6,
    },
    1080,
    1920,
  );
  assert.ok(b.text[0].x > a.text[0].x);
  assert.ok(b.text[0].y > a.text[0].y);
  assert.ok(Math.abs(b.text[0].font / a.text[0].font - 1.6) < 0.001);
  const edge = context();
  painter.drawTextCallout(
    edge,
    {
      text: "בדיקת גבולות",
      style: "fire-pill",
      positionX: 100,
      positionY: 0,
      fontScale: 2,
    },
    1080,
    1920,
  );
  assert.ok(edge.boxes[0].x >= 0 && edge.boxes[0].x + edge.boxes[0].w <= 1080);
  assert.ok(edge.boxes[0].y >= 0);
});
test("headline placement and font size are honored without changing old draft defaults", () => {
  const a = context(),
    b = context();
  painter.drawHeadlineOverlay(a, "כותרת", 1080, 1920);
  painter.drawHeadlineOverlay(b, "כותרת", 1080, 1920, {
    headlinePositionX: 75,
    headlinePositionY: 40,
    headlineFontScale: 1.3,
  });
  assert.ok(b.text[0].x > a.text[0].x);
  assert.ok(b.text[0].y > a.text[0].y);
  assert.ok(Math.abs(b.text[0].font / a.text[0].font - 1.3) < 0.001);
});
