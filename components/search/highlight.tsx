/** Renders `text` with the first case-insensitive match of `query` emphasized. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < 2) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-amber/20 text-inherit rounded-[3px] px-[1px]">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
