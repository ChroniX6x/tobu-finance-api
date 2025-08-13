import fs from "fs";
import path from "path";

const name = (process.argv[2] || "").trim();
if (!name) {
  console.error("Usage: npm run migrate:create -- <slug>");
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ]/g, "")
  .slice(0, 12); // YYYYMMDDhhmm

const file = `${stamp}-${name.replace(/[^a-z0-9-_]/gi, "-")}.ts`;
const dir = path.resolve("src/migrations");
fs.mkdirSync(dir, { recursive: true });

const tmpl = `import type { MigrationCtx } from "../migrate";

export const up = async ({ db }: MigrationCtx) => {
  // TODO: write forward migration, e.g.:
  // await db.collection("categories").updateMany({}, { $set: { /* ... */ } });
};

export const down = async ({ db }: MigrationCtx) => {
  // TODO: write rollback (optional)
};
`;

fs.writeFileSync(path.join(dir, file), tmpl, "utf8");
console.log("Created:", `src/migrations/${file}`);
