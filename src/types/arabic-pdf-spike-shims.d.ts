declare module "*.ttf" {
  const data: ArrayBuffer;
  export default data;
}

declare module "*.jpg" {
  const data: ArrayBuffer;
  export default data;
}

declare module "*.jpeg" {
  const data: ArrayBuffer;
  export default data;
}

declare module "*.png" {
  const data: ArrayBuffer;
  export default data;
}

declare module "bidi-js" {
  type EmbeddingLevels = {
    levels: Uint8Array | number[];
    paragraphs: Array<{ start: number; end: number; level: number }>;
  };

  type BidiApi = {
    getEmbeddingLevels(
      string: string,
      baseDirection?: "ltr" | "rtl" | "auto" | null,
    ): EmbeddingLevels;
    getReorderedString(
      string: string,
      embedLevels: EmbeddingLevels,
      start?: number | null,
      end?: number | null,
    ): string;
    getReorderSegments(string: string, embedLevels: EmbeddingLevels): Array<[number, number]>;
  };

  export default function bidiFactory(): BidiApi;
}
