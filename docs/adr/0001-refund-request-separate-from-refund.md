# Refund Request is separate from Refund

An admin's decision to give a learner their money back (a **Refund Request**: Requested → Approved | Declined) is modelled separately from the money actually going back (a **Refund**: Pending → Succeeded | Failed). In the real world these come apart. Payouts through a payment provider take time and can fail. If "approved" also meant "refunded", we would have nowhere to record a payout that is still in flight or has failed. Payment isn't wired up yet, but we're designing for when it is.

## Consequences

- An Approved Refund Request leads to one or more Refunds. Each Refund is a single provider attempt. A Failed Refund is followed by a new Refund, not retried in place, so the attempt history stays honest. At most one Refund per request succeeds.
- The learner loses access to the course **when the Refund Request is approved**, not when the Refund succeeds. The decision is final, and a failed payout is ours to fix. It does not hand the course back.
- A purchase may have at most two Refund Requests, and at most one of them Approved. Each must pass Refund Eligibility independently, and the Refund Window runs from the purchase whatever happens to earlier requests.
- "Chargeback" is reserved for disputes raised through the learner's bank. It is never used for this flow.
