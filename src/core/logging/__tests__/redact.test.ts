import { describe, it, expect } from "vitest";
import pino from "pino";

describe("Pino redact config", () => {
  it("redacts sensitive fields while preserving benign fields", () => {
    const lines: string[] = [];

    const testLogger = pino(
      {
        level: "debug",
        redact: {
          paths: [
            "access_token",
            "refresh_token",
            "token",
            "password",
            "authorization",
            "req.headers.authorization",
            "req.headers.cookie",
            "*.access_token",
            "*.refresh_token",
            "*.encrypted",
            "*_encrypted",
          ],
          censor: "[REDACTED]",
        },
      },
      {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    );

    testLogger.info({
      user_id: "usr_123",
      access_token: "secret-token-value",
      password: "hunter2",
    });

    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("");

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("secret-token-value");
    expect(output).not.toContain("hunter2");
    expect(output).toContain("usr_123");
  });

  it("redacts nested sensitive fields", () => {
    const lines: string[] = [];

    const testLogger = pino(
      {
        level: "debug",
        redact: {
          paths: [
            "access_token",
            "refresh_token",
            "token",
            "password",
            "authorization",
            "req.headers.authorization",
            "req.headers.cookie",
            "*.access_token",
            "*.refresh_token",
            "*.encrypted",
            "*_encrypted",
          ],
          censor: "[REDACTED]",
        },
      },
      {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    );

    testLogger.info({
      user_id: "usr_456",
      session: { access_token: "nested-token", refresh_token: "nested-refresh" },
    });

    const output = lines.join("");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("nested-token");
    expect(output).not.toContain("nested-refresh");
    expect(output).toContain("usr_456");
  });
});
