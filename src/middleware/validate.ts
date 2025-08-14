import { ZodError, type ZodTypeAny } from "zod";
import type { RequestHandler } from "express";

export const validateBody = (schema: ZodTypeAny): RequestHandler => async (req, res, next) => {
  try {
    (req as any).data = await schema.parseAsync(req.body);
    next();
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ error: "VALIDATION_ERROR", details: e });
    }
    next(e);
  }
};

export const validateQuery = (schema: ZodTypeAny): RequestHandler => async (req, res, next) => {
  try {
    (req as any).q = await schema.parseAsync(req.query);
    next();
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ error: "VALIDATION_ERROR", details: e });
    }
    next(e);
  }
};

export const validateParams = (schema: ZodTypeAny): RequestHandler => async (req, res, next) => {
  try {
    (req as any).paramsData = await schema.parseAsync(req.params);
    next();
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ error: "VALIDATION_ERROR", details: e });
    }
    next(e);
  }
};
