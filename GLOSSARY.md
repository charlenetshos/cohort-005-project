# Cadence

An online course platform where learners buy courses and instructors publish them.

## Language

### Getting money back

**Refund Request**:
A learner's ask, in their own words, to have their money back on a purchase, plus an admin's decision on it. It is Requested until an admin approves or declines it. A purchase may have at most two Refund Requests and at most one Approved one. Each must pass Refund Eligibility on its own.
_Avoid_: Cancellation, Reversal, Chargeback

**Approved Refund Request**:
A Refund Request an admin said yes to. The learner loses access to the course from that moment, and we owe them a Refund.
_Avoid_: Refund (the decision is not the money)

**Declined Refund Request**:
A Refund Request an admin turned down. No money moves and the learner keeps access.
_Avoid_: Rejected refund, Denied refund

**Refund**:
One attempt to send the full amount the learner paid back to them through the payment provider, made because a Refund Request was approved. It is Pending until it Succeeds or Fails. A failed Refund is followed by a new Refund, not retried.
_Avoid_: Reversal, Chargeback, Payout

**Refund Window**:
The period after a purchase during which a learner may raise a Refund Request.
_Avoid_: Cancel window, Cancellation window

**Refund Eligibility**:
Whether a purchase can still have a Refund Request raised on it. The purchase must be inside the Refund Window, the learner must not have watched or completed too much of the course, and it must not be a team seat someone has claimed.
_Avoid_: Cancellation offer

**Chargeback**:
A dispute the learner raises with their bank or card issuer, which pulls the money back without our approval. It is not part of the Refund flow.
_Avoid_: Using it for any Refund Request or Refund
