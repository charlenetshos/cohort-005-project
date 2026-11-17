import { describe, expect, it } from "vitest";
import { readNotificationSettings } from "./settings";

const ALL_FOUR = {
  KNOCK_SECRET_API_KEY: "sk_test",
  KNOCK_PUBLIC_API_KEY: "pk_test",
  KNOCK_SIGNING_KEY: "signing",
  KNOCK_FEED_CHANNEL_ID: "channel",
};

describe("readNotificationSettings", () => {
  it("is local mode when none of the Knock settings are present", () => {
    expect(readNotificationSettings({})).toEqual({ mode: "local" });
  });

  it("treats empty values as not present", () => {
    expect(
      readNotificationSettings({ KNOCK_SECRET_API_KEY: "", KNOCK_SIGNING_KEY: "" })
    ).toEqual({ mode: "local" });
  });

  it("is Knock mode when all four Knock settings are present", () => {
    expect(readNotificationSettings(ALL_FOUR)).toEqual({
      mode: "knock",
      secretApiKey: "sk_test",
      publicApiKey: "pk_test",
      signingKey: "signing",
      feedChannelId: "channel",
    });
  });

  it("fails naming the missing settings when only some are present", () => {
    expect(() =>
      readNotificationSettings({
        KNOCK_SECRET_API_KEY: "sk_test",
        KNOCK_PUBLIC_API_KEY: "pk_test",
      })
    ).toThrow(/KNOCK_SIGNING_KEY, KNOCK_FEED_CHANNEL_ID/);
  });
});
