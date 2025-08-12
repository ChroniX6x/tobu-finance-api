import "dotenv/config";
import { Umzug, MongoDBStorage } from "umzug";
import { MongoClient, Db } from "mongodb";

// Typ für den Migrations-Kontext (bei Bedarf erweitern)
export type MigrationCtx = { db: Db; client: MongoClient };

async function getUmzug() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(); // nimmt DB aus URI

  const umzug = new Umzug<MigrationCtx>({
    migrations: {
      glob: "src/migrations/*.ts", // TS-Dateien, ESM
    },
    context: { db, client },
    storage: new MongoDBStorage({
      // Umzug erwartet eine DB-Connection (native driver) oder eine Collection
      connection: db,
      collectionName: "_migrations",
    }),
    logger: console,
  });

  // optional: Lockfile gegen parallele Läufe (z. B. in CI)
  // import { FileLocker } from 'umzug';
  // FileLocker.attach(umzug, { path: ".umzug.lock" }); // siehe Doku
  // (Dafür ggf. obigen Import einkommentieren.)
  return { umzug, client };
}

async function main() {
  const cmd = process.argv[2] as "up" | "down" | "pending" | "list" | undefined;
  const { umzug, client } = await getUmzug();

  try {
    switch (cmd) {
      case "up":
        await umzug.up();
        break;
      case "down":
        await umzug.down();
        break;
      case "pending":
        console.table((await umzug.pending()).map(m => ({ name: m.name })));
        break;
      case "list":
        console.table((await umzug.executed()).map(name => ({ name })));
        break;
      default:
        console.log("Usage: ts-node src/migrate.ts <up|down|pending|list>");
    }
  } finally {
    await client.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
