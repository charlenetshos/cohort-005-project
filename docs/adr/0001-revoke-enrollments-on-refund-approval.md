# Revoke enrollments on refund approval instead of deleting them

When an Admin approves a Refund Request, the student loses Course Access at that moment. That happens at approval, not when the money is confirmed as sent, so a Failed Refund never leaves a refunded student still holding the course. We end access by marking the student's enrollment as revoked rather than deleting it, and we keep all of their Progress. The access check ignores revoked enrollments. If the student buys the course again, the same enrollment is reinstated and they pick up where they left off.

## Considered Options

- **Delete the enrollment row.** Simpler, but it throws away the original enrollment date and the course completion date, and leaves no record that access was taken away.
- **Delete Progress along with access.** Rejected: it can't be undone, it wipes out the evidence behind the decision, and it gains nothing, since a student without access can't see their Progress anyway.
- **End access when the money is confirmed as sent (Issued Refund).** Rejected: a Failed Refund would leave a refunded student with access indefinitely.
