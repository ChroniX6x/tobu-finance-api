import { Router } from "express";
import Account from "../models/Account.js";

const r = Router();

r.get("/", async (_req, res) => {
  const items = await Account.find().lean();
  res.json(items);
});

r.get("/:id", async (req, res) => {
  const item = await Account.findById(req.params.id).lean();
  if (!item) return res.sendStatus(404);
  res.json(item);
});

r.post("/", async (req, res) => {
  const body = req.body; // erwartet {id,name,memberIds,...}
  const created = await Account.create({ _id: body.id, ...body });
  res.status(201).json(created);
});

r.patch("/:id", async (req, res) => {
  const updated = await Account.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

r.post("/:id/topUps", async (req, res) => {
  // fügt einen TopUp (Subdoc) hinzu; erwartet {id, amount, month, reason?, date?, customSplit?}
  const { id } = req.params;
  const acc = await Account.findById(id);
  if (!acc) return res.sendStatus(404);
  acc.topUps.push({ _id: req.body.id, ...req.body });
  await acc.save();
  res.status(201).json(acc.topUps[acc.topUps.length - 1]);
});

r.delete("/:id", async (req, res) => {
  const ok = await Account.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
