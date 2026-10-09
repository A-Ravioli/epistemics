import { zipSync, strToU8 } from 'fflate';

/** Build a valid PDF from object bodies (1-based numbering in array order), computing the xref table. */
export function buildPdf(objects: string[], rootObj = 1): Uint8Array {
  const enc = new TextEncoder();
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  const byteLen = (s: string) => enc.encode(s).length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteLen(out));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = byteLen(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${rootObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

export function stream(content: string): string {
  return `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`;
}

/** Two-page PDF with a two-entry outline (Chapter One → p1, Chapter Two → p2, plus a nested section on p2). */
export function samplePdf(): Uint8Array {
  const page1 = stream('BT /F1 24 Tf 72 720 Td (Chapter One) Tj 0 -30 Td /F1 12 Tf (Probability is the study of uncertainty.) Tj 0 -14 Td (Events are subsets of the sample space.) Tj ET');
  const page2 = stream('BT /F1 24 Tf 72 720 Td (Chapter Two) Tj 0 -30 Td /F1 12 Tf (Independence means the joint equals the product.) Tj ET');
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 7 0 R /PageMode /UseOutlines >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 9 0 R >> >> >>',
    page1,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 9 0 R >> >> >>',
    page2,
    '<< /Type /Outlines /First 8 0 R /Last 10 0 R /Count 3 >>',
    '<< /Title (Chapter One) /Parent 7 0 R /Next 10 0 R /Dest [3 0 R /XYZ 0 792 0] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Title (Chapter Two) /Parent 7 0 R /Prev 8 0 R /First 11 0 R /Last 11 0 R /Count 1 /Dest [5 0 R /XYZ 0 792 0] >>',
    '<< /Title (Independence) /Parent 10 0 R /Dest [5 0 R /XYZ 0 700 0] >>',
  ]);
}

export function xhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><style>p{margin:0}</style></head><body>${body}</body></html>`;
}

export function sampleEpub(opts: { nav?: boolean } = {}): Uint8Array {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  files['mimetype'] = [strToU8('application/epub+zip'), { level: 0 }];
  files['META-INF/container.xml'] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const navManifest = opts.nav ? `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>` : '';
  files['OEBPS/content.opf'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tiny Probability &amp; Statistics</dc:title><dc:identifier id="uid">urn:uuid:1</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${navManifest}<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`,
  );
  files['OEBPS/toc.ncx'] = strToU8(
    `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="n1"><navLabel><text>Part I: Foundations</text></navLabel><content src="text/ch1.xhtml"/><navPoint id="n2"><navLabel><text>Chapter 1</text></navLabel><content src="text/ch1.xhtml#c1"/></navPoint></navPoint><navPoint id="n3"><navLabel><text>Chapter 2: Independence</text></navLabel><content src="text/ch2.xhtml"/></navPoint></navMap></ncx>`,
  );
  if (opts.nav) {
    files['OEBPS/nav.xhtml'] = strToU8(
      xhtml('nav', `<nav epub:type="toc"><h1>Contents</h1><ol><li><a href="text/ch1.xhtml">Part I: Foundations</a><ol><li><a href="text/ch1.xhtml#c1">Chapter 1</a></li></ol></li><li><a href="text/ch2.xhtml">Chapter 2: Independence</a></li></ol></nav>`),
    );
  }
  files['OEBPS/text/ch1.xhtml'] = strToU8(
    xhtml('ch1', `<h1>Part I: Foundations</h1><p>Probability measures uncertainty &amp; belief.</p><h2 id="c1">Sample spaces</h2><p>The sample space is the set of all outcomes.</p><p>An <em>event</em> is a subset of it.</p>`),
  );
  files['OEBPS/text/ch2.xhtml'] = strToU8(
    xhtml('ch2', `<section><h1>Independence</h1><p>Two events are independent when P(A and B) = P(A)P(B).</p><ul><li>Disjoint is not independent.</li></ul></section>`),
  );
  return zipSync(files as Parameters<typeof zipSync>[0]);
}

export function sampleDocx(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'word/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`,
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Bayes Rule</w:t></w:r></w:p><w:p><w:r><w:t>Bayes rule updates a prior with a likelihood.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Worked example</w:t></w:r></w:p><w:p><w:r><w:t>A test with 99% sensitivity.</w:t></w:r></w:p></w:body></w:document>`,
    ),
  };
  return zipSync(files);
}
