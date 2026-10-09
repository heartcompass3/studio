import { Asset, Composition, Layer } from "./types";
import { createMediaPool, disposeMediaPool } from "./media";

export const uid = () => crypto.randomUUID();
export const defaultComposition = (): Composition => ({
  width: 1080,
  height: 1920,
  duration: 30,
  baseAssetId: null,
  layers: [],
  captions: [],
  captionOffset: 0,
  captionRipple: true,
  captionStyle: {
    preset: "classic",
    position: 0.77,
    size: 1,
    color: "#ffffff",
    accent: "#facc15",
    background: "rgba(2,6,23,.76)",
  },
});
export const newLayer = (kind: Layer["kind"], duration: number): Layer => ({
  id: uid(),
  kind,
  name: kind,
  sourceIn: 0,
  start: 0,
  end: duration,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  scale: 1,
  fit: "cover",
  focalX: 0.5,
  focalY: 0.5,
  opacity: 1,
  fontSize: 0.055,
  color: "#ffffff",
  background: "transparent",
  align: "center",
  fade: 0,
});
export async function readAsset(file: Blob, name: string): Promise<Asset> {
  const a: Asset = {
    id: uid(),
    name,
    kind: file.type.startsWith("video/") ? "video" : "image",
    src: URL.createObjectURL(file),
    width: 0,
    height: 0,
  };
  try {
    const pool = await createMediaPool([a]);
    const media =
      a.kind === "video" ? pool.videos.get(a.id)! : pool.images.get(a.id)!;
    if (media instanceof HTMLVideoElement) {
      a.width = media.videoWidth;
      a.height = media.videoHeight;
      a.duration = media.duration;
    } else {
      a.width = media.naturalWidth;
      a.height = media.naturalHeight;
    }
    disposeMediaPool(pool);
    return a;
  } catch (error) {
    URL.revokeObjectURL(a.src);
    throw error;
  }
}
const db = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("heartcompass-studio-v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function saveProject(
  name: string,
  composition: Composition,
  assets: Asset[],
): Promise<void> {
  const media = await Promise.all(
    assets.map(async (a) => ({
      ...a,
      src: "",
      blob: await (await fetch(a.src)).blob(),
    })),
  );
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      tx.objectStore("projects").put(
        { version: 2, name, composition, media },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
export async function loadProject(): Promise<{
  name: string;
  composition: Composition;
  assets: Asset[];
}> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("projects")
        .objectStore("projects")
        .get("current");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const p = request.result;
        if (!p || p.version !== 2) {
          reject(new Error("אין עדיין פרויקט שמור בדפדפן הזה"));
          return;
        }
        resolve({
          name: p.name,
          composition: p.composition,
          assets: p.media.map((m: any) => ({
            id: m.id,
            name: m.name,
            kind: m.kind,
            width: m.width,
            height: m.height,
            duration: m.duration,
            src: URL.createObjectURL(m.blob),
          })),
        });
      };
    });
  } finally {
    database.close();
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
