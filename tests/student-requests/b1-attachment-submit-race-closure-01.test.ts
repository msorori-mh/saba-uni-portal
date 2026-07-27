import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(
  "src/components/student-requests/b1/B1StudentRequestForm.tsx",
  "utf8",
);

describe("B1 attachment/submit race closure", () => {
  it("tracks an in-flight attachment sync", () => {
    expect(SOURCE).toContain("attachmentSync = useRef<Promise<void> | null>(null)");
    expect(SOURCE).toContain("setAttachmentSyncing(true)");
    expect(SOURCE).toContain("setAttachmentSyncing(false)");
  });

  it("prevents autosave from racing an attachment sync", () => {
    const save = SOURCE.slice(SOURCE.indexOf("const save = async"));
    expect(save.slice(0, 500)).toContain("if (attachmentSync.current)");
  });

  it("makes submit wait for the settled attachment state and run exactly once", () => {
    const submit = SOURCE.slice(SOURCE.indexOf("const submit = async"));
    expect(submit.slice(0, 700)).toContain("submitLock.current");
    expect(submit.slice(0, 700)).toContain("await awaitAttachmentSync()");
    expect(submit.slice(0, 700)).toContain("clearTimeout(autosaveTimer.current)");
  });

  it("blocks review while an upload or sync is in flight", () => {
    const review = SOURCE.slice(SOURCE.indexOf("const review = async"));
    expect(review.slice(0, 300)).toContain("if (attachmentSync.current || uploadingKey) return;");
    expect(review.slice(0, 300)).toContain("await awaitAttachmentSync()");
  });

  it("disables save, review and confirm buttons during synchronization", () => {
    expect(SOURCE).toContain("disabled={attachmentSyncing || submitting}");
    expect(SOURCE).toContain(
      "disabled={attachmentSyncing || uploadingKey !== null || submitting}",
    );
    expect(SOURCE).toContain("submitting={submitting || attachmentSyncing}");
  });

  it("re-persists secure references from the reloaded draft after every change", () => {
    expect(SOURCE).toContain("syncFormDataAfterAttachmentChange");
    expect(SOURCE).toContain("withSecureAttachmentReferences");
  });
});
