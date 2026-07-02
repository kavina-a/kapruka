import type { FileUIPart } from "ai";

export async function fileToFileUIPart(file: File): Promise<FileUIPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        type: "file",
        url: reader.result as string,
        mediaType: file.type || "image/jpeg",
        filename: file.name || "pasted-image.jpg",
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function imageFromClipboard(clipboard: DataTransfer | null): File | null {
  if (!clipboard) return null;
  const items = clipboard.items;
  if (items?.length) {
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }
  const files = clipboard.files;
  if (files?.length) {
    for (const file of files) {
      if (file.type.startsWith("image/")) return file;
    }
  }
  return null;
}

export async function attachImageFile(
  file: File,
  setPending: (v: { part: FileUIPart; previewUrl: string }) => void,
) {
  if (!file.type.startsWith("image/")) return false;
  const part = await fileToFileUIPart(file);
  setPending({ part, previewUrl: part.url });
  return true;
}
