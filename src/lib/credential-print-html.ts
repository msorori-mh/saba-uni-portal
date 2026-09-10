/**
 * Render a trusted credential-slip template with every value HTML-escaped.
 * Interpolations must be text or quoted attribute values. This does not make
 * untrusted URLs, script/style content, tag names or attribute names safe.
 */
export function credentialPrintHtml(
  strings: TemplateStringsArray,
  ...values: readonly string[]
): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return strings.reduce((html, part, index) => {
    const value = index < values.length
      ? values[index]!.replace(/[&<>"']/g, (character) => entities[character]!)
      : "";
    return html + part + value;
  }, "");
}
