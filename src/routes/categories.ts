import { Router } from "express";
import Category from "../models/Category.js";

const r = Router();

r.get("/", async (req, res) => {
  const { accountId } = req.query;
  const q: any = {};
  if (accountId) q.accountId = accountId;
  res.json(await Category.find(q).lean());
});

r.post("/", async (req, res) => {
  const body = req.body;
  const created = await Category.create({ _id: body.id, ...body });
  res.status(201).json(created);
});

r.patch("/:id", async (req, res) => {
  const updated = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

r.delete("/:id", async (req, res) => {
  const ok = await Category.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
