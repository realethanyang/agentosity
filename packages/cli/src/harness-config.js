import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * 各 harness 的 MCP 自动接入(幂等,不破坏用户已有配置)。
 * 返回 [{ name, status: 'ok'|'already'|'manual'|'absent', note }]
 */

const STD_ENTRY = { command: "npx", args: ["-y", "agentosity", "serve"] };

function h(...p) {
  return join(homedir(), ...p);
}

/** JSON 配置合并写入;文件损坏/无法解析时抛错交给调用方降级为 manual */
function mergeJson(path, mutate) {
  let obj = {};
  if (existsSync(path)) {
    obj = JSON.parse(readFileSync(path, "utf8"));
  }
  const changed = mutate(obj);
  if (changed) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  }
  return changed;
}

function mergeMcpServers(path) {
  return mergeJson(path, (obj) => {
    obj.mcpServers ??= {};
    if (obj.mcpServers.agentosity) return false;
    obj.mcpServers.agentosity = { ...STD_ENTRY };
    return true;
  });
}

export function installAllHarnesses() {
  const results = [];
  const add = (name, status, note = "") => results.push({ name, status, note });

  // Claude Code:官方 CLI 注册(user 级,覆盖所有项目)
  try {
    execFileSync(
      "claude",
      ["mcp", "add", "--scope", "user", "agentosity", "--", "npx", "-y", "agentosity", "serve"],
      { stdio: "pipe", timeout: 20000 }
    );
    add("Claude Code", "ok");
  } catch {
    if (existsSync(h(".claude"))) {
      add("Claude Code", "manual", "claude mcp add --scope user agentosity -- npx -y agentosity serve");
    } else {
      add("Claude Code", "absent");
    }
  }

  // Codex CLI:config.toml 追加
  if (existsSync(h(".codex"))) {
    const cfgPath = h(".codex", "config.toml");
    const existing = existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "";
    if (existing.includes("mcp_servers.agentosity")) {
      add("Codex CLI", "already");
    } else {
      writeFileSync(
        cfgPath,
        existing + '\n[mcp_servers.agentosity]\ncommand = "npx"\nargs = ["-y", "agentosity", "serve"]\n'
      );
      add("Codex CLI", "ok");
    }
  } else {
    add("Codex CLI", "absent");
  }

  // Gemini CLI:~/.gemini/settings.json 的 mcpServers
  if (existsSync(h(".gemini"))) {
    try {
      const changed = mergeMcpServers(h(".gemini", "settings.json"));
      add("Gemini CLI", changed ? "ok" : "already");
    } catch {
      add("Gemini CLI", "manual", '~/.gemini/settings.json 的 mcpServers 里加 "agentosity"');
    }
  } else {
    add("Gemini CLI", "absent");
  }

  // Cursor:~/.cursor/mcp.json
  if (existsSync(h(".cursor"))) {
    try {
      const changed = mergeMcpServers(h(".cursor", "mcp.json"));
      add("Cursor", changed ? "ok" : "already");
    } catch {
      add("Cursor", "manual", '~/.cursor/mcp.json 的 mcpServers 里加 "agentosity"');
    }
  } else {
    add("Cursor", "absent");
  }

  // Windsurf:~/.codeium/windsurf/mcp_config.json
  if (existsSync(h(".codeium", "windsurf"))) {
    try {
      const changed = mergeMcpServers(h(".codeium", "windsurf", "mcp_config.json"));
      add("Windsurf", changed ? "ok" : "already");
    } catch {
      add("Windsurf", "manual", "~/.codeium/windsurf/mcp_config.json 的 mcpServers");
    }
  } else {
    add("Windsurf", "absent");
  }

  // OpenCode:~/.config/opencode/opencode.json(若用户用的是 .jsonc,不动它,给手动提示)
  const ocJson = h(".config", "opencode", "opencode.json");
  const ocJsonc = h(".config", "opencode", "opencode.jsonc");
  const ocInstalled = existsSync(h(".local", "share", "opencode")) || existsSync(h(".config", "opencode"));
  if (!ocInstalled) {
    add("OpenCode", "absent");
  } else if (existsSync(ocJsonc) && !existsSync(ocJson)) {
    add(
      "OpenCode",
      "manual",
      'opencode.jsonc 里加:"mcp": { "agentosity": { "type": "local", "command": ["npx", "-y", "agentosity", "serve"], "enabled": true } }'
    );
  } else {
    try {
      const changed = mergeJson(ocJson, (obj) => {
        obj.mcp ??= {};
        if (obj.mcp.agentosity) return false;
        obj.mcp.agentosity = { type: "local", command: ["npx", "-y", "agentosity", "serve"], enabled: true };
        return true;
      });
      add("OpenCode", changed ? "ok" : "already");
    } catch {
      add("OpenCode", "manual", "opencode.json 解析失败,手动加 mcp.agentosity");
    }
  }

  return results;
}

export function formatInstallResults(results) {
  const icon = { ok: "✅", already: "✅", manual: "✍️", absent: "—" };
  return results
    .filter((r) => r.status !== "absent")
    .map((r) => `  ${icon[r.status]} ${r.name}${r.status === "already" ? "(已配置)" : ""}${r.note ? `:${r.note}` : ""}`)
    .join("\n");
}
