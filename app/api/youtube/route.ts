import { NextRequest } from "next/server";

export const runtime = "nodejs";

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query?.trim()) {
    return Response.json({ ok: false, error: "Missing query" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "YouTube API not configured." }, { status: 503 });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", req.nextUrl.searchParams.get("maxResults") ?? "3");
  url.searchParams.set("safeSearch", "strict");
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      console.error("[/api/youtube] YouTube API error:", res.status, body);
      return Response.json({ ok: false, error: "YouTube search failed." }, { status: 502 });
    }

    const data = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
        };
      }>;
    };

    const videos: YouTubeVideo[] = (data.items ?? [])
      .filter((item) => item.id?.videoId && item.snippet?.title)
      .map((item) => ({
        videoId: item.id!.videoId!,
        title: item.snippet!.title!,
        channelTitle: item.snippet!.channelTitle ?? "",
        thumbnailUrl:
          item.snippet!.thumbnails?.high?.url ??
          item.snippet!.thumbnails?.medium?.url ??
          `https://img.youtube.com/vi/${item.id!.videoId}/hqdefault.jpg`,
        publishedAt: item.snippet!.publishedAt ?? "",
      }));

    return Response.json({ ok: true, videos });
  } catch (err) {
    console.error("[/api/youtube] fetch error:", err);
    return Response.json({ ok: false, error: "YouTube search unavailable." }, { status: 502 });
  }
}
