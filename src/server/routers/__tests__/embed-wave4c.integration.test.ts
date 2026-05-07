import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import type { User } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { notesRouter } from "@/server/routers/notes";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(
    /^'+|'+$/g,
    "",
  );
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let testUser: User;

function makeCaller() {
  return notesRouter.createCaller({ user: testUser });
}

beforeAll(async () => {
  const userId = uuidv7();
  testUser = await rawDb.user.create({
    data: {
      id: userId,
      clerk_id: `test_embed_wave4c_${userId}`,
      email: `embed-wave4c-${userId}@atlas.test`,
      name: "Embed Wave 4c Integration Test User",
    },
  });
});

afterAll(async () => {
  await rawDb.$executeRaw`DELETE FROM "Note" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${testUser.id}::uuid`;
  await rawDb.$disconnect();
});

describe("resolveEmbed — provider detection", () => {
  it("resolves a YouTube URL and returns provider + embed_url", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result.provider).toBe("youtube");
    expect(result.embed_url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(result.canonical_url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("resolves a Vimeo URL", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://vimeo.com/123456789",
    });

    expect(result.provider).toBe("vimeo");
    expect(result.embed_url).toContain("player.vimeo.com/video/123456789");
  });

  it("resolves a Spotify track URL", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });

    expect(result.provider).toBe("spotify");
    expect(result.embed_url).toContain("open.spotify.com/embed/track/");
  });

  it("resolves a SoundCloud URL", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://soundcloud.com/artist/track-name",
    });

    expect(result.provider).toBe("soundcloud");
    expect(result.embed_url).toContain("w.soundcloud.com/player/");
    expect(result.embed_url).not.toContain("%23");
  });

  it("resolves a Twitter/X status URL", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://twitter.com/user/status/1234567890",
    });

    expect(result.provider).toBe("twitter");
    expect(result.embed_url).toContain("platform.twitter.com/embed/Tweet.html");
  });

  it("resolves a GitHub Gist URL via internal proxy", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://gist.github.com/octocat/abc123def456",
    });

    expect(result.provider).toBe("github_gist");
    expect(result.embed_url).toBe("/api/embed/gist?user=octocat&id=abc123def456");
    expect(result.canonical_url).toBe("https://gist.github.com/octocat/abc123def456");
  });

  it("resolves a CodeSandbox URL", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://codesandbox.io/s/react-new-8ll63",
    });

    expect(result.provider).toBe("codesandbox");
    expect(result.embed_url).toContain("codesandbox.io/embed/react-new-8ll63");
  });

  it("resolves a Loom share URL", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://www.loom.com/share/abc123def456",
    });

    expect(result.provider).toBe("loom");
    expect(result.embed_url).toContain("www.loom.com/embed/abc123def456");
  });

  it("throws BAD_REQUEST for an unsupported URL", async () => {
    const caller = makeCaller();
    await expect(
      caller.resolveEmbed({ url: "https://www.example.com/some/page" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it("throws BAD_REQUEST for a random non-provider domain", async () => {
    const caller = makeCaller();
    await expect(
      caller.resolveEmbed({ url: "https://notaprovider.io/video/12345" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it("includes title/thumbnail_url fields in the response shape (may be null for test URLs)", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("thumbnail_url");
    expect(typeof result.title === "string" || result.title === null).toBe(true);
    expect(typeof result.thumbnail_url === "string" || result.thumbnail_url === null).toBe(true);
  });

  it("x.com URL is treated as twitter provider", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://x.com/user/status/9876543210",
    });

    expect(result.provider).toBe("twitter");
    expect(result.embed_url).toContain("platform.twitter.com/embed/Tweet.html");
  });

  it("youtu.be shortlink is resolved as youtube", async () => {
    const caller = makeCaller();
    const result = await caller.resolveEmbed({
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(result.provider).toBe("youtube");
    expect(result.embed_url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });
});
