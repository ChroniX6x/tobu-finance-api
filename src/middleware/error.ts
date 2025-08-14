import type { ErrorRequestHandler } from "express";
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.name === "ValidationError") return res.status(400).json({ error:"MODEL_VALIDATION", details: err.message });
  if (err?.code === 11000) return res.status(409).json({ error:"DUPLICATE_KEY", details: err.keyValue });
  console.error("[ERROR]", err);
  res.status(500).json({ error: "INTERNAL" });
};
export default errorHandler;
