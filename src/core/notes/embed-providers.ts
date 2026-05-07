export type EmbedProvider =
  | "youtube"
  | "vimeo"
  | "spotify"
  | "soundcloud"
  | "twitter"
  | "github_gist"
  | "codesandbox"
  | "loom";

export type EmbedDetectionResult = {
  provider: EmbedProvider;
  embed_url: string;
  canonical_url: string;
};

type ProviderConfig = {
  name: EmbedProvider;
  pattern: RegExp;
  buildEmbedUrl: (match: RegExpExecArray, originalUrl: string) => string;
  oembedEndpoint?: (url: string) => string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    name: "youtube",
    pattern:
      /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    buildEmbedUrl: (m) =>
      `https://www.youtube.com/embed/${m[1]}`,
    oembedEndpoint: (url) =>
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  },
  {
    name: "vimeo",
    pattern: /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/,
    buildEmbedUrl: (m) => `https://player.vimeo.com/video/${m[1]}`,
    oembedEndpoint: (url) =>
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  },
  {
    name: "spotify",
    pattern:
      /^https?:\/\/open\.spotify\.com\/(track|album|episode|playlist)\/([A-Za-z0-9]+)/,
    buildEmbedUrl: (m) =>
      `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
  },
  {
    name: "soundcloud",
    pattern:
      /^https?:\/\/(?:www\.)?soundcloud\.com\/[^/]+\/[^/?#]+/,
    buildEmbedUrl: (_m, originalUrl) =>
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(originalUrl)}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false`,
    oembedEndpoint: (url) =>
      `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  },
  {
    name: "twitter",
    pattern:
      /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/,
    buildEmbedUrl: (m) =>
      `https://platform.twitter.com/embed/Tweet.html?dnt=true&id=${m[1]}`,
    oembedEndpoint: (url) =>
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
  },
  {
    name: "github_gist",
    pattern: /^https?:\/\/gist\.github\.com\/([^/]+)\/([A-Za-z0-9]+)/,
    buildEmbedUrl: (m) =>
      `/api/embed/gist?user=${encodeURIComponent(m[1])}&id=${encodeURIComponent(m[2])}`,
  },
  {
    name: "codesandbox",
    pattern: /^https?:\/\/(?:www\.)?codesandbox\.io\/s\/([^/?#]+)/,
    buildEmbedUrl: (m) =>
      `https://codesandbox.io/embed/${m[1]}?fontsize=14&hidenavigation=1&theme=dark`,
  },
  {
    name: "loom",
    pattern: /^https?:\/\/(?:www\.)?loom\.com\/share\/([A-Za-z0-9]+)/,
    buildEmbedUrl: (m) => `https://www.loom.com/embed/${m[1]}`,
    oembedEndpoint: (url) =>
      `https://www.loom.com/v1/oembed?url=${encodeURIComponent(url)}`,
  },
];

export function detectEmbedProvider(url: string): EmbedDetectionResult | null {
  const trimmed = url.trim();
  for (const provider of PROVIDERS) {
    const m = provider.pattern.exec(trimmed);
    if (m) {
      return {
        provider: provider.name,
        embed_url: provider.buildEmbedUrl(m, trimmed),
        canonical_url: trimmed,
      };
    }
  }
  return null;
}

export function getOembedEndpoint(url: string): string | null {
  const trimmed = url.trim();
  for (const provider of PROVIDERS) {
    const m = provider.pattern.exec(trimmed);
    if (m && provider.oembedEndpoint) {
      return provider.oembedEndpoint(trimmed);
    }
  }
  return null;
}

export const PROVIDER_LABELS: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  twitter: "Twitter / X",
  github_gist: "GitHub Gist",
  codesandbox: "CodeSandbox",
  loom: "Loom",
};

export type AspectRatioClass = "video" | "music" | "tweet" | "code";

export const PROVIDER_ASPECT: Record<EmbedProvider, AspectRatioClass> = {
  youtube: "video",
  vimeo: "video",
  loom: "video",
  codesandbox: "video",
  spotify: "music",
  soundcloud: "music",
  twitter: "tweet",
  github_gist: "code",
};
