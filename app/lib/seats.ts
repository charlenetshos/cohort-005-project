// Wording about Seats that both the server and the browser show.
// Shared with the browser, so this module must stay free of server code.

/** Why a Seat Code can't be claimed while its Team Licence has an Open Refund Request. */
export const SEAT_ON_HOLD_MESSAGE =
  "This seat is on hold while the team's refund request is reviewed. Check back later.";

/** What a team Admin sees while one of their Team Licences has an Open Refund Request. */
export const TEAM_REFUND_OPEN_MESSAGE =
  "Your refund request is open, so your Seat Codes can't be claimed until we've reviewed it.";
