import "dotenv/config";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db();

const newCodes = [
  "transaction.created",
  "transaction.booked",
  "transaction.statusChanged",
  "transaction.splitChildCreated",
  "transaction.splitChildDeleted",
  "contributionRule.added",
  "contributionRule.updated",
  "contributionRule.removed",
  "memberIncome.added",
  "memberIncome.updated",
  "memberIncome.removed",
  "categoryBudget.added",
  "categoryBudget.updated",
  "categoryBudget.removed",
  "account.member.added",
  "account.member.removed",
];

await db.command({
  collMod: "events",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["accountId", "date", "code", "params"],
      properties: {
        accountId: { bsonType: "objectId" },
        date: { bsonType: "date" },
        code: { enum: newCodes },
        params: { bsonType: "object" },
        createdByMemberId: { bsonType: ["objectId", "null"] },
      },
      additionalProperties: true,
    },
  },
  validationLevel: "strict",
  validationAction: "error",
});

console.log("Events validator updated. New codes:", newCodes.join(", "));
await client.close();
