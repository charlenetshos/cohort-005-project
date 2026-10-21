# Cadence

Cadence sells video courses to learners. This glossary covers the language around getting money back after a purchase.

## Language

### People

**Admin**:
A member of the Cadence team who runs the platform and decides Refund Requests. Not the same as a team Admin, who only buys and shares a team's Seats.
_Avoid_: Staff, Reviewer, Moderator

### Courses

**Course Access**:
A learner's right to watch a course's lessons. It is granted by buying the course or claiming a Seat, and taken away when a Refund Request is approved.
_Avoid_: Enrollment (for the right itself), Entitlement, Licence

**Progress**:
What a learner has done in a course: lessons completed, time watched, and quiz attempts. It belongs to the learner and survives losing Course Access.
_Avoid_: Completion (for the whole record)

### Teams

**Team Licence**:
A purchase of several Seats in one course, made by a team Admin for their team. Buying one doesn't give the buyer Course Access themselves.
_Avoid_: Team purchase, Bulk purchase

**Seat**:
One person's Course Access that comes from a Team Licence. A Seat is either unclaimed or claimed by one learner.

**Seat Code**:
The link a team Admin shares so that someone can claim a Seat. It stops working once its Seat is claimed, while the Team Licence has an Open Refund Request, and for good once that request is approved.
_Avoid_: Coupon

### Refunds

**Refund Request**:
A learner's ask, with their reason, to get back what they paid for a purchase. The team approves or declines it. One purchase can have several Refund Requests over time, but only one can be undecided at once.
_Avoid_: Refund (for the ask itself), Cancellation, Reversal, Chargeback

**Open Refund Request**:
A Refund Request the team hasn't decided yet.
_Avoid_: Pending, Requested, Awaiting review

**Approved Refund Request**:
A Refund Request an Admin has accepted. Approving it ends the learner's Course Access, or for a Team Licence cancels all its Seat Codes, and leads to a Refund.

**Declined Refund Request**:
A Refund Request an Admin has turned down, with a note to the learner explaining why. It has no Refund, and the learner may raise a new Refund Request.

**Refund**:
The money returned to a learner after their Refund Request is approved. It is always the full amount they paid. A declined Refund Request has no Refund.
_Avoid_: Reversal, Chargeback, Cancellation

**Pending Refund**:
A Refund the team has approved where the money hasn't been confirmed as sent yet.
_Avoid_: Pending (for a Refund Request awaiting review)

**Issued Refund**:
A Refund where the money has been confirmed as sent back to the learner.
_Avoid_: Completed, Paid out

**Failed Refund**:
A Refund where the money couldn't be sent. The Refund Request stays approved, because the decision hasn't changed.

### Other terms

**Watch Limit**:
A Refund is only offered on a course with under two hours watched. Past that, the Learner has had the course, and the refund form turns them away.
_Avoid_: Watch cap, Viewing threshold

**Refunds table**:
`refunds` — one row per Refund. Columns: `id`, `purchase_id`, `status` (`open`, `approved`, `declined`), `reason`, `amount_refunded`, `requested_at`, `resolved_at`, `resolved_by_user_id`, `decision_note`.

**refunded_at**:
Nullable text column on `coupons`. An ISO timestamp, set on every unclaimed coupon when its team purchase is refunded. `getSeatAvailability` returns `"refunded"` for it.

**resolved_by_user_id**:
Integer column on `refunds`, referencing `users.id`. Null until an Admin approves or declines the Refund.

**RefundRequestCard**:
The component that draws one Refund Request on `/admin/refunds`, with its Approve and Decline buttons.

**Button**:
A clickable element that fires an action when the user presses it. Built on `~/components/ui/button`.

**Component**:
A React function that returns JSX.

**cwd**:
The directory the dev server was started from. Paths in `scripts/` resolve from here.

**Loader**:
The React Router function that fetches a route's data on the server before the page renders.

**Slug**:
The URL-safe name of a course, as in `/courses/:slug`.

**Lapsed**:
An Enrollment that is no longer active. Shown as a badge on the instructor's student roster.

**Instructor**:
Speaks for their own courses only. An Instructor builds and edits the courses they own, and sees the learners enrolled on them.
_Avoid_: Teacher, Author, Creator

**Watched**:
Seconds of video a Learner has actually played in a course: the furthest point reached in each lesson, added up. Not lessons opened.
_Avoid_: Viewed, Progress
