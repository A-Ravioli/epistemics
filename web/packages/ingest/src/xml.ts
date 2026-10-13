/**
 * Minimal XML tree reader used for EPUB package files (container.xml, OPF,
 * NCX, nav document). Environment-agnostic: no DOMParser required. Handles
 * elements, attributes, text, self-closing tags, comments, CDATA and
 * processing instructions; ignores DTDs. Namespace prefixes are stripped from
 * element names (`dc:title` → `title`).
 */
import { decodeEntities } from './util.js';

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function local(name: string): string {
  const i = name.indexOf(':');
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase();
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(xml)) !== null) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[2] !== undefined) {
      const name = local(m[2]);
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.name === name) {
          stack.length = i;
          break;
        }
      }
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      const attrSrc = m[4] ?? '';
      ATTR.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = ATTR.exec(attrSrc)) !== null) {
        attrs[local(a[1]!)] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
        if (a[1]!.includes(':')) attrs[a[1]!.toLowerCase()] = attrs[local(a[1]!)]!;
      }
      const node: XmlNode = { name: local(m[3]), attrs, children: [], text: '' };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) {
      top.text += decodeEntities(m[6]);
    }
  }
  return root;
}

/** Depth-first search for all descendants with the given local name. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const visit = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.name === name) out.push(c);
      visit(c);
    }
  };
  visit(node);
  return out;
}

export function findFirst(node: XmlNode, name: string): XmlNode | undefined {
  for (const c of node.children) {
    if (c.name === name) return c;
    const hit = findFirst(c, name);
    if (hit) return hit;
  }
  return undefined;
}

/** Concatenated text of a node and all descendants, whitespace-squeezed. */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return '';
  let s = node.text;
  for (const c of node.children) s += ' ' + textOf(c);
  return s.replace(/\s+/g, ' ').trim();
}
