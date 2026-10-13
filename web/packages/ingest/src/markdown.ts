/**
 * Markdown and plain-text parsers. Markdown is split into sections on ATX
 * headings (`#`..`######`), ignoring headings inside fenced code blocks.
 */
import { sha256 } from '@epistemics/core';
import type { ParsedDoc, ParsedSection } from './types.js';
import { normalizeText } from './util.js';

export interface MarkdownOptions {
  /** Fallback title when the document has no level-1 heading. */
  title?: string;
}

export function markdownToSections(text: string): { sections: ParsedSection[]; firstH1?: string } {
  const lines = normalizeText(text).split('\n');
  const sections: ParsedSection[] = [];
  const stack: { level: number; text: string }[] = [];
  let path: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  let firstH1: string | undefined;
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ headingPath: path.slice(), text: body });
    buf = [];
  };
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      buf.push(line);
      continue;
    }
    const m = !inFence ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (!m) {
      buf.push(line);
      continue;
    }
    flush();
    const level = m[1]!.length;
    const heading = m[2]!.trim();
    if (level === 1 && firstH1 === undefined) firstH1 = heading;
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text: heading });
    path = stack.map((h) => h.text);
  }
  flush();
  return firstH1 === undefined ? { sections } : { sections, firstH1 };
}

export async function parseMarkdown(text: string, opts: MarkdownOptions = {}): Promise<ParsedDoc> {
  const { sections, firstH1 } = markdownToSections(text);
  return {
    title: firstH1 ?? opts.title ?? 'Untitled',
    kind: 'md',
    sections: sections.length ? sections : [{ headingPath: [], text: '' }],
    hash: await sha256(text),
  };
}

export async function parseText(text: string, opts: MarkdownOptions = {}): Promise<ParsedDoc> {
  const body = normalizeText(text);
  return {
    title: opts.title ?? 'Untitled',
    kind: 'txt',
    sections: [{ headingPath: [], text: body }],
    hash: await sha256(text),
  };
}
