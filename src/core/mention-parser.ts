export interface MentionMatch {
  name: string;
  start: number;
  end: number;
}

const END_BOUNDARY = /[\s!?.,:;！？。，；：]/;

function maskIgnoredRanges(content: string): boolean[] {
  const ignored = new Array<boolean>(content.length).fill(false);
  const mark = (start: number, end: number) => {
    for (let i = start; i < end && i < ignored.length; i += 1) ignored[i] = true;
  };

  const fenced = /```[\s\S]*?```/g;
  for (const match of content.matchAll(fenced)) {
    mark(match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  const inline = /`[^`\n]*`/g;
  for (const match of content.matchAll(inline)) {
    mark(match.index ?? 0, (match.index ?? 0) + match[0].length);
  }

  const lines = content.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (/^\s*>/.test(line)) mark(offset, offset + line.length);
    offset += line.length + 1;
  }

  return ignored;
}

export function parseMentions(content: string, agentNames: string[]): MentionMatch[] {
  if (!content || agentNames.length === 0) return [];

  const ignored = maskIgnoredRanges(content);
  const sortedNames = [...new Set(agentNames)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const matches: MentionMatch[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== "@" || ignored[i]) continue;
    const before = i === 0 ? "" : content[i - 1];
    if (before && !/\s/.test(before)) continue;

    for (const name of sortedNames) {
      const start = i + 1;
      const end = start + name.length;
      if (content.slice(start, end) !== name) continue;
      const after = content[end] ?? "";
      if (after && !END_BOUNDARY.test(after)) continue;
      if (seen.has(name)) break;
      matches.push({ name, start: i, end });
      seen.add(name);
      break;
    }
  }

  return matches;
}
