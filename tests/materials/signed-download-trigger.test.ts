import { describe, expect, test } from "bun:test";
import { triggerSignedFileDownload } from "../../src/lib/materials/signed-download";

type FakeAnchor = {
  href: string;
  download: string;
  rel: string;
  target?: string;
  style: { display: string };
  click: () => void;
  remove: () => void;
};

function withFakeDocument(run: () => Promise<void>): Promise<{ anchors: FakeAnchor[] }> {
  const anchors: FakeAnchor[] = [];
  const fakeWindow = {};
  const fakeDocument = {
    createElement: () => {
      const anchor: FakeAnchor = {
        href: "",
        download: "",
        rel: "",
        style: { display: "" },
        click: () => anchors.push(anchor),
        remove: () => {},
      };
      return anchor;
    },
    body: { appendChild: () => {} },
  };
  const globalRef = globalThis as any;
  const windowExisted = Object.prototype.hasOwnProperty.call(globalRef, "window");
  const documentExisted = Object.prototype.hasOwnProperty.call(globalRef, "document");
  const originalWindow = globalRef.window;
  const originalDocument = globalRef.document;
  globalRef.window = fakeWindow;
  globalRef.document = fakeDocument;
  const cleanup = () => {
    // Restore the exact pre-test global shape: a property that did not exist
    // before must be deleted again (leaving `window: undefined` on globalThis
    // fails no-window environment assertions in other tests of the same run).
    if (windowExisted) globalRef.window = originalWindow;
    else delete globalRef.window;
    if (documentExisted) globalRef.document = originalDocument;
    else delete globalRef.document;
  };
  return run().then(
    () => {
      cleanup();
      return { anchors };
    },
    (error) => {
      cleanup();
      throw error;
    },
  );
}

describe("triggerSignedFileDownload", () => {
  test("web path: clicks an anchor with download + rel=noopener and no _blank target (not a popup)", async () => {
    const { anchors } = await withFakeDocument(async () => {
      await triggerSignedFileDownload("https://storage.example.com/signed/abc", "ملف المحاضرة.pdf");
    });
    expect(anchors.length).toBe(1);
    const anchor = anchors[0];
    expect(anchor.href).toBe("https://storage.example.com/signed/abc");
    expect(anchor.download).toBe("ملف المحاضرة.pdf");
    expect(anchor.rel).toBe("noopener");
    expect(anchor.target ?? "").not.toBe("_blank");
    expect(anchor.style.display).toBe("none");
  });

  test("web path: works without a filename (download attribute stays empty)", async () => {
    const { anchors } = await withFakeDocument(async () => {
      await triggerSignedFileDownload("https://storage.example.com/signed/xyz");
    });
    expect(anchors.length).toBe(1);
    expect(anchors[0].href).toBe("https://storage.example.com/signed/xyz");
    expect(anchors[0].download).toBe("");
  });
});
