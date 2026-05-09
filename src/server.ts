// src/server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { MongoClient } from "mongodb";
import { MongoDBStorage, Umzug } from "umzug";

import { connectDB } from "./db";
import errorHandler from "./middleware/error";

// --- Auth-Module (gekapselt) ---
import { router as authRouter } from "./auth";
import { requireAuth /*, requireRole*/ } from "./auth/middleware";
import { authEnv } from "./auth/config";

// --- Deine bestehenden Routen ---
import members from "./routes/members";
import accounts from "./routes/accounts";
import categories from "./routes/categories";
import transactions from "./routes/transactions";
import recurrences from "./routes/recurrences";
import memberIncomes from "./routes/member-incomes";
import rules from "./routes/contribution-rules";
import carryovers from "./routes/carryovers";
import balances from "./routes/account-balances";
import budgets from "./routes/category-budgets";
import docsRouter from "./docs/swagger";
import accountsSummaryRouter from "./routes/accounts-summary";
import accountOverviewRouter from "./routes/account-overview";
import monthViewRouter from "./routes/month-view";
import masterDataRouter from "./routes/master-data";

// --- Umzug-Logger ---
const umzugLogger = {
  debug: (...a: any[]) => console.debug("[umzug]", ...a),
  info:  (...a: any[]) => console.info("[umzug]", ...a),
  warn:  (...a: any[]) => console.warn("[umzug]", ...a),
  error: (...a: any[]) => console.error("[umzug]", ...a),
};

async function bootstrap() {
  const app = express();

  // Security & Parsing
  app.use(helmet({ contentSecurityPolicy: false })); // CSP bei Bedarf später feinjustieren
  app.use(express.json());
  app.use(cookieParser());
  app.use(morgan("dev"));

  // CORS – zentral über Auth-ENV (Frontend-URL)
  app.use(
    cors({
      origin: authEnv.CORS_ORIGIN,
      credentials: true, // wichtig für Refresh-Cookie bei /api/auth/refresh
    })
  );

  // Öffentliche Endpunkte (außerhalb /api) zuerst:
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(docsRouter); // /docs & /openapi.json bleiben öffentlich

  // /api/auth bleibt öffentlich (Login/Refresh/Logout)
  app.use("/api/auth", authRouter);

  // Zentrales Gate: ALLES unter /api schützen – außer /api/auth/*
  app.use("/api", (req, res, next) => {
    // CORS-Preflight ohne Auth durchlassen
    if (req.method === "OPTIONS") return next();
    // /api/auth explizit ausnehmen
    if (req.path.startsWith("/auth")) return next();
    // sonst Auth prüfen
    return requireAuth(req, res, next);
  });

  // --- Ab hier sind alle /api/* Routen geschützt ---

  app.use("/api/members", members);

  // Wichtig: Spezifische account-Routen VOR dem generischen Router!
  app.use("/api/accounts", accountsSummaryRouter);
  app.use("/api/accounts", accountOverviewRouter);
  app.use("/api/accounts", monthViewRouter);
  app.use("/api/accounts", masterDataRouter);
  app.use("/api/accounts", accounts);

  app.use("/api/categories", categories);
  app.use("/api/transactions", transactions);
  app.use("/api/recurrences", recurrences);
  app.use("/api/member-incomes", memberIncomes);
  app.use("/api/contribution-rules", rules);
  app.use("/api/carryovers", carryovers);
  app.use("/api/account-balances", balances);
  app.use("/api/category-budgets", budgets);

  // Umzug-Health: zeigt ausstehende Migrationen an (öffentlich lassen)
  app.get("/health/migrations", async (_req, res) => {
    const client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    const db = client.db();

    const umzug = new Umzug({
      migrations: { glob: "src/migrations/*.ts" },
      context: { db, client },
      storage: new MongoDBStorage({ connection: db, collectionName: "_migrations" }),
      logger: umzugLogger,
    });

    const pending = await umzug.pending();
    await client.close();
    res.json({ pending: pending.map((m) => m.name) });
  });

  // Error-Handler (immer zuletzt)
  app.use(errorHandler);

  // DB + Start
  const port = Number(process.env.PORT || 4000);
  await connectDB(process.env.MONGODB_URI || "");
  app.listen(port, () => console.log(`API on :${port}`));
}

// Starten
bootstrap().catch((err) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
