function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasBbcodeTags(value: string): boolean {
  return /\[(center|size|img|url|list|color|b|i|u|quote|spoiler|code|youtube|\*)/i.test(value);
}

function applyUntilStable(input: string, pattern: RegExp, replace: (...args: string[]) => string): string {
  let prev = input;
  let next = input;
  for (let i = 0; i < 8; i++) {
    next = prev.replace(pattern, (...args) => replace(...args.map(String)));
    if (next === prev) break;
    prev = next;
  }
  return next;
}

export function bbcodeToHtml(bbcode: string): string {
  let html = bbcode.replace(/\r\n/g, "\n");

  html = applyUntilStable(
    html,
    /\[img\]([\s\S]*?)\[\/img\]/gi,
    (_, url) => {
      const src = url.trim();
      if (!/^https?:\/\//i.test(src)) return "";
      return `<img src="${escapeHtml(src)}" alt="" loading="lazy" />`;
    }
  );

  html = applyUntilStable(
    html,
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    (_, href, text) =>
      `<a href="${escapeHtml(href.trim())}" target="_blank" rel="noopener noreferrer">${text.trim()}</a>`
  );

  html = applyUntilStable(
    html,
    /\[url\]([\s\S]*?)\[\/url\]/gi,
    (_, href) => {
      const link = href.trim();
      return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>`;
    }
  );

  html = applyUntilStable(
    html,
    /\[size=([0-9]+)\]([\s\S]*?)\[\/size\]/gi,
    (_, size, content) => {
      const level = Number(size);
      if (level >= 5) return `<h2>${content}</h2>`;
      if (level >= 4) return `<h3>${content}</h3>`;
      if (level >= 3) return `<h4>${content}</h4>`;
      return `<p>${content}</p>`;
    }
  );

  html = applyUntilStable(
    html,
    /\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi,
    (_, color, content) => `<span style="color:${escapeHtml(color.trim())}">${content}</span>`
  );

  const blockTags: Array<[RegExp, string]> = [
    [/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>"],
    [/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>"],
    [/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>"],
    [/\[center\]([\s\S]*?)\[\/center\]/gi, '<div class="text-center">$1</div>'],
    [/\[left\]([\s\S]*?)\[\/left\]/gi, '<div class="text-left">$1</div>'],
    [/\[right\]([\s\S]*?)\[\/right\]/gi, '<div class="text-right">$1</div>'],
    [
      /\[quote(?:=[^\]]*)?\]([\s\S]*?)\[\/quote\]/gi,
      '<blockquote class="border-l-4 border-[var(--color-primary)] pl-4 italic">$1</blockquote>',
    ],
    [
      /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
      '<details class="my-3 rounded-xl bg-black/20 p-3"><summary class="cursor-pointer font-medium">Spoiler</summary><div class="mt-2">$1</div></details>',
    ],
    [/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre class="overflow-x-auto rounded-lg bg-black/30 p-3"><code>$1</code></pre>'],
  ];

  for (const [pattern, replacement] of blockTags) {
    html = applyUntilStable(html, pattern, (_, content) =>
      replacement.replace("$1", content ?? "")
    );
  }

  html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, body) => {
    const items = body
      .split(/\[\*\]/)
      .map((item: string) => item.trim())
      .filter(Boolean)
      .map((item: string) => `<li>${item}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/\[youtube\]([\s\S]*?)\[\/youtube\]/gi, (_, id) => {
    const videoId = id.trim();
    return `<div class="aspect-video my-4 overflow-hidden rounded-xl"><iframe class="h-full w-full" src="https://www.youtube.com/embed/${escapeHtml(videoId)}" title="YouTube video" loading="lazy" allowfullscreen></iframe></div>`;
  });

  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br />");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

export function formatModDescription(raw: string): string {
  if (!raw.trim()) return "";
  if (hasBbcodeTags(raw)) return bbcodeToHtml(raw);
  if (/<\s*(p|div|br|ul|ol|li|a|img|span|strong|em|h[1-6]|table)\b/i.test(raw)) return raw;
  return bbcodeToHtml(raw);
}
