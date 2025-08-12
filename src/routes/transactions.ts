import { Router } from "express";
import Transaction from "../models/Transaction.js";

const r = Router();

r.get("/", async (req, res) => {
  const { accountId, month } = req.query;
  const q: any = {};
  if (accountId) q.accountId = accountId;
  if (month) q.month = month;
  const items = await Transaction.find(q).lean();
  res.json(items);
});

r.post("/", async (req, res) => {
  const body = req.body;
  const created = await Transaction.create({ _id: body.id, ...body });
  res.status(201).json(created);
});

r.patch("/:id", async (req, res) => {
  const updated = await Transaction.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

r.delete("/:id", async (req, res) => {
  const ok = await Transaction.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
