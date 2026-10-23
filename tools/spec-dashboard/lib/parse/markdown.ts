/**
 * Small Markdown helpers shared by the parsers. They understand just enough
 * structure (headings, fenced code, checkboxes) for this repo's spec and memory
 * files, and never throw on unexpected input.
 */

export interface Section {
  heading: string;
  body: string;
}

/** Removes fenced code blocks (``` … ```), so examples inside them aren't parsed as content. */
export const stripFences = (markdown: string): string => markdown.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');

/**
 * Splits Markdown into sections at headings of exactly `level` (e.g. 2 for `## `).
 * Text before the first such heading is dropped. Bodies are trimmed.
 */
export const sections = (markdown: string, level: number): Section[] => {
  const marker = `${'#'.repeat(level)} `;
  const result: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith(marker)) {
      if (current) result.push({ heading: current.heading, body: current.lines.join('\n').trim() });
      current = { heading: line.slice(marker.length).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) result.push({ heading: current.heading, body: current.lines.join('\n').trim() });
  return result;
};

/** The first section whose heading starts with `prefix` (case-insensitive). */
export const findSection = (markdown: string, level: number, prefix: string): Section | undefined =>
  sections(markdown, level).find((section) => section.heading.toLowerCase().startsWith(prefix.toLowerCase()));

export interface Checkbox {
  id: string;
  text: string;
  done: boolean;
}

/**
 * Reads `- [ ] **ID…** text` checkbox items whose bold id matches `idPattern`
 * (e.g. `AC-\d+` or `T\d+`). Indented continuation lines are joined to the
 * item, except bold note lines such as `**Result (…):**`.
 */
export const checkboxes = (markdown: string, idPattern: string): Checkbox[] => {
  const itemPattern = new RegExp(`^\\s*[-*] \\[([ xX])\\] \\*\\*(${idPattern}):?\\*\\*:?\\s*(.*)$`);
  const items: Checkbox[] = [];
  let open: Checkbox | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const match = itemPattern.exec(line);
    if (match) {
      open = { id: match[2], text: match[3].trim(), done: match[1].toLowerCase() === 'x' };
      items.push(open);
    } else if (open && /^\s+\S/.test(line) && !/^\s*[-*] /.test(line) && !/^\s*\*\*[^*]+:\*\*/.test(line)) {
      open.text = `${open.text} ${line.trim()}`.trim();
    } else {
      open = null;
    }
  }
  return items;
};

/** Collapses a paragraph's line breaks into single spaces. */
export const oneLine = (text: string): string => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(' ');
