"use client";

import { useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  DownloadIcon,
  ExpandIcon,
  TrashIcon,
} from "@/components/ui/icons";

type Align = "left" | "center" | "right";

/** Download a (cross-origin) image as a file. */
export async function downloadImage(src: string, name = "script-image") {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    window.open(src, "_blank", "noopener");
  }
}

function ImageView({ node, updateAttributes, deleteNode, selected, editor }: ReactNodeViewProps) {
  const { src, alt, align, width } = node.attrs as { src: string; alt: string | null; align: Align; width: number | null };
  const [viewing, setViewing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const editable = editor.isEditable;

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current;
    const container = box?.parentElement;
    if (!box || !container) return;
    const startX = e.clientX;
    const startW = box.getBoundingClientRect().width;
    const full = container.getBoundingClientRect().width;
    const sign = align === "right" ? -1 : 1;
    const move = (ev: PointerEvent) => {
      const w = Math.min(full, Math.max(full * 0.15, startW + sign * (ev.clientX - startX) * (align === "center" ? 2 : 1)));
      updateAttributes({ width: Math.round((w / full) * 100) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const btn =
    "w-8 h-8 rounded-md flex items-center justify-center text-white/85 hover:text-white hover:bg-white/15 transition-colors";
  const on = "bg-white/20 text-white";

  return (
    <NodeViewWrapper
      className="script-image my-4 flex"
      style={{ justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}
      data-drag-handle
    >
      <div
        ref={boxRef}
        className={`group relative inline-block max-w-full rounded-lg ${selected && editable ? "ring-2 ring-amber ring-offset-2 ring-offset-transparent" : ""}`}
        style={{ width: width ? `${width}%` : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          loading="lazy"
          decoding="async"
          className="block w-full h-auto rounded-lg"
          onDoubleClick={() => setViewing(true)}
        />

        {/* Toolbar: always for editors when selected; view/download on hover for readers. */}
        <div
          contentEditable={false}
          className={`absolute left-1/2 -translate-x-1/2 top-2 z-10 flex items-center gap-0.5 rounded-lg bg-black/80 backdrop-blur px-1 py-1 shadow-lg transition-opacity ${
            selected && editable ? "opacity-100" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
          }`}
        >
          {editable && (
            <>
              {([
                ["left", AlignLeftIcon, "Align left"],
                ["center", AlignCenterIcon, "Center"],
                ["right", AlignRightIcon, "Align right"],
              ] as const).map(([a, Icon, label]) => (
                <button key={a} type="button" title={label} aria-label={label} className={`${btn} ${align === a ? on : ""}`} onClick={() => updateAttributes({ align: a })}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
              <span className="w-px h-5 bg-white/20 mx-0.5" />
              {([
                [33, "S"],
                [60, "M"],
                [100, "L"],
              ] as const).map(([w, label]) => (
                <button key={w} type="button" title={`${w}% wide`} className={`${btn} text-[12px] font-bold ${width === w ? on : ""}`} onClick={() => updateAttributes({ width: w })}>
                  {label}
                </button>
              ))}
              <span className="w-px h-5 bg-white/20 mx-0.5" />
            </>
          )}
          <button type="button" title="View full size" aria-label="View full size" className={btn} onClick={() => setViewing(true)}>
            <ExpandIcon className="w-4 h-4" />
          </button>
          <button type="button" title="Download" aria-label="Download image" className={btn} onClick={() => downloadImage(src)}>
            <DownloadIcon className="w-4 h-4" />
          </button>
          {editable && (
            <button type="button" title="Remove" aria-label="Remove image" className={`${btn} hover:!bg-red/70`} onClick={() => deleteNode()}>
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {editable && selected && (
          <span
            contentEditable={false}
            onPointerDown={startResize}
            title="Drag to resize"
            className={`absolute bottom-1.5 ${align === "right" ? "left-1.5 cursor-nesw-resize" : "right-1.5 cursor-nwse-resize"} w-4 h-4 rounded-sm bg-amber border-2 border-white shadow`}
          />
        )}
      </div>
      {viewing && <ImageLightbox url={src} alt={alt ?? ""} onClose={() => setViewing(false)} />}
    </NodeViewWrapper>
  );
}

/** Image block with alignment and width (percent of the page). */
export const ScriptImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (el) => (el.getAttribute("data-align") as Align) || "center",
        renderHTML: (attrs) => ({ "data-align": attrs.align }),
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width");
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { "data-width": attrs.width } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ inline: false, allowBase64: false });
