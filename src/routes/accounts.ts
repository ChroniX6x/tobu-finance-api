import { Router } from "express";
import { Types } from "mongoose";
import Account from "../models/Account.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryAccounts, CreateAccount, UpdateAccount } from "../validation/accounts.js";

const r = Router();

/** GET /api/accounts?memberId=... */
r.get("/", validateQuery(QueryAccounts), async (req, res) => {
  const { memberId } = (req as any).q;
  const q: any = {};
  if (memberId) q["members.memberId"] = new Types.ObjectId(memberId);
  const items = await Account.find(q).lean();
  res.json(items);
});

/** POST /api/accounts { name, currency?, members?: [{memberId, role?}] } */
r.post("/", validateBody(CreateAccount), async (req, res) => {
  const b = (req as any).data;
  const members = Array.isArray(b.members)
    ? b.members.map((m: any) => ({
        memberId: new Types.ObjectId(m.memberId),
        role: m.role ?? "member",
      }))
    : [];
  const created = await Account.create({
    name: b.name ?? null,
    currency: b.currency ?? "EUR",
    members,
    settings: b.settings ?? { monthGranularity: "YYYY-MM" },
  });
  res.status(201).json(created);
});

/** PATCH /api/accounts/:id */
r.patch("/:id", validateBody(UpdateAccount), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if (Array.isArray(u.members)) {
    u.members = u.members.map((m: any) => ({
      memberId: new Types.ObjectId(m.memberId),
      role: m.role ?? "member",
    }));
  }
  const updated = await Account.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** POST /api/accounts/:id/members  { memberId, role? } -> add/update role */
r.post("/:id/members", async (req, res) => {
  const { id } = req.params;
  const { memberId, role } = req.body || {};
  const mId = new Types.ObjectId(memberId);
  const acc = await Account.findById(id);
  if (!acc) return res.sendStatus(404);
  const idx = acc.members.findIndex((x: any) => String(x.memberId) === String(mId));
  if (idx >= 0) acc.members[idx].role = role ?? acc.members[idx].role ?? "member";
  else acc.members.push({ memberId: mId, role: role ?? "member" });
  await acc.save();
  res.json(acc);
});

/** DELETE /api/accounts/:id/members/:memberId */
r.delete("/:id/members/:memberId", async (req, res) => {
  const { id, memberId } = req.params;
  const mId = new Types.ObjectId(memberId);
  const acc = await Account.findByIdAndUpdate(
    id,
    { $pull: { members: { memberId: mId } } },
    { new: true }
  );
  if (!acc) return res.sendStatus(404);
  res.json(acc);
});

export default r;
