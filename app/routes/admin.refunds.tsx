import { useEffect, useState } from "react";
import { data, isRouteErrorResponse, Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.refunds";
import { db } from "~/db";
import { UserRole, users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  approveRefundRequest,
  buildRefundApprovedEmail,
  buildRefundDeclinedEmail,
  declineRefundRequest,
  listOpenRefundRequests,
  type OpenRefundRequestRow,
} from "~/lib/refunds.server";
import {
  REFUND_COMPLETION_LIMIT,
  REFUND_WATCH_LIMIT_SECONDS,
  REFUND_WINDOW_DAYS,
  sayDuration,
  type RefundWarning,
} from "~/lib/refund-policy";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { AlertTriangle, ReceiptText } from "lucide-react";

const refundDecisionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int(),
    note: z
      .string()
      .trim()
      .min(10, "Tell the learner why — at least a sentence.")
      .max(1000, "Please keep the note under 1000 characters."),
  }),
]);

async function requireAdmin(request: Request) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can review refund requests.", { status: 403 });
  }

  return currentUser;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Approve or decline open refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { requests: listOpenRefundRequests() };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundDecisionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { intent, refundId } = parsed.data;
  const result =
    intent === "approve"
      ? approveRefundRequest(refundId, admin.id)
      : declineRefundRequest(refundId, admin.id, parsed.data.note);

  if (!result.ok) {
    return data(
      {
        error:
          result.error === "already-decided"
            ? "This refund request has already been decided."
            : "Refund request not found.",
      },
      { status: result.error === "already-decided" ? 409 : 404 }
    );
  }

  const emailInput = {
    learnerName: result.learner.name,
    learnerEmail: result.learner.email,
    courseTitle: result.courseTitle,
    amount: result.amount,
  };
  const email =
    intent === "approve"
      ? buildRefundApprovedEmail(emailInput)
      : buildRefundDeclinedEmail({ ...emailInput, note: parsed.data.note });

  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return { success: true, intent };
}

const WARNING_TEXT: Record<RefundWarning, string> = {
  "outside-window": `Asked after the ${REFUND_WINDOW_DAYS}-day window`,
  "watched-too-much": `Watched over ${sayDuration(REFUND_WATCH_LIMIT_SECONDS)}`,
  "completed-too-much": `Completed ${REFUND_COMPLETION_LIMIT * 100}% or more of the lessons`,
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function describeSeats({ seatCount, claimedSeatCount }: OpenRefundRequestRow) {
  const unclaimed = seatCount - claimedSeatCount;
  if (claimedSeatCount === 0) {
    return `${plural(seatCount, "seat")}, none claimed. Approving cancels all ${plural(seatCount, "Seat Code")}.`;
  }
  return `${plural(seatCount, "seat")}, ${claimedSeatCount} claimed. Approving cancels the ${plural(unclaimed, "unclaimed Seat Code")}; claimed Seats keep their access.`;
}

function describeSeatApproval({ seatCount, claimedSeatCount }: OpenRefundRequestRow) {
  const unclaimed = seatCount - claimedSeatCount;
  if (claimedSeatCount === 0) {
    return `Approving cancels all ${plural(seatCount, "Seat Code")} on this Team Licence, so none of them can be claimed.`;
  }
  return `Approving cancels the ${plural(unclaimed, "unclaimed Seat Code")} on this Team Licence. ${plural(claimedSeatCount, "claimed Seat")} keep${claimedSeatCount === 1 ? "s" : ""} access.`;
}

function RefundRequestCard({ request }: { request: OpenRefundRequestRow }) {
  const fetcher = useFetcher<typeof action>();
  const [mode, setMode] = useState<"idle" | "confirm-approve" | "decline">(
    "idle"
  );
  const isSubmitting = fetcher.state !== "idle";
  const { progress } = request;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("error" in fetcher.data) {
      toast.error(fetcher.data.error);
    } else if (fetcher.data.success) {
      toast.success(
        fetcher.data.intent === "approve"
          ? request.isTeamPurchase
            ? `Approved — ${request.learner.name}'s Seat Codes are cancelled.`
            : `Approved — ${request.learner.name} no longer has access.`
          : `Declined — ${request.learner.name} has been told why.`
      );
    }
  }, [fetcher.state, fetcher.data, request.learner.name, request.isTeamPurchase]);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {request.learner.name}{" "}
              <span className="font-normal text-muted-foreground">
                · {request.learner.email}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              <Link
                to={`/courses/${request.course.slug}`}
                className="hover:underline"
              >
                {request.course.title}
              </Link>{" "}
              · {formatPrice(request.purchase.amountPaid)}
              {request.isTeamPurchase && " · team licence"} · raised{" "}
              {new Date(request.requestedAt).toLocaleDateString("en-US", DATE_FORMAT)}
            </p>
          </div>
        </div>

        {request.isTeamPurchase ? (
          <p className="rounded-md bg-muted/50 p-3 text-sm">
            {describeSeats(request)}
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-muted/50 p-3">
              <dt className="text-muted-foreground">Lessons completed</dt>
              <dd className="text-lg font-semibold">
                {progress.lessonsCompleted} / {progress.lessonCount}
              </dd>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <dt className="text-muted-foreground">Time watched</dt>
              <dd className="text-lg font-semibold">
                {sayDuration(progress.secondsWatched)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  of {sayDuration(REFUND_WATCH_LIMIT_SECONDS)} limit
                </span>
              </dd>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <dt className="text-muted-foreground">Since purchase</dt>
              <dd className="text-lg font-semibold">
                Day {progress.daysSincePurchase}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  · asked on day {progress.daysSincePurchaseWhenRequested} of{" "}
                  {REFUND_WINDOW_DAYS}
                </span>
              </dd>
            </div>
          </dl>
        )}

        {request.warnings.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            {request.warnings.map((warning) => (
              <li key={warning} className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                {WARNING_TEXT[warning]}
              </li>
            ))}
          </ul>
        )}

        <blockquote className="border-l-2 pl-3 text-sm">
          {request.reason}
        </blockquote>

        {mode === "decline" ? (
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="decline" />
            <input type="hidden" name="refundId" value={request.id} />
            <Label htmlFor={`note-${request.id}`}>
              Note to the learner (required)
            </Label>
            <Textarea
              id={`note-${request.id}`}
              name="note"
              required
              minLength={10}
              maxLength={1000}
              placeholder="Explain why the refund can't be approved."
            />
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? "Declining..." : "Decline request"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode("idle")}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        ) : mode === "confirm-approve" ? (
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="refundId" value={request.id} />
            <p className="text-sm">
              {request.isTeamPurchase
                ? describeSeatApproval(request)
                : `Approving ends ${request.learner.name}'s access to this course right away. Their progress is kept.`}{" "}
              They'll get back {formatPrice(request.purchase.amountPaid)}.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Approving..." : "Confirm approval"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode("idle")}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => setMode("confirm-approve")}>Approve</Button>
            <Button variant="outline" onClick={() => setMode("decline")}>
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { requests } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Open requests, oldest first. Approving ends the learner&apos;s access
          to the course at once.
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No open refund requests. Nothing to review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <RefundRequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can review refund requests.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
