// Tiny Markdown -> HTML renderer (enough for a clean changelog)
const mdToHtml = (md) => {
  // escape HTML
  let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // code blocks (```...```)
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code}</code></pre>`);

  // headings #####, ####, ###, ##, #
  for (let n = 6; n >= 1; n--) {
    const re = new RegExp(`^${"#".repeat(n)}\\s+(.+)$`, "gm");
    html = html.replace(re, `<h${n}>$1</h${n}>`);
  }

  // bold **text** and italics *text*
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // inline code `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // blockquotes
  html = html.replace(/^>\s?(.*)$/gm, "<blockquote>$1</blockquote>");

  // unordered lists
  html = html.replace(/^(?:-\s.+\n?)+/gm, (list) => {
    const items = list.trim().split(/\n/).map(l => l.replace(/^-+\s/, "").trim());
    return `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  });

  // ordered lists
  html = html.replace(/^(\d+\.\s.+\n?)+/gm, (list) => {
    const items = list.trim().split(/\n/).map(l => l.replace(/^\d+\.\s/, "").trim());
    return `<ol>${items.map(i => `<li>${i}</li>`).join("")}</ol>`;
  });

  // horizontal rules
  html = html.replace(/^\s*---\s*$/gm, "<hr>");

  // paragraphs (line groups)
  html = html
    .split(/\n{2,}/)
    .map(block => /<(h\d|ul|ol|pre|blockquote|hr)/.test(block.trim()) ? block
      : `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return html;
};

const contentEl = document.getElementById("content");
const metaEl = document.getElementById("meta");

async function loadChangelog() {
  try {
    const url = "./sidekick-changelog.md"; // same folder
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // render
    contentEl.innerHTML = mdToHtml(text);

    // meta
    const lastMod = res.headers.get("Last-Modified");
    metaEl.textContent = lastMod ? `Source: sidekick-changelog.md • Last updated ${new Date(lastMod).toLocaleString()}` 
                                 : `Source: sidekick-changelog.md`;
  } catch (err) {
    contentEl.innerHTML = `<p style="color:#b00020"><strong>Failed to load changelog.</strong> ${String(err)}</p>`;
  }
}

loadChangelog();
