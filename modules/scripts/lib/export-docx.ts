"use client";

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };

const PAGE_WIDTH_PX = 600; // usable width for images in the document

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function hex(color: unknown) {
  if (typeof color !== "string") return "FDE68A";
  const m = color.match(/^#?([0-9a-f]{6})$/i);
  return m ? m[1].toUpperCase() : "FDE68A";
}

function runs(nodes: Node[] | undefined): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    const hl = marks.find((m) => m.type === "highlight");
    const link = marks.find((m) => m.type === "link");
    const run = new TextRun({
      text: n.text,
      bold: has("bold"),
      italics: has("italic"),
      underline: has("underline") || link ? {} : undefined,
      strike: has("strike"),
      color: link ? "2563EB" : undefined,
      shading: hl ? { fill: hex(hl.attrs?.color), type: "clear", color: "auto" } : undefined,
    });
    const href = link?.attrs?.href;
    out.push(typeof href === "string" && /^https?:\/\//.test(href) ? new ExternalHyperlink({ link: href, children: [run] }) : run);
  }
  return out;
}

/** Turn any image URL into PNG bytes (Word can't show WebP) + its size. */
async function imageData(src: string): Promise<{ data: ArrayBuffer; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!png) return null;
    return { data: await png.arrayBuffer(), w: bitmap.width, h: bitmap.height };
  } catch {
    return null;
  }
}

async function blocks(nodes: Node[] | undefined, ctx: { list?: { kind: "bullet" | "number"; level: number }; quote?: boolean } = {}): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  for (const n of nodes ?? []) {
    const align = ALIGN[(n.attrs?.textAlign as string) ?? ""];
    const base: Partial<IParagraphOptions> = {
      alignment: align,
      ...(ctx.quote ? { indent: { left: 480 }, border: { left: { style: "single", size: 12, color: "BBBBBB", space: 8 } } } : {}),
    };
    switch (n.type) {
      case "paragraph":
        out.push(
          new Paragraph({
            ...base,
            children: runs(n.content),
            ...(ctx.list
              ? ctx.list.kind === "bullet"
                ? { bullet: { level: ctx.list.level } }
                : { numbering: { reference: "script-numbers", level: ctx.list.level } }
              : {}),
            spacing: { after: 120 },
          })
        );
        break;
      case "heading": {
        const level = (n.attrs?.level as number) ?? 2;
        out.push(
          new Paragraph({
            ...base,
            heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: runs(n.content),
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }
      case "bulletList":
      case "orderedList":
        for (const item of n.content ?? []) {
          out.push(
            ...(await blocks(item.content, {
              ...ctx,
              list: { kind: n.type === "bulletList" ? "bullet" : "number", level: ctx.list ? Math.min(ctx.list.level + 1, 5) : 0 },
            }))
          );
        }
        break;
      case "taskList":
        for (const item of n.content ?? []) {
          const checked = !!item.attrs?.checked;
          const [first, ...rest] = item.content ?? [];
          out.push(
            new Paragraph({
              children: [new TextRun({ text: checked ? "☑ " : "☐ " }), ...runs(first?.content)],
              spacing: { after: 80 },
            })
          );
          out.push(...(await blocks(rest, ctx)));
        }
        break;
      case "blockquote":
        out.push(...(await blocks(n.content, { ...ctx, quote: true })));
        break;
      case "horizontalRule":
        out.push(new Paragraph({ border: { bottom: { style: "single", size: 6, color: "CCCCCC", space: 4 } }, children: [] }));
        break;
      case "image": {
        const src = n.attrs?.src as string | undefined;
        const img = src ? await imageData(src) : null;
        if (!img) break;
        const pct = Math.min(100, Math.max(15, Number(n.attrs?.width) || 100));
        const w = Math.min(img.w, Math.round((PAGE_WIDTH_PX * pct) / 100));
        const h = Math.round((img.h / img.w) * w);
        out.push(
          new Paragraph({
            alignment: ALIGN[(n.attrs?.align as string) ?? "center"] ?? AlignmentType.CENTER,
            children: [new ImageRun({ type: "png", data: img.data, transformation: { width: w, height: h } })],
            spacing: { before: 120, after: 120 },
          })
        );
        break;
      }
      default:
        if (n.content) out.push(...(await blocks(n.content, ctx)));
    }
  }
  return out;
}

/** Build and download a .docx of the script. */
export async function exportScriptDocx(doc: Node, title: string, fileName: string) {
  const body = await blocks(doc.content);
  const document = new Document({
    title,
    numbering: {
      config: [
        {
          reference: "script-numbers",
          levels: Array.from({ length: 6 }, (_, i) => ({
            level: i,
            format: LevelFormat.DECIMAL,
            text: `%${i + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }), ...body],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${fileName}.docx`;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
