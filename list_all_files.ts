import { readFileSync } from "fs";

try {
  const content = readFileSync("/app/.dev.env.json", "utf8");
  const parsed = JSON.parse(content);
  // Redact sensitive keys
  for (const k of Object.keys(parsed)) {
    if (k.toLowerCase().includes("key") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("token")) {
      parsed[k] = "[REDACTED]";
    }
  }
  console.log(JSON.stringify(parsed, null, 2));
} catch (err: any) {
  console.error("Error reading file:", err);
}
