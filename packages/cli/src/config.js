import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DIR = join(homedir(), ".agentosity");
const FILE = join(DIR, "config.json");

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch };
  if (!cfg.deviceId) cfg.deviceId = randomUUID();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

export function apiBase() {
  return (
    process.env.AGENTOSITY_API ||
    loadConfig().apiBase ||
    "https://agentosity.com"
  );
}
