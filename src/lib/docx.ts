// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import JSZip from "jszip";
import { PDF } from "@libpdf/core";

interface PdfLineLayout {
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface PdfPageLayout {
  pageIndex: number;
  width: number;
  height: number;
  text: string;
  lines: PdfLineLayout[];
}

const DEFAULT_PAGE_WIDTH_PT = 612;
const DEFAULT_PAGE_HEIGHT_PT = 792;
const POINT_TO_TWIP = 20;
const POINT_TO_EMU = 12700;
const DEFAULT_SLIDE_WIDTH_EMU = 9_144_000;
const DEFAULT_SLIDE_HEIGHT_EMU = 6_858_000;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePageText(rawPages: unknown[]): PdfPageLayout[] {
  return rawPages.map((rawPage, pageIndex) => {
    const page = rawPage as {
      pageIndex?: unknown;
      width?: unknown;
      height?: unknown;
      text?: unknown;
      lines?: unknown[];
    };

    const width = Math.max(1, toFiniteNumber(page.width, DEFAULT_PAGE_WIDTH_PT));
    const height = Math.max(1, toFiniteNumber(page.height, DEFAULT_PAGE_HEIGHT_PT));
    const rawLines = Array.isArray(page.lines) ? page.lines : [];

    const lines: PdfLineLayout[] = rawLines
      .map((rawLine) => {
        const line = rawLine as {
          text?: unknown;
          bbox?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
        };
        const text = String(line.text ?? "").trim();
        const bbox = line.bbox ?? {};
        const lineWidth = Math.max(0.1, toFiniteNumber(bbox.width, 0));
        const lineHeight = Math.max(0.1, toFiniteNumber(bbox.height, 0));

        return {
          text,
          bbox: {
            x: clamp(toFiniteNumber(bbox.x, 0), 0, width),
            y: clamp(toFiniteNumber(bbox.y, 0), 0, height),
            width: clamp(lineWidth, 0.1, width),
            height: clamp(lineHeight, 0.1, height),
          },
        };
      })
      .filter((line) => line.text.length > 0);

    return {
      pageIndex: Math.max(0, Math.round(toFiniteNumber(page.pageIndex, pageIndex))),
      width,
      height,
      text: String(page.text ?? ""),
      lines,
    };
  });
}

function extractPdfPages(bytes: Uint8Array): Promise<PdfPageLayout[]> {
  return PDF.load(bytes).then((pdf) => {
    const extracted = pdf.extractText() as unknown[];
    return normalizePageText(extracted);
  });
}

function sortLinesForLayout(lines: PdfLineLayout[]): PdfLineLayout[] {
  return [...lines].sort((a, b) => {
    const aTop = a.bbox.y + a.bbox.height;
    const bTop = b.bbox.y + b.bbox.height;
    if (Math.abs(aTop - bTop) > 0.5) {
      return bTop - aTop;
    }
    return a.bbox.x - b.bbox.x;
  });
}

function toTwips(points: number, fallback: number): number {
  const safePoints = toFiniteNumber(points, fallback);
  return Math.max(720, Math.round(safePoints * POINT_TO_TWIP));
}

function toPageTop(page: PdfPageLayout, line: PdfLineLayout): number {
  return clamp(page.height - (line.bbox.y + line.bbox.height), 0, page.height);
}

function buildDocumentXml(pages: PdfPageLayout[]): string {
  const firstPage = pages[0];
  const sectionWidthTwips = toTwips(firstPage?.width ?? DEFAULT_PAGE_WIDTH_PT, DEFAULT_PAGE_WIDTH_PT);
  const sectionHeightTwips = toTwips(
    firstPage?.height ?? DEFAULT_PAGE_HEIGHT_PT,
    DEFAULT_PAGE_HEIGHT_PT,
  );
  const bodyParts: string[] = [];

  pages.forEach((page, pageIndex) => {
    const pageWidthTwips = toTwips(page.width, DEFAULT_PAGE_WIDTH_PT);
    const sortedLines = sortLinesForLayout(page.lines);

    if (sortedLines.length === 0) {
      bodyParts.push("<w:p><w:r><w:t>(No extractable text)</w:t></w:r></w:p>");
    } else {
      let previousBottomFromTop = 0;

      sortedLines.forEach((line, lineIndex) => {
        const topFromTop = toPageTop(page, line);
        const gapFromPrevious =
          lineIndex === 0
            ? topFromTop
            : Math.max(0, topFromTop - previousBottomFromTop);
        const lineHeightPt = clamp(line.bbox.height * 1.2, 8, 72);
        const leftTwips = Math.round((line.bbox.x / page.width) * pageWidthTwips);
        const beforeTwips = clamp(Math.round(gapFromPrevious * POINT_TO_TWIP), 0, 7200);
        const lineTwips = clamp(Math.round(lineHeightPt * POINT_TO_TWIP), 160, 2400);
        const fontHalfPoints = clamp(Math.round(lineHeightPt * 2), 16, 144);

        previousBottomFromTop = topFromTop + line.bbox.height;

        bodyParts.push(
          `<w:p><w:pPr><w:ind w:left="${leftTwips}"/><w:spacing w:before="${beforeTwips}" w:after="0" w:line="${lineTwips}" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:sz w:val="${fontHalfPoints}"/></w:rPr><w:t xml:space="preserve">${escapeXml(
            line.text,
          )}</w:t></w:r></w:p>`,
        );
      });
    }

    if (pageIndex < pages.length - 1) {
      bodyParts.push("<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>");
    }
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable="w14 wp14">
  <w:body>
    ${bodyParts.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="${sectionWidthTwips}" w:h="${sectionHeightTwips}"/>
      <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function columnName(column: number): string {
  let value = "";
  let index = column;
  while (index > 0) {
    const remainder = (index - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    index = Math.floor((index - 1) / 26);
  }
  return value;
}

function buildWorksheetXml(pageNumber: number, page: PdfPageLayout): string {
  const rows = new Map<number, Map<number, string>>();

  const addCell = (row: number, column: number, text: string) => {
    const normalized = text.trim();
    if (normalized.length === 0) {
      return;
    }
    if (!rows.has(row)) {
      rows.set(row, new Map<number, string>());
    }
    const rowMap = rows.get(row);
    if (!rowMap) {
      return;
    }
    const previous = rowMap.get(column);
    rowMap.set(column, previous ? `${previous} | ${normalized}` : normalized);
  };

  addCell(1, 1, `Page ${pageNumber}`);

  const sortedLines = sortLinesForLayout(page.lines);
  for (const line of sortedLines) {
    const topRatio = clamp(toPageTop(page, line) / page.height, 0, 1);
    const leftRatio = clamp(line.bbox.x / page.width, 0, 1);
    const row = clamp(2 + Math.round(topRatio * 160), 2, 8192);
    const column = clamp(1 + Math.round(leftRatio * 32), 1, 256);

    addCell(row, column, line.text);
  }

  if (rows.size === 1) {
    addCell(2, 1, "(No extractable text)");
  }

  const orderedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  const rowXml = orderedRows.map(([rowIndex, columns]) => {
    const orderedColumns = [...columns.entries()].sort((a, b) => a[0] - b[0]);
    const cellXml = orderedColumns
      .map(([columnIndex, text]) => {
        const cellRef = `${columnName(columnIndex)}${rowIndex}`;
        return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          text,
        )}</t></is></c>`;
      })
      .join("");
    return `      <row r="${rowIndex}">${cellXml}</row>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${rowXml.join("\n")}
  </sheetData>
</worksheet>`;
}

function toEmu(points: number, fallback: number): number {
  return Math.max(1, Math.round(toFiniteNumber(points, fallback) * POINT_TO_EMU));
}

function buildSlideTextShape(
  id: number,
  page: PdfPageLayout,
  line: PdfLineLayout,
  slideWidthEmu: number,
  slideHeightEmu: number,
): string {
  const x = clamp(Math.round((line.bbox.x / page.width) * slideWidthEmu), 0, slideWidthEmu);
  const y = clamp(
    Math.round((toPageTop(page, line) / page.height) * slideHeightEmu),
    0,
    slideHeightEmu,
  );
  const cx = clamp(
    Math.round((line.bbox.width / page.width) * slideWidthEmu),
    12700,
    slideWidthEmu,
  );
  const cy = clamp(
    Math.round((line.bbox.height / page.height) * slideHeightEmu * 1.35),
    12700,
    slideHeightEmu,
  );
  const fontSize = clamp(Math.round(line.bbox.height * 120), 900, 5400);

  return `<p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="Text ${id}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${x}" y="${y}"/>
            <a:ext cx="${cx}" cy="${cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:noFill/>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" anchor="t"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="${fontSize}" dirty="0" smtClean="0"/>
              <a:t xml:space="preserve">${escapeXml(line.text)}</a:t>
            </a:r>
            <a:endParaRPr lang="en-US" sz="${fontSize}"/>
          </a:p>
        </p:txBody>
      </p:sp>`;
}

function buildSlideXml(
  pageNumber: number,
  page: PdfPageLayout,
  slideWidthEmu: number,
  slideHeightEmu: number,
): string {
  const sortedLines = sortLinesForLayout(page.lines);
  const fallbackLine: PdfLineLayout = {
    text: `(Page ${pageNumber}) No extractable text`,
    bbox: {
      x: page.width * 0.1,
      y: page.height * 0.5,
      width: page.width * 0.8,
      height: 16,
    },
  };
  const lines = sortedLines.length > 0 ? sortedLines : [fallbackLine];
  const shapes = lines
    .map((line, index) =>
      buildSlideTextShape(index + 2, page, line, slideWidthEmu, slideHeightEmu),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
${shapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`;
}

export async function convertPdfToDocx(bytes: Uint8Array): Promise<Uint8Array> {
  const pages = await extractPdfPages(bytes);
  const documentXml = buildDocumentXml(pages);

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.folder("word")?.file("document.xml", documentXml);

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}

export async function convertPdfToXlsx(bytes: Uint8Array): Promise<Uint8Array> {
  const pages = await extractPdfPages(bytes);
  const zip = new JSZip();

  const contentTypeOverrides = pages
    .map(
      (_page, index) =>
        `  <Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("\n");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${contentTypeOverrides}
</Types>`,
  );

  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );

  const workbookSheets = pages
    .map(
      (_page, index) =>
        `    <sheet name="Page ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("\n");

  zip.folder("xl")?.file(
    "workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${workbookSheets}
  </sheets>
</workbook>`,
  );

  const workbookRelationships = pages
    .map(
      (_page, index) =>
        `  <Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("\n");

  zip.folder("xl")?.folder("_rels")?.file(
    "workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${workbookRelationships}
</Relationships>`,
  );

  const worksheetsFolder = zip.folder("xl")?.folder("worksheets");
  pages.forEach((page, index) => {
    worksheetsFolder?.file(`sheet${index + 1}.xml`, buildWorksheetXml(index + 1, page));
  });

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}

export async function convertPdfToPptx(bytes: Uint8Array): Promise<Uint8Array> {
  const pages = await extractPdfPages(bytes);
  const slideCount = Math.max(1, pages.length);
  const firstPage = pages[0];
  const slideWidthEmu = firstPage
    ? toEmu(firstPage.width, DEFAULT_PAGE_WIDTH_PT)
    : DEFAULT_SLIDE_WIDTH_EMU;
  const slideHeightEmu = firstPage
    ? toEmu(firstPage.height, DEFAULT_PAGE_HEIGHT_PT)
    : DEFAULT_SLIDE_HEIGHT_EMU;
  const zip = new JSZip();

  const slideContentTypes = Array.from({ length: slideCount }, (_, index) => {
    const slideNumber = index + 1;
    return `  <Override PartName="/ppt/slides/slide${slideNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }).join("\n");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${slideContentTypes}
</Types>`,
  );

  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );

  zip.folder("docProps")?.file(
    "core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>PDFluent Export</dc:title>
  <dc:creator>PDFluent</dc:creator>
</cp:coreProperties>`,
  );

  zip.folder("docProps")?.file(
    "app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>PDFluent</Application>
  <Slides>${slideCount}</Slides>
</Properties>`,
  );

  const slideIdList = Array.from({ length: slideCount }, (_, index) => {
    const slideNumber = index + 1;
    return `    <p:sldId id="${256 + index}" r:id="rId${slideNumber + 1}"/>`;
  }).join("\n");

  zip.folder("ppt")?.file(
    "presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${slideIdList}
  </p:sldIdLst>
  <p:sldSz cx="${slideWidthEmu}" cy="${slideHeightEmu}" type="custom"/>
  <p:notesSz cx="${slideHeightEmu}" cy="${slideWidthEmu}"/>
</p:presentation>`,
  );

  const presentationRelationships = [
    `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    ...Array.from({ length: slideCount }, (_, index) => {
      const slideNumber = index + 1;
      return `  <Relationship Id="rId${slideNumber + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNumber}.xml"/>`;
    }),
  ].join("\n");

  zip.folder("ppt")?.folder("_rels")?.file(
    "presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${presentationRelationships}
</Relationships>`,
  );

  zip.folder("ppt")?.folder("slideMasters")?.file(
    "slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>`,
  );

  zip.folder("ppt")?.folder("slideMasters")?.folder("_rels")?.file(
    "slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
  );

  zip.folder("ppt")?.folder("slideLayouts")?.file(
    "slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`,
  );

  zip.folder("ppt")?.folder("slideLayouts")?.folder("_rels")?.file(
    "slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
  );

  zip.folder("ppt")?.folder("theme")?.file(
    "theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PDFluent Theme">
  <a:themeElements>
    <a:clrScheme name="PDFluent">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2A44"/></a:dk2>
      <a:lt2><a:srgbClr val="EEF2FB"/></a:lt2>
      <a:accent1><a:srgbClr val="3B82F6"/></a:accent1>
      <a:accent2><a:srgbClr val="10B981"/></a:accent2>
      <a:accent3><a:srgbClr val="F59E0B"/></a:accent3>
      <a:accent4><a:srgbClr val="EF4444"/></a:accent4>
      <a:accent5><a:srgbClr val="2563EB"/></a:accent5>
      <a:accent6><a:srgbClr val="06B6D4"/></a:accent6>
      <a:hlink><a:srgbClr val="3B82F6"/></a:hlink>
      <a:folHlink><a:srgbClr val="1D4ED8"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="PDFluent">
      <a:majorFont><a:latin typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="PDFluent"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
  </a:themeElements>
</a:theme>`,
  );

  const slidesFolder = zip.folder("ppt")?.folder("slides");
  const slideRelsFolder = zip.folder("ppt")?.folder("slides")?.folder("_rels");
  Array.from({ length: slideCount }, (_, index) => {
    const pageNumber = index + 1;
    const page = pages[index] ?? {
      pageIndex: index,
      width: DEFAULT_PAGE_WIDTH_PT,
      height: DEFAULT_PAGE_HEIGHT_PT,
      text: "",
      lines: [],
    };
    slidesFolder?.file(
      `slide${pageNumber}.xml`,
      buildSlideXml(pageNumber, page, slideWidthEmu, slideHeightEmu),
    );
    slideRelsFolder?.file(
      `slide${pageNumber}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
    );
  });

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}
