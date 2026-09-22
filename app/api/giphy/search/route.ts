import { NextResponse } from "next/server";

type GiphyImage = { url: string };
type GiphyGif = {
  id: string;
  images: { fixed_width_small?: GiphyImage; fixed_width?: GiphyImage; original?: GiphyImage };
};

export async function GET(request: Request) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GIF search isn't configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=18&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=18&rating=pg-13`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    return NextResponse.json({ error: "Giphy request failed." }, { status: 502 });
  }

  const data = (await res.json()) as { data: GiphyGif[] };
  const gifs = (data.data ?? []).map((g) => ({
    id: g.id,
    preview: g.images.fixed_width_small?.url ?? g.images.fixed_width?.url ?? "",
    full: g.images.fixed_width?.url ?? g.images.original?.url ?? "",
  }));

  return NextResponse.json({ gifs });
}
