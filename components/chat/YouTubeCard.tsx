"use client";

import { useState } from "react";
import { ExternalLink, Play, Video } from "lucide-react";

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

interface VideoTileProps {
  video: YouTubeVideo;
}

function VideoTile({ video }: VideoTileProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="overflow-hidden rounded-xl border border-line bg-canvas-2">
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
        <div className="px-3 py-2">
          <p className="line-clamp-1 text-[13px] font-medium text-ink">{video.title}</p>
          <p className="text-[11px] text-ink-faint">{video.channelTitle}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-canvas-2">
      <button
        onClick={() => setPlaying(true)}
        className="relative block w-full overflow-hidden focus:outline-none"
        aria-label={`Play ${video.title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="aspect-video w-full object-cover transition duration-200 group-hover:brightness-75"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg ring-2 ring-white/20 transition duration-200 group-hover:scale-110 group-hover:bg-[#FF0000]">
            <Play className="ml-0.5 size-5 fill-current" />
          </div>
        </div>
      </button>
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
            {video.title}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">{video.channelTitle}</p>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${video.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 text-ink-faint transition hover:text-brand-400"
          aria-label="Open on YouTube"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

interface YouTubeCardProps {
  videos: YouTubeVideo[];
  contextNote: string;
}

export function YouTubeCard({ videos, contextNote }: YouTubeCardProps) {
  if (!videos.length) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Video className="size-4 shrink-0 text-[#FF0000]" />
        <p className="text-[13px] text-ink-muted">{contextNote}</p>
      </div>
      <div
        className={
          videos.length === 1
            ? "max-w-sm"
            : "grid gap-2.5 sm:grid-cols-2"
        }
      >
        {videos.map((v) => (
          <VideoTile key={v.videoId} video={v} />
        ))}
      </div>
    </div>
  );
}
