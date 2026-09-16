/**
 * EPUB parsing: unzip with fflate, read container.xml → OPF (metadata,
 * manifest, spine) → TOC (EPUB 3 nav document or EPUB 2 NCX), then extract
 * each spine document's text as sections with heading paths.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { blocksToSections, htmlToBlocks } from './html.js';
import type { ParsedDoc, ParsedSection } from './types.js';
import { basenameNoExt, sha256Bytes } from './util.js';
import { findAll, findFirst, parseXml, textOf, type XmlNode } from './xml.js';

export interface EpubOptions {
  title?: string;
  /** Force the DOM-free HTML tokenizer (tests). */
  forceFallbackHtml?: boolean;
}

export interface EpubTocEntry {
  path: string[];
  href: string;
  fragment?: string;
}

export interface EpubParseResult extends ParsedDoc {
  kind: 'epub';
  toc: EpubTocEntry[];
  spine: string[];
}

export async function parseEpub(bytes: Uint8Array, opts: EpubOptions = {}): Promise<EpubParseResult> {
  const hash = await sha256Bytes(bytes);
  const files = unzipSync(bytes);
  const read = (path: string): string | undefined => {
    const key = normalizePath(path);
    const hit = files[key] ?? files[decodeURIComponent(key)];
    return hit ? strFromU8(hit) : undefined;
  };

  const containerXml = read('META-INF/container.xml');
  if (!containerXml) throw new Error('parseEpub: META-INF/container.xml missing (not an EPUB?)');
  const rootfile = findFirst(parseXml(containerXml), 'rootfile');
  const opfPath = rootfile?.attrs['full-path'];
  if (!opfPath) throw new Error('parseEpub: container.xml has no rootfile');
  const opfXml = read(opfPath);
  if (!opfXml) throw new Error(`parseEpub: package document ${opfPath} missing`);
  const opfDir = dirname(opfPath);
  const opf = parseXml(opfXml);

  const metadata = findFirst(opf, 'metadata');
  const dcTitle = metadata ? textOf(findFirst(metadata, 'title')) : '';
  const title = dcTitle || (opts.title ? basenameNoExt(opts.title) : '') || 'Untitled EPUB';

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const item of findAll(opf, 'item')) {
    const id = item.attrs['id'];
    const href = item.attrs['href'];
    if (!id || !href) continue;
    manifest.set(id, {
      href: resolvePath(opfDir, href),
      mediaType: item.attrs['media-type'] ?? '',
      properties: item.attrs['properties'] ?? '',
    });
  }
  const spineNode = findFirst(opf, 'spine');
  const spine: string[] = [];
  for (const ref of findAll(opf, 'itemref')) {
    const item = ref.attrs['idref'] ? manifest.get(ref.attrs['idref']) : undefined;
    if (item && !item.properties.split(/\s+/).includes('nav')) spine.push(item.href);
  }

  // TOC: prefer the EPUB 3 nav document, fall back to NCX.
  let toc: EpubTocEntry[] = [];
  const navItem = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('nav'));
  if (navItem) {
    const navXml = read(navItem.href);
    if (navXml) toc = parseNavDoc(navXml, dirname(navItem.href));
  }
  if (!toc.length) {
    const ncxId = spineNode?.attrs['toc'];
    const ncxItem = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.mediaType === 'application/x-dtbncx+xml');
    if (ncxItem) {
      const ncxXml = read(ncxItem.href);
      if (ncxXml) toc = parseNcx(ncxXml, dirname(ncxItem.href));
    }
  }
  const tocByFile = new Map<string, EpubTocEntry>();
  for (const e of toc) if (!tocByFile.has(e.href)) tocByFile.set(e.href, e);

  const sections: ParsedSection[] = [];
  for (const href of spine) {
    const xhtml = read(href);
    if (!xhtml) continue;
    const blocks = htmlToBlocks(xhtml, opts.forceFallbackHtml ? { forceFallback: true } : {});
    const base = tocByFile.get(href)?.path ?? [];
    sections.push(...blocksToSections(blocks, base));
  }

  return { title, kind: 'epub', sections, hash, toc, spine };
}

// ---------------------------------------------------------------------------
// TOC parsers
// ---------------------------------------------------------------------------

export function parseNcx(xml: string, baseDir: string): EpubTocEntry[] {
  const doc = parseXml(xml);
  const navMap = findFirst(doc, 'navmap');
  if (!navMap) return [];
  const out: EpubTocEntry[] = [];
  const visit = (node: XmlNode, path: string[]) => {
    for (const np of node.children.filter((c) => c.name === 'navpoint')) {
      const label = textOf(findFirst(np, 'navlabel'));
      const src = findFirst(np, 'content')?.attrs['src'] ?? '';
      const p = [...path, label];
      out.push(splitHref(src, baseDir, p));
      visit(np, p);
    }
  };
  visit(navMap, []);
  return out;
}

export function parseNavDoc(xhtml: string, baseDir: string): EpubTocEntry[] {
  const doc = parseXml(xhtml);
  const navs = findAll(doc, 'nav');
  const tocNav = navs.find((n) => (n.attrs['epub:type'] ?? n.attrs['type'] ?? '').split(/\s+/).includes('toc')) ?? navs[0];
  if (!tocNav) return [];
  const out: EpubTocEntry[] = [];
  const visitList = (ol: XmlNode, path: string[]) => {
    for (const li of ol.children.filter((c) => c.name === 'li')) {
      const a = li.children.find((c) => c.name === 'a') ?? findFirst(li, 'a');
      const span = li.children.find((c) => c.name === 'span');
      const label = textOf(a) || textOf(span);
      const p = [...path, label];
      if (a?.attrs['href']) out.push(splitHref(a.attrs['href'], baseDir, p));
      for (const sub of li.children.filter((c) => c.name === 'ol')) visitList(sub, p);
    }
  };
  const ol = findFirst(tocNav, 'ol');
  if (ol) visitList(ol, []);
  return out;
}

function splitHref(src: string, baseDir: string, path: string[]): EpubTocEntry {
  const [file, fragment] = src.split('#', 2);
  const href = resolvePath(baseDir, file ?? '');
  return fragment ? { path, href, fragment } : { path, href };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '';
}

export function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function resolvePath(baseDir: string, href: string): string {
  let h = href;
  try {
    h = decodeURIComponent(href);
  } catch {
    /* keep raw */
  }
  return normalizePath(h.startsWith('/') ? h : baseDir ? `${baseDir}/${h}` : h);
}
