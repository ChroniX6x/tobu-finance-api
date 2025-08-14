import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";
import YAML from "yaml";

const r = Router();

// Pfad zu deiner OpenAPI-Datei (hier: docs/openapi.yaml im Projektroot)
const OPENAPI_PATH = path.resolve(process.cwd(), "docs", "openapi.yaml");

// Spec einmalig beim Start einlesen/parsen
let openapi: any;
try {
  const file = fs.readFileSync(OPENAPI_PATH, "utf-8");
  openapi = YAML.parse(file);
} catch (e) {
  console.error("[swagger] Konnte OpenAPI nicht laden:", OPENAPI_PATH, e);
  openapi = { openapi: "3.0.3", info: { title: "ToBu-Finance API", version: "unknown" }, paths: {} };
}

// Rohes JSON bereitstellen (praktisch für Clients/Tools)
r.get("/openapi.json", (_req, res) => res.json(openapi));

// Swagger-UI mounten
r.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    explorer: true,
    customCss: `.topbar { display:none }`,
    customSiteTitle: "ToBu-Finance API Docs",
  })
);

export default r;
