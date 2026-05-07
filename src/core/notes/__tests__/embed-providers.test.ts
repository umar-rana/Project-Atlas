import { describe, it, expect } from "vitest";
import {
  detectEmbedProvider,
  getOembedEndpoint,
  PROVIDER_LABELS,
  PROVIDER_ASPECT,
} from "../embed-providers";

describe("detectEmbedProvider", () => {
  describe("YouTube", () => {
    it("detects standard watch URL", () => {
      const result = detectEmbedProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("youtube");
      expect(result!.embed_url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    it("detects short youtu.be URL", () => {
      const result = detectEmbedProvider("https://youtu.be/dQw4w9WgXcQ");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("youtube");
      expect(result!.embed_url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    it("detects URL with extra query params", () => {
      const result = detectEmbedProvider("https://www.youtube.com/watch?t=30&v=dQw4w9WgXcQ");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("youtube");
    });
  });

  describe("Vimeo", () => {
    it("detects numeric vimeo URL", () => {
      const result = detectEmbedProvider("https://vimeo.com/123456789");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("vimeo");
      expect(result!.embed_url).toBe("https://player.vimeo.com/video/123456789");
    });
  });

  describe("Spotify", () => {
    it("detects track URL", () => {
      const result = detectEmbedProvider("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("spotify");
      expect(result!.embed_url).toBe("https://open.spotify.com/embed/track/4iV5W9uYEdYUVa79Axb7Rh");
    });

    it("detects album URL", () => {
      const result = detectEmbedProvider("https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("spotify");
      expect(result!.embed_url).toContain("embed/album/");
    });

    it("detects episode URL", () => {
      const result = detectEmbedProvider("https://open.spotify.com/episode/5MNTz4sH2m2JUXG5qAbXaZ");
      expect(result!.embed_url).toContain("embed/episode/");
    });

    it("detects playlist URL", () => {
      const result = detectEmbedProvider("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
      expect(result!.embed_url).toContain("embed/playlist/");
    });
  });

  describe("SoundCloud", () => {
    it("detects track URL", () => {
      const result = detectEmbedProvider("https://soundcloud.com/artist/track-name");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("soundcloud");
      expect(result!.embed_url).toContain("w.soundcloud.com/player/");
      expect(result!.embed_url).toContain(encodeURIComponent("https://soundcloud.com/artist/track-name"));
      expect(result!.embed_url).not.toContain("%23");
    });
  });

  describe("Twitter / X", () => {
    it("detects twitter.com status URL", () => {
      const result = detectEmbedProvider("https://twitter.com/user/status/1234567890");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("twitter");
      expect(result!.embed_url).toContain("platform.twitter.com/embed/Tweet.html");
      expect(result!.embed_url).toContain("id=1234567890");
    });

    it("detects x.com status URL", () => {
      const result = detectEmbedProvider("https://x.com/user/status/9876543210");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("twitter");
      expect(result!.embed_url).toContain("id=9876543210");
    });
  });

  describe("GitHub Gist", () => {
    it("detects gist URL with hex ID", () => {
      const result = detectEmbedProvider("https://gist.github.com/octocat/abc123def456");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("github_gist");
      expect(result!.embed_url).toBe("/api/embed/gist?user=octocat&id=abc123def456");
    });

    it("detects gist URL with mixed-case alphanumeric ID", () => {
      const result = detectEmbedProvider("https://gist.github.com/user/ABC123xyz");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("github_gist");
    });
  });

  describe("CodeSandbox", () => {
    it("detects /s/ URL", () => {
      const result = detectEmbedProvider("https://codesandbox.io/s/react-new-8ll63");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("codesandbox");
      expect(result!.embed_url).toContain("codesandbox.io/embed/react-new-8ll63");
    });
  });

  describe("Loom", () => {
    it("detects share URL", () => {
      const result = detectEmbedProvider("https://www.loom.com/share/abc123def456");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("loom");
      expect(result!.embed_url).toBe("https://www.loom.com/embed/abc123def456");
    });
  });

  describe("unsupported URLs", () => {
    it("returns null for a random URL", () => {
      expect(detectEmbedProvider("https://www.example.com/page")).toBeNull();
    });

    it("returns null for a Google Docs URL", () => {
      expect(detectEmbedProvider("https://docs.google.com/document/d/abc123")).toBeNull();
    });

    it("returns null for a YouTube channel URL (no video ID)", () => {
      expect(detectEmbedProvider("https://www.youtube.com/channel/UCxxxxxx")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(detectEmbedProvider("")).toBeNull();
    });

    it("trims whitespace before matching", () => {
      const result = detectEmbedProvider("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("youtube");
    });
  });

  describe("canonical_url", () => {
    it("returns trimmed canonical URL", () => {
      const url = "https://vimeo.com/123456789";
      const result = detectEmbedProvider(url);
      expect(result!.canonical_url).toBe(url);
    });
  });
});

describe("getOembedEndpoint", () => {
  it("returns oEmbed URL for YouTube", () => {
    const endpoint = getOembedEndpoint("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(endpoint).not.toBeNull();
    expect(endpoint).toContain("youtube.com/oembed");
  });

  it("returns oEmbed URL for Vimeo", () => {
    const endpoint = getOembedEndpoint("https://vimeo.com/123456789");
    expect(endpoint).toContain("vimeo.com/api/oembed");
  });

  it("returns null for Spotify (no oEmbed)", () => {
    const endpoint = getOembedEndpoint("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh");
    expect(endpoint).toBeNull();
  });

  it("returns null for CodeSandbox (no oEmbed)", () => {
    const endpoint = getOembedEndpoint("https://codesandbox.io/s/react-new-8ll63");
    expect(endpoint).toBeNull();
  });

  it("returns null for unsupported URLs", () => {
    expect(getOembedEndpoint("https://example.com")).toBeNull();
  });
});

describe("PROVIDER_LABELS", () => {
  it("has a label for all 8 providers", () => {
    const providers = ["youtube", "vimeo", "spotify", "soundcloud", "twitter", "github_gist", "codesandbox", "loom"] as const;
    for (const p of providers) {
      expect(PROVIDER_LABELS[p]).toBeTruthy();
    }
  });
});

describe("PROVIDER_ASPECT", () => {
  it("assigns video aspect to youtube, vimeo, loom, codesandbox", () => {
    expect(PROVIDER_ASPECT["youtube"]).toBe("video");
    expect(PROVIDER_ASPECT["vimeo"]).toBe("video");
    expect(PROVIDER_ASPECT["loom"]).toBe("video");
    expect(PROVIDER_ASPECT["codesandbox"]).toBe("video");
  });

  it("assigns music aspect to spotify and soundcloud", () => {
    expect(PROVIDER_ASPECT["spotify"]).toBe("music");
    expect(PROVIDER_ASPECT["soundcloud"]).toBe("music");
  });

  it("assigns tweet aspect to twitter", () => {
    expect(PROVIDER_ASPECT["twitter"]).toBe("tweet");
  });

  it("assigns code aspect to github_gist", () => {
    expect(PROVIDER_ASPECT["github_gist"]).toBe("code");
  });
});
