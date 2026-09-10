import { describe, expect, it } from "bun:test";
import { credentialPrintHtml } from "../../src/lib/credential-print-html";

describe("credential print HTML", () => {
  for (const payload of [
    '</span><script>globalThis.compromised=true</script><span>',
    '<img src=x onerror="globalThis.compromised=true">',
    '<svg onload="globalThis.compromised=true"></svg>',
    '" autofocus onfocus="globalThis.compromised=true',
    "' onmouseover='globalThis.compromised=true",
    '&lt;img src=x onerror=alert(1)&gt;',
  ]) {
    it(`keeps a synthetic attack inert: ${payload.slice(0, 24)}`, () => {
      const html = credentialPrintHtml`<span title="${payload}">${payload}</span>`;
      const tags: string[] = [];
      const attributeNames: string[] = [];
      // Parse the result as HTML, rather than trusting a substring check.
      new HTMLRewriter().on("*", {
        element(element) {
          tags.push(element.tagName);
          attributeNames.push(...Array.from(element.attributes, ([name]) => name));
        },
      }).transform(html);
      expect(tags).toEqual(["span"]);
      expect(attributeNames).toEqual(["title"]);
    });
  }

  it("retains Arabic and encodes password punctuation once", () => {
    expect(credentialPrintHtml`<span>${'طالب اختبار — A&B<7>"\''}</span>`)
      .toBe("<span>طالب اختبار — A&amp;B&lt;7&gt;&quot;&#39;</span>");
    expect(credentialPrintHtml`<span>${"&lt;"}</span>`)
      .toBe("<span>&amp;lt;</span>");
  });

  it("preserves the trusted layout and print bootstrap", () => {
    expect(credentialPrintHtml`<p>${""}</p><script>window.print()</script>`)
      .toBe("<p></p><script>window.print()</script>");
  });
});
