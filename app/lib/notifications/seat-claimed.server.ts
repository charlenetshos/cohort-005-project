import { and, count, eq, isNotNull } from "drizzle-orm";
import { db as appDb } from "~/db";
import { coupons, courses, purchases, users } from "~/db/schema";
import { sendNotification, type NotifyOptions } from "./send.server";

const person = { id: users.id, name: users.name, email: users.email };

/**
 * Someone claimed the Seat behind a Seat Code: tell the team Admin who bought
 * the Team Licence, with how many of its Seats are claimed right now. Call it
 * after the claim is saved; a Seat Code nobody has claimed sends nothing.
 */
export function notifySeatClaimed(
  input: { code: string },
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("seat-claimed", store, () => {
    const seatCode = db.select().from(coupons).where(eq(coupons.code, input.code)).get();
    if (!seatCode) throw new Error(`Seat Code ${input.code} not found`);
    if (seatCode.redeemedByUserId === null) {
      throw new Error(`Seat Code ${input.code} has not been claimed`);
    }

    const claimer = db
      .select(person)
      .from(users)
      .where(eq(users.id, seatCode.redeemedByUserId))
      .get();
    const buyer = db
      .select(person)
      .from(purchases)
      .innerJoin(users, eq(purchases.userId, users.id))
      .where(eq(purchases.id, seatCode.purchaseId))
      .get();
    const course = db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, seatCode.courseId))
      .get();
    if (!claimer) throw new Error(`Student ${seatCode.redeemedByUserId} not found`);
    if (!buyer) throw new Error(`Team Licence ${seatCode.purchaseId} not found`);
    if (!course) throw new Error(`Course ${seatCode.courseId} not found`);

    const onLicence = eq(coupons.purchaseId, seatCode.purchaseId);
    const [{ total }] = db.select({ total: count() }).from(coupons).where(onLicence).all();
    const [{ claimed }] = db
      .select({ claimed: count() })
      .from(coupons)
      .where(and(onLicence, isNotNull(coupons.redeemedByUserId)))
      .all();

    return {
      recipients: [buyer],
      actor: claimer,
      payload: {
        kind: "seat-claimed",
        data: {
          claimerName: claimer.name,
          courseTitle: course.title,
          claimed,
          total,
          url: "/team",
        },
      },
    };
  });
}
