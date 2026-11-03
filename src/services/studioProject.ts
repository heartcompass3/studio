import {
  CaptionItem,
  StudioTake,
  SubtitleStyle,
  TextCalloutItem,
  VideoAspectRatio,
  VisualOverlayItem,
} from "../types/studio";
export interface EditorDraft {
  captions: CaptionItem[];
  trimStart: number;
  trimEnd: number;
  hasCustomTrim: boolean;
  exportAspectRatio: VideoAspectRatio;
  videoFitMode: "cover" | "contain";
  captionPositionY: number;
  subtitleStyle: SubtitleStyle;
  karaokeEnabled: boolean;
  headlineText: string;
  textCallouts: TextCalloutItem[];
  visualOverlays: VisualOverlayItem[];
  brightness: number;
  contrast: number;
  sourceVolume: number;
  musicFile: File | null;
  musicVolume: number;
  musicFitMode: "auto" | "loop" | "trim";
}
export interface StudioProject {
  version: 1;
  script: string;
  coverTitle: string;
  media: { id: string; blob: Blob; duration: number } | null;
  takes: StudioTake[];
  editor: EditorDraft | null;
}
export const emptyStudioProject = (): StudioProject => ({
  version: 1,
  script: "",
  coverTitle: "",
  media: null,
  takes: [],
  editor: null,
});
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("heartcompass-studio-draft", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readStudioProject(): Promise<StudioProject | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("drafts")
        .objectStore("drafts")
        .get("current");
      request.onsuccess = () => {
        const saved = request.result as StudioProject | undefined;
        if (!saved || saved.version !== 1) return resolve(null);
        resolve({
          ...saved,
          takes: saved.takes.map((t) => ({
            ...t,
            url: URL.createObjectURL(t.blob),
          })),
        });
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeStudioProject(
  project: StudioProject,
): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put(
        { ...project, takes: project.takes.map((t) => ({ ...t, url: "" })) },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(tx.error || new Error("Project save failed"));
    });
  } finally {
    db.close();
  }
}
