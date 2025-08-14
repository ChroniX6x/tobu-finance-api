import { Router } from "express";
import { Types } from "mongoose";
import Member from "../models/Member.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { QueryMembers, CreateMember, UpdateMember } from "../validation/members.js";

const r = Router();

/** GET /api/members?userId=... */
r.get("/", validateQuery(QueryMembers), async (req, res) => {
  const { userId } = (req as any).q;
  const q: any = {};
  if (userId) q.userId = new Types.ObjectId(userId);
  const items = await Member.find(q).lean();
  res.json(items);
});

/** POST /api/members  { name?, email?, userId? } */
r.post("/", validateBody(CreateMember), async (req, res) => {
  const b = (req as any).data;
  const created = await Member.create({
    name: b.name ?? null,
    email: b.email ?? null,
    userId: b.userId ? new Types.ObjectId(b.userId) : null,
  });
  res.status(201).json(created);
});

/** PATCH /api/members/:id */
r.patch("/:id", validateBody(UpdateMember), async (req, res) => {
  const { id } = req.params;
  const u: any = { ...(req as any).data };
  if ("userId" in u) u.userId = u.userId ? new Types.ObjectId(u.userId) : null;
  const updated = await Member.findByIdAndUpdate(id, u, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

/** DELETE /api/members/:id */
r.delete("/:id", async (req, res) => {
  const ok = await Member.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
