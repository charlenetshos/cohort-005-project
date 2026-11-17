import { describe, expect, it } from "vitest";
import { getFeedConfig, type SignKnockToken } from "./feed-config.server";

// The signer is injected so no test signs a real token.

const knockSettings = {
  mode: "knock",
  secretApiKey: "sk_test",
  publicApiKey: "pk_test",
  signingKey: "signing-key",
  feedChannelId: "feed-channel",
} as const;

function recordingSigner() {
  const calls: { userId: string; signingKey: string; expiresInSeconds: number }[] = [];
  const sign: SignKnockToken = async (userId, options) => {
    calls.push({ userId, ...options });
    return `token-for-${userId}`;
  };
  return { sign, calls };
}

describe("getFeedConfig", () => {
  it("is local without Knock settings", async () => {
    const { sign, calls } = recordingSigner();

    expect(await getFeedConfig(7, { settings: { mode: "local" }, sign })).toEqual({
      mode: "local",
    });
    expect(calls).toEqual([]);
  });

  it("signs a 1-hour token for cadence-<id> and hands the browser what it needs for Knock", async () => {
    const { sign, calls } = recordingSigner();

    const config = await getFeedConfig(7, { settings: knockSettings, sign });

    expect(config).toEqual({
      mode: "knock",
      userId: "cadence-7",
      token: "token-for-cadence-7",
      publicKey: "pk_test",
      channelId: "feed-channel",
    });
    expect(calls).toEqual([
      { userId: "cadence-7", signingKey: "signing-key", expiresInSeconds: 3600 },
    ]);
  });
});
