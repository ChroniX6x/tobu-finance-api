import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./db.js";

import members from "./routes/members.js";
import accounts from "./routes/accounts.js";
import categories from "./routes/categories.js";
import transactions from "./routes/transactions.js";
import recurrences from "./routes/recurrences.js";
import memberIncomes from "./routes/member-incomes.js";
import rules from "./routes/contribution-rules.js";
import carryovers from "./routes/carryovers.js";
import balances from "./routes/account-balances.js";
import budgets from "./routes/category-budgets.js";
import errorHandler from "./middleware/error.js";
import { MongoClient } from "mongodb";
import { MongoDBStorage, Umzug } from "umzug";
import docsRouter from "./docs/swagger.js";
import accountsSummaryRouter from "./routes/accounts-summary.js";
import accountOverviewRouter from "./routes/account-overview.js";

const umzugLogger = {
    debug: (...a: any) => console.debug("[umzug]", ...a),
    info: (...a: any) => console.info("[umzug]", ...a),
    warn: (...a: any) => console.warn("[umzug]", ...a),
    error: (...a: any) => console.error("[umzug]", ...a),
};


const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req,res)=>res.json({ok:true}));

app.use("/api/members", members);
// Wichtig: Spezifische account-Routen VOR dem generischen accounts-Router!
app.use("/api/accounts", accountsSummaryRouter);
app.use("/api/accounts", accountOverviewRouter);
app.use("/api/accounts", accounts);
app.use("/api/categories", categories);
app.use("/api/transactions", transactions);
app.use("/api/recurrences", recurrences);
app.use("/api/member-incomes", memberIncomes);
app.use("/api/contribution-rules", rules);
app.use("/api/carryovers", carryovers);
app.use("/api/account-balances", balances);
app.use("/api/category-budgets", budgets);

app.use(docsRouter); // stellt /docs und /openapi.json bereit

app.get("/health/migrations", async (_req, res) => {
    const client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    const db = client.db();

    const umzug = new Umzug({
        migrations: { glob: "src/migrations/*.ts" },
        context: { db, client },
        storage: new MongoDBStorage({ connection: db, collectionName: "_migrations" }),
        logger: umzugLogger, // <— diese Zeile ergänzen
    });

    const pending = await umzug.pending();
    await client.close();
    res.json({ pending: pending.map(m => m.name) });
});

app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
connectDB(process.env.MONGODB_URI || "").then(() =>
  app.listen(port, () => console.log(`API on :${port}`))
);