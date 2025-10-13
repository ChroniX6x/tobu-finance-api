// scripts/ensure-env.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { generateKeyPairSync } from "crypto";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function parseEnv(content: string): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) obj[m[1]] = m[2];
  }
  return obj;
}

function stringifyEnv(obj: Record<string, string>, order?: string[]) {
  const keys = order ?? Object.keys(obj);
  const lines: string[] = [];
  const seen = new Set<string>();
  
  // Erst alle Keys in der vorgegebenen Order
  for (const k of keys) {
    if (k in obj) {
      lines.push(`${k}=${obj[k]}`);
      seen.add(k);
    }
  }
  
  // Dann alle neuen Keys, die nicht in der Order waren
  for (const k of Object.keys(obj)) {
    if (!seen.has(k)) {
      lines.push(`${k}=${obj[k]}`);
    }
  }
  
  lines.push(""); // newline am Ende
  return lines.join("\n");
}

// PEM -> einzeilig mit \n escapen (für .env)
function pemToOneLine(pem: string) {
  return pem.replace(/\r?\n/g, "\\n");
}

// Generiert ein RSA Keypair (PKCS#8 Privat / SPKI Public) als PEM-Strings
function generateRsaPemPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    privateOneLine: pemToOneLine(privateKey.trim() + "\n"),
    publicOneLine: pemToOneLine(publicKey.trim() + "\n"),
  };
}

function ensureDefaults(env: Record<string, string>) {
  env["NODE_ENV"] ||= "development";
  env["CORS_ORIGIN"] ||= "http://localhost:4200";
  env["ACCESS_TOKEN_TTL"] ||= "15m";
  env["REFRESH_TOKEN_TTL_DAYS"] ||= "30";
}

function ensureKeypair(env: Record<string, string>, privKeyName: string, pubKeyName: string, label: string) {
  const priv = (env[privKeyName] || "").trim();
  const pub = (env[pubKeyName] || "").trim();
  if (!priv || !pub) {
    const pair = generateRsaPemPair();
    env[privKeyName] = pair.privateOneLine;
    env[pubKeyName] = pair.publicOneLine;
    console.log(`  • Generated ${label} RSA keypair (${privKeyName}, ${pubKeyName})`);
    return true;
  }
  return false;
}

function loadEnvWithOrder(): { data: Record<string, string>; order: string[] } {
  // Immer .env.example als Basis für Struktur und Defaults laden
  const exampleContent = readFileSync(examplePath, "utf8");
  const exampleData = parseEnv(exampleContent);
  const order = exampleContent
    .split(/\r?\n/)
    .map((l) => (l.match(/^\s*([A-Z0-9_]+)\s*=/i)?.[1] ?? ""))
    .filter(Boolean);
  
  // Falls .env existiert, Werte daraus übernehmen (überschreiben example)
  let data = { ...exampleData };
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    const envData = parseEnv(envContent);
    data = { ...exampleData, ...envData };
  }
  
  return { data, order };
}

(function main() {
  if (!existsSync(examplePath)) {
    console.error("✗ Missing .env.example");
    process.exit(1);
  }

  const { data: env, order } = loadEnvWithOrder();

  console.log("Ensuring .env …");
  ensureDefaults(env);

  const accessMade = ensureKeypair(
    env,
    "JWT_ACCESS_PRIVATE_KEY_PEM",
    "JWT_ACCESS_PUBLIC_KEY_PEM",
    "ACCESS"
  );
  const refreshMade = ensureKeypair(
    env,
    "JWT_REFRESH_PRIVATE_KEY_PEM",
    "JWT_REFRESH_PUBLIC_KEY_PEM",
    "REFRESH"
  );

  writeFileSync(envPath, stringifyEnv(env, order), "utf8");

  console.log(`✓ .env ready at ${envPath}`);
  if (accessMade || refreshMade) {
    console.log("  (Keys are stored as single-line PEMs with \\n; your loader should normalize)");
  }
})();
