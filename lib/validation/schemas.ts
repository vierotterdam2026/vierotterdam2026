import { z } from "zod";
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from "@/lib/players/attributes";
import { POSITION_CODES } from "@/lib/teams/positions";
import { SESSION_STATUSES } from "@/lib/sessions/state";

export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "Your PIN must be exactly 4 digits.");

export const playerNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(40, "That name is too long — 40 characters at most.");

export const positionPreferenceSchema = z.object({
  position: z.enum(POSITION_CODES),
  preferenceRank: z.number().int().min(1).max(3),
  rating: z.number().int().min(1, "Rate yourself from 1 to 10.").max(10, "Rate yourself from 1 to 10."),
});

/** Up to three positions, each ranked once, each position chosen once. */
export const positionPreferencesSchema = z
  .array(positionPreferenceSchema)
  .max(3, "Choose at most three positions.")
  .superRefine((positions, ctx) => {
    const ranks = new Set<number>();
    const codes = new Set<string>();
    for (const p of positions) {
      if (ranks.has(p.preferenceRank)) {
        ctx.addIssue({ code: "custom", message: "Each choice can only be used once." });
      }
      if (codes.has(p.position)) {
        ctx.addIssue({ code: "custom", message: "Choose a different position for each choice." });
      }
      ranks.add(p.preferenceRank);
      codes.add(p.position);
    }
  });

export const joinSchema = z.object({
  name: playerNameSchema,
  pin: pinSchema,
  positions: positionPreferencesSchema,
});

export const loginSchema = z.object({
  playerId: z.uuid("Select your name."),
  pin: pinSchema,
});

export const profileSchema = z.object({
  name: playerNameSchema,
  positions: positionPreferencesSchema,
});

export const changePinSchema = z
  .object({
    currentPin: pinSchema,
    newPin: pinSchema,
    confirmPin: pinSchema,
  })
  .refine((v) => v.newPin === v.confirmPin, {
    message: "The two new PINs do not match.",
    path: ["confirmPin"],
  });

export const signupStatusSchema = z.enum(["confirmed", "maybe", "declined"]);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:00.");

export const sessionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    startTime: timeSchema,
    endTime: timeSchema,
    venueId: z.uuid("Choose a venue.").nullable(),
    locationNotes: z.string().trim().max(200).optional().or(z.literal("")),
    note: z.string().trim().max(500).optional().or(z.literal("")),
    /** Local wall-clock deadline, interpreted in the group timezone. */
    signupDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Pick a deadline."),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "The end time must be after the start time.",
    path: ["endTime"],
  })
  .refine((v) => withinDays(v.date, v.signupDeadline, 14), {
    message: "The signup deadline should be within a fortnight of the game.",
    path: ["signupDeadline"],
  });

/** Guards against a mistyped year or month rather than enforcing a policy. */
function withinDays(date: string, deadline: string, days: number): boolean {
  const game = new Date(`${date}T00:00:00Z`).getTime();
  const close = new Date(`${deadline}:00Z`).getTime();
  if (Number.isNaN(game) || Number.isNaN(close)) return false;
  return Math.abs(close - game) <= days * 24 * 60 * 60 * 1000;
}

export const venueSchema = z.object({
  name: z.string().trim().min(1, "Give the venue a name.").max(80),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  mapsUrl: z.url("That does not look like a link.").optional().or(z.literal("")),
  notes: z.string().trim().max(200).optional().or(z.literal("")),
});

export const generateTeamsSchema = z.object({
  teamCount: z
    .number()
    .int()
    .min(2, "Choose at least two teams.")
    .max(6, "Six teams is the most this supports."),
  balanceAbility: z.boolean().default(true),
  balancePositions: z.boolean().default(true),
  respectPreferences: z.boolean().default(true),
  balanceGoalkeepers: z.boolean().default(true),
});

export const sessionStatusSchema = z.enum(SESSION_STATUSES);

export const memberRoleSchema = z.enum(["player", "scorekeeper", "admin"]);

// ---- Feed ----

export const predictionPickSchema = z.enum(["home", "draw", "away"]);

const teamNameSchema = z.string().trim().min(1, "Enter a team name.").max(60, "Keep it under 60 characters.");
const goalsSchema = z.coerce.number().int("Use a whole number.").min(0, "Goals cannot be negative.").max(99);

export const fixtureSchema = z
  .object({
    homeTeam: teamNameSchema,
    awayTeam: teamNameSchema,
    competition: z.string().trim().max(60).optional(),
    kickoffLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a kickoff date and time."),
  })
  .refine((v) => v.homeTeam.toLowerCase() !== v.awayTeam.toLowerCase(), {
    message: "Home and away must be different teams.",
    path: ["awayTeam"],
  });

export const fixtureResultSchema = z.object({ homeGoals: goalsSchema, awayGoals: goalsSchema });

export const fixtureStatusSchema = z.enum(["scheduled", "postponed", "cancelled"]);

export const statAdjustmentSchema = z.object({
  stat: z.enum(["goal", "assist"]),
  target: z.coerce.number().int("Use a whole number.").min(0, "A total cannot be negative.").max(9999),
  reason: z.string().trim().min(3, "Say why you are changing it (at least 3 characters).").max(200),
});

const attributeValue = z
  .number()
  .int()
  .min(ATTRIBUTE_MIN, `Rate from ${ATTRIBUTE_MIN} to ${ATTRIBUTE_MAX}.`)
  .max(ATTRIBUTE_MAX, `Rate from ${ATTRIBUTE_MIN} to ${ATTRIBUTE_MAX}.`);

export const attributesSchema = z.object({
  pace: attributeValue,
  shooting: attributeValue,
  passing: attributeValue,
  dribbling: attributeValue,
  defending: attributeValue,
  physical: attributeValue,
});
