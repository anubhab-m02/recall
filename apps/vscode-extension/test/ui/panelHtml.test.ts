import { describe, expect, it } from "vitest";
import { buildGenerationPanelHtml, escapeHtml } from "../../src/ui/panelHtml.js";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<b>"a" & 'b'</b>`)).toBe(
      "&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;"
    );
  });
});

describe("buildGenerationPanelHtml", () => {
  it("embeds the escaped title and draft text", () => {
    const html = buildGenerationPanelHtml("Daily Standup", "Yesterday: fixed <script> injection");
    expect(html).toContain("<h2>Daily Standup</h2>");
    expect(html).toContain("Yesterday: fixed &lt;script&gt; injection");
  });

  it("neutralizes a literal </script> inside draft text so it can't break out of the inline script", () => {
    const html = buildGenerationPanelHtml("t", "here comes </script><script>alert(1)</script>");
    expect(html).not.toContain("</script><script>alert(1)</script>");
  });

  it("includes a Copy button wired to postMessage", () => {
    const html = buildGenerationPanelHtml("t", "some draft");
    expect(html).toContain('id="copyButton"');
    expect(html).toContain("postMessage");
  });
});
