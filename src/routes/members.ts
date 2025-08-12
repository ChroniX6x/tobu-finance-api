import { Router } from "express";
import Member from "../models/Member.js";

const r = Router();

r.get("/", async (_req, res) => {
  const items = await Member.find().lean();
  res.json(items);
});

r.post("/", async (req, res) => {
  const body = req.body;
  // erwartet: {id,name,email?,userID?}
  const created = await Member.create({ _id: body.id, ...body });
  res.status(201).json(created);
});

r.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updated = await Member.findByIdAndUpdate(id, req.body, { new: true });
  if (!updated) return res.sendStatus(404);
  res.json(updated);
});

r.delete("/:id", async (req, res) => {
  const ok = await Member.findByIdAndDelete(req.params.id);
  if (!ok) return res.sendStatus(404);
  res.sendStatus(204);
});

export default r;
