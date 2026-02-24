import { z } from "zod";
import { ObjId, MoneyMinor, Month } from "./common.js";

// ─── shared field definitions ───────────────────────────────────────────────

const TxTitle = z.string().min(2).max(80);
const TxNotes = z.string().max(1000).nullish();
const TxType = z.enum(["income", "expense"]);
const TxStatus = z.enum(["booked", "pending"]);

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Derive the month anchor (YYYY-MM-01T00:00:00.000Z) from an ISO bookDate string. */
export function monthFromBookDate(bookDate: string): Date {
  const d = new Date(bookDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Derive the month anchor from a YYYY-MM string. */
export function monthFromYYYYMM(ym: string): Date {
  const [yr, mo] = ym.split("-");
  const y = parseInt(yr!, 10);
  const m = parseInt(mo!, 10);
  return new Date(Date.UTC(y, m - 1, 1));
}

// ─── cross-field refinement (applied to both Create and Patch "next" state) ──

function refineTx<T extends {
  status?: "booked" | "pending";
  bookDate?: string | null | undefined;
  month?: string | null | undefined;
  isFromSharedAccount?: boolean | null | undefined;
  paidByMemberId?: string | null | undefined;
  parentTransactionId?: string | null | undefined;
}>(schema: z.ZodType<T>) {
  return (schema as z.ZodObject<any>)
    .refine(
      (d) => !(d.status === "booked" && !d.bookDate),
      { message: "bookDate is required when status is booked", path: ["bookDate"] }
    )
    .refine(
      (d) => !(d.isFromSharedAccount === false && !d.paidByMemberId),
      { message: "paidByMemberId is required when isFromSharedAccount is false", path: ["paidByMemberId"] }
    );
}

// ─── Create ──────────────────────────────────────────────────────────────────

const CreateTxBase = z.object({
  accountId: ObjId,
  categoryId: ObjId.nullish(),
  title: TxTitle,
  notes: TxNotes,
  type: TxType,
  amountMinor: MoneyMinor,
  /** Required when bookDate is absent (i.e. status=pending without bookDate). */
  month: Month.optional(),
  bookDate: z.string().datetime().nullish(),
  status: TxStatus.default("pending"),
  isFromSharedAccount: z.boolean(),
  paidByMemberId: ObjId.nullish(),
  parentTransactionId: ObjId.nullish(),
  recurrenceId: ObjId.nullish(),
}).refine(
  (d) => !(d.status === "booked" && !d.bookDate),
  { message: "bookDate is required when status is booked", path: ["bookDate"] }
).refine(
  (d) => !(d.isFromSharedAccount === false && !d.paidByMemberId),
  { message: "paidByMemberId is required when isFromSharedAccount is false", path: ["paidByMemberId"] }
).refine(
  (d) => !!(d.bookDate || d.month),
  { message: "Either bookDate or month must be provided", path: ["month"] }
);

export const CreateTx = CreateTxBase;

// ─── Patch ────────────────────────────────────────────────────────────────────
// All fields optional; cross-field rules are applied against the MERGED (next) state in the route handler.

export const PatchTx = z.object({
  categoryId: ObjId.nullish(),
  title: TxTitle.optional(),
  notes: TxNotes,
  type: TxType.optional(),
  amountMinor: MoneyMinor.optional(),
  month: Month.optional(),
  bookDate: z.string().datetime().nullish(),
  status: TxStatus.optional(),
  isFromSharedAccount: z.boolean().optional(),
  paidByMemberId: ObjId.nullish(),
  recurrenceId: ObjId.nullish(),
});

// ─── Query ────────────────────────────────────────────────────────────────────

export const QueryTx = z.object({
  accountId: ObjId,
  month: Month.optional(),
  monthFrom: Month.optional(),
  monthTo: Month.optional(),
  status: TxStatus.optional(),
  /** Full-text search on title + notes (Phase 1: parents only). */
  q: z.string().min(1).max(200).optional(),
  /**
   * Filter by parentTransactionId.
   * Pass "null" to list only top-level parents (default behaviour of the list endpoint).
   * Pass an ObjectId to list children of a specific parent (used by autocomplete internally).
   * Omitting this param is equivalent to passing "null".
   */
  parentTransactionId: z.union([ObjId, z.literal("null")]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["bookDateDesc", "bookDateAsc", "amountDesc", "amountAsc"]).default("bookDateDesc"),
});
