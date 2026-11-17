import { describe, expect, it } from "vitest";
import { knockStore, type KnockTrigger } from "./knock-store.server";
import type { NotificationPayload } from "./payload";

// The Knock store is tested with the trigger call injected at the boundary,
// so no test ever reaches Knock.

const ada = { id: 7, name: "Ada Admin", email: "ada@example.com" };
const bob = { id: 8, name: "Bob Admin", email: "bob@example.com" };
const liam = { id: 3, name: "Liam", email: "liam@example.com" };

const payload: NotificationPayload = {
  kind: "new-refund-request",
  data: {
    studentName: "Liam",
    courseTitle: "Introduction to TypeScript",
    reason: "Not for me",
    url: "/admin/refunds",
  },
};

function recordingTrigger() {
  const calls: { workflow: string; request: Parameters<KnockTrigger>[1] }[] = [];
  const trigger: KnockTrigger = async (workflow, request) => {
    calls.push({ workflow, request });
  };
  return { trigger, calls };
}

describe("knockStore", () => {
  it("triggers the workflow named after the kind, identifying everyone inline as cadence-<id>", async () => {
    const { trigger, calls } = recordingTrigger();

    await knockStore(trigger).add({ recipients: [ada, bob], actor: liam, payload });

    expect(calls).toEqual([
      {
        workflow: "new-refund-request",
        request: {
          recipients: [
            { id: "cadence-7", name: "Ada Admin", email: "ada@example.com" },
            { id: "cadence-8", name: "Bob Admin", email: "bob@example.com" },
          ],
          actor: { id: "cadence-3", name: "Liam", email: "liam@example.com" },
          data: {
            studentName: "Liam",
            courseTitle: "Introduction to TypeScript",
            reason: "Not for me",
            url: "/admin/refunds",
          },
        },
      },
    ]);
  });

  it("leaves the actor out when nobody caused the Notification", async () => {
    const { trigger, calls } = recordingTrigger();

    await knockStore(trigger).add({ recipients: [ada], actor: null, payload });

    expect(calls[0]?.request).not.toHaveProperty("actor");
  });

  it("lets a failed trigger reach the caller, which logs it", async () => {
    const store = knockStore(async () => {
      throw new Error("workflow not found");
    });

    await expect(
      store.add({ recipients: [ada], actor: liam, payload })
    ).rejects.toThrow("workflow not found");
  });
});
