import type { PaymentStatus } from "@/types/database";

/**
 * How many payment requests are waiting on the player, for the badge on the
 * Alerts tab. A request they have already said they paid is not waiting on them
 * any more — it is waiting on an organiser — so it does not count.
 */
export function countNeedingAction(payments: { status: PaymentStatus }[]): number {
  return payments.filter((payment) => payment.status === "requested").length;
}
