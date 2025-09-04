type Params = Record<string, unknown>;

function euro(cents: number | undefined): string {
  const v = typeof cents === "number" ? cents : 0;
  return `${(v / 100).toFixed(2)} €`;
}

export function renderEventText(code: string, p: Params): string {
  switch (code) {
    case "transaction.created":
      return txLabel("Angelegt", p);
    case "transaction.booked":
      return txLabel("Gebucht", p);
    case "transaction.statusChanged":
      return `Transaktion Status: ${String(p["from"])} → ${String(p["to"])}${p["title"] ? ` (${String(p["title"])})` : ""}`;
    case "contributionRule.added":
      return `Beitragsregel hinzugefügt (${String(p["ruleType"])}, ${euro(p["amountCents"] as number | undefined)})`;
    case "contributionRule.updated":
      return `Beitragsregel aktualisiert (${String(p["ruleType"])}, ${euro(p["amountCents"] as number | undefined)})`;
    case "contributionRule.removed":
      return `Beitragsregel entfernt (${String(p["ruleType"])})`;
    case "memberIncome.added":
      return `Einkommen hinzugefügt (${euro(p["amountCents"] as number | undefined)})`;
    case "memberIncome.updated":
      return `Einkommen aktualisiert (${euro(p["amountCents"] as number | undefined)})`;
    case "memberIncome.removed":
      return "Einkommen entfernt";
    case "categoryBudget.added":
      return `Kategorie-Budget gesetzt (${euro(p["amountCents"] as number | undefined)})`;
    case "categoryBudget.updated":
      return `Kategorie-Budget aktualisiert (${euro(p["amountCents"] as number | undefined)})`;
    case "categoryBudget.removed":
      return "Kategorie-Budget entfernt";
    case "account.member.added":
      return "Mitglied hinzugefügt";
    case "account.member.removed":
      return "Mitglied entfernt";
    default:
      return "Aktivität";
  }
}

function txLabel(prefix: string, p: Params): string {
  const type = String(p["type"]) === "income" ? "Einnahme" : "Ausgabe";
  const amount = euro(p["amountCents"] as number | undefined);
  const title = p["title"] ? ` (${String(p["title"])})` : "";
  return `${prefix}: ${type} ${amount}${title}`;
}
