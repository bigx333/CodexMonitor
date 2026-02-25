// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readFile(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function diff(left, right) {
  return sorted([...left].filter((value) => !right.has(value)));
}

function parseFrontendInvokeMethods(repoRoot) {
  const source = readFile(repoRoot, "src/services/tauri.ts");
  const methods = new Set();
  const regex = /invoke(?:<[^>]+>)?\(\s*"([a-z0-9_]+)"/g;
  for (const match of source.matchAll(regex)) {
    methods.add(match[1]);
  }
  return methods;
}

function parseAppInvokeHandlers(repoRoot) {
  const source = readFile(repoRoot, "src-tauri/src/lib.rs");
  const blockMatch = source.match(/generate_handler!\[([\s\S]*?)\]\)/);
  if (!blockMatch) {
    throw new Error("Unable to find tauri::generate_handler! block in src-tauri/src/lib.rs");
  }
  const block = blockMatch[1];
  const handlers = new Set();
  for (const raw of block.split(",")) {
    const entry = raw.replace(/\/\/.*$/gm, "").trim();
    if (!entry) {
      continue;
    }
    const candidate = entry.includes("::") ? entry.split("::").pop() : entry;
    if (candidate && /^[a-z_][a-z0-9_]*$/.test(candidate)) {
      handlers.add(candidate);
    }
  }
  return handlers;
}

function parseSharedMethodConstants(repoRoot) {
  const sharedDir = path.join(repoRoot, "src-tauri/src/shared");
  const files = fs.readdirSync(sharedDir).filter((file) => file.endsWith("_rpc.rs"));
  const result = new Map();
  for (const file of files) {
    const moduleName = path.basename(file, ".rs");
    const source = readFile(repoRoot, path.join("src-tauri/src/shared", file));
    const constants = new Map();
    const regex = /pub\(crate\) const (METHOD_[A-Z0-9_]+): &str = "([a-z0-9_]+)";/g;
    for (const match of source.matchAll(regex)) {
      constants.set(match[1], match[2]);
    }
    result.set(moduleName, constants);
  }
  return result;
}

function parseDaemonRpcMethods(repoRoot) {
  const constantsByModule = parseSharedMethodConstants(repoRoot);
  const daemonRpcDir = path.join(repoRoot, "src-tauri/src/bin/codex_monitor_daemon/rpc");
  const files = fs
    .readdirSync(daemonRpcDir)
    .filter((file) => file.endsWith(".rs"))
    .map((file) => path.join(daemonRpcDir, file));
  const methods = new Set();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/"([a-z0-9_]+)"\s*=>/g)) {
      methods.add(match[1]);
    }
    for (const match of source.matchAll(/([a-z_]+)::(METHOD_[A-Z0-9_]+)\s*=>/g)) {
      const moduleName = match[1];
      const constantName = match[2];
      const moduleConstants = constantsByModule.get(moduleName);
      const method = moduleConstants?.get(constantName);
      if (!method) {
        throw new Error(
          `Unable to resolve daemon RPC constant ${moduleName}::${constantName}`,
        );
      }
      methods.add(method);
    }
  }
  return methods;
}

const APP_ONLY_FRONTEND_METHODS = sorted([
  "app_build_type",
  "codex_update",
  "dictation_cancel",
  "dictation_cancel_download",
  "dictation_download_model",
  "dictation_model_status",
  "dictation_remove_model",
  "dictation_request_permission",
  "dictation_start",
  "dictation_stop",
  "dictation_transcribe_audio",
  "get_system_idle_seconds",
  "is_mobile_runtime",
  "mobile_push_registration_info",
  "send_presence_heartbeat",
  "tailscale_daemon_command_preview",
  "tailscale_daemon_start",
  "tailscale_daemon_status",
  "tailscale_daemon_stop",
  "tailscale_status",
  "terminal_close",
  "terminal_open",
  "terminal_resize",
  "terminal_write",
  "write_text_file",
]);

const DAEMON_ONLY_METHODS = sorted([
  "daemon_info",
  "daemon_shutdown",
  "dictation_transcribe",
  "ping",
  "presence_heartbeat",
  "push_notification_state",
]);

const APP_ONLY_REGISTERED_METHODS = sorted(["push_notification_state"]);

describe("RPC contract parity", () => {
  const repoRoot = process.cwd();
  const frontendMethods = parseFrontendInvokeMethods(repoRoot);
  const appHandlers = parseAppInvokeHandlers(repoRoot);
  const daemonMethods = parseDaemonRpcMethods(repoRoot);

  it("keeps frontend invoke commands registered in tauri handlers", () => {
    expect(diff(frontendMethods, appHandlers)).toEqual([]);
  });

  it("keeps app-only handler registrations explicit", () => {
    expect(diff(appHandlers, frontendMethods)).toEqual(APP_ONLY_REGISTERED_METHODS);
  });

  it("keeps frontend-only app commands explicit (not daemon-routed)", () => {
    expect(diff(frontendMethods, daemonMethods)).toEqual(APP_ONLY_FRONTEND_METHODS);
  });

  it("keeps daemon-only commands explicit", () => {
    expect(diff(daemonMethods, frontendMethods)).toEqual(DAEMON_ONLY_METHODS);
  });
});
