/** Average speaking pace for short-form video, words per minute. */
export const WORDS_PER_MINUTE = 150;

export function countWords(text: string) {
  const m = text.trim().match(/[\p{L}\p{N}’'-]+/gu);
  return m ? m.length : 0;
}

/** "about 48s" / "about 1m 12s" at WORDS_PER_MINUTE. */
export function spokenLength(words: number) {
  if (words === 0) return "0s";
  const secs = Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** Starting structure for a new script (optional). */
export const SCRIPT_TEMPLATE = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hook" }] },
    { type: "paragraph" },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Body" }] },
    { type: "paragraph" },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Call to action" }] },
    { type: "paragraph" },
  ],
};
