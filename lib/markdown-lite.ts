/**
 * A deliberately small markdown subset — bold, italic, inline code, line
 * breaks — rendered without pulling in a markdown library or an HTML
 * sanitizer. Everything is HTML-escaped FIRST, and only afterward do a
 * few known-safe patterns get turned into tags, so there's no path for
 * someone to inject a script tag through a note, a hook, or a budget
 * field that another teammate will later view.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLiteMarkdown(input: string): string {
  const escaped = escapeHtml(input);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}
