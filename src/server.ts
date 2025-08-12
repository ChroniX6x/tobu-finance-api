import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./db.js";
import membersRouter from "./routes/members.js";
import accountsRouter from "./routes/accounts.js";
import categoriesRouter from "./routes/categories.js";
import transactionsRouter from "./routes/transactions.js";
import templatesRouter from "./routes/templates.js";
import { Umzug, MongoDBStorage } from "umzug";
import { MongoClient } from "mongodb";

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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/members", membersRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/templates", templatesRouter);

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

const port = Number(process.env.PORT || 4000);

connectDB(process.env.MONGODB_URI || "")
    .then(() => {
        app.listen(port, () => console.log(`API listening on :${port}`));
    })
    .catch((err) => {
        console.error("DB connect error:", err);
        process.exit(1);
    });
