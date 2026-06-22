/** Public site base URL for links in emails and notifications. */
export function portalSiteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.VITE_SITE_URL ??
    "https://quboolye.com"
  ).replace(/\/$/, "");
}

export function officialDocumentUrls(docId: string, verificationCode: string) {
  const base = portalSiteUrl();
  return {
    document_url: `${base}/document-view/${docId}`,
    verify_url: `${base}/verify-document?code=${encodeURIComponent(verificationCode)}`,
  };
}
