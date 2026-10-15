import { spawn } from "node:child_process";
import { mkdtempSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Regression: bin entry must launch the server when invoked through a symlink
// (npm/pnpm global installs symlink `bin/hwp-mcp -> dist/server.js`). The old
// `isMain` check compared `import.meta.url` with the unresolved argv[1] path,
// so symlinked launches silently exited 0 and the MCP transport never started.
describe("bin symlink launch", () => {
  it("responds to initialize when spawned via a symlink to dist/server.js", async () => {
    const distServer = resolve(__dirname, "..", "dist", "server.js");
    if (!existsSync(distServer)) {
      throw new Error(
        `dist/server.js missing — run \`npm run build\` before tests`
      );
    }

    const dir = mkdtempSync(join(tmpdir(), "hwp-mcp-bin-"));
    const linkPath = join(dir, "hwp-mcp");
    symlinkSync(distServer, linkPath);

    try {
      const response = await new Promise<string>((resolvePromise, reject) => {
        const child = spawn(process.execPath, [linkPath], {
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(
            new Error(
              `timed out waiting for initialize response. stderr=${stderr}`
            )
          );
        }, 5000);
        child.stdout.on("data", (d) => {
          stdout += d.toString();
          if (stdout.includes("\n")) {
            clearTimeout(timer);
            child.kill();
            resolvePromise(stdout);
          }
        });
        child.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        child.on("exit", (code) => {
          if (!stdout) {
            clearTimeout(timer);
            reject(
              new Error(
                `server exited (code=${code}) before responding. stderr=${stderr}`
              )
            );
          }
        });
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test", version: "1" },
            },
          }) + "\n"
        );
      });

      const line = response.split("\n").find((l) => l.trim().length > 0)!;
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe("2.0");
      expect(parsed.id).toBe(1);
      expect(parsed.result?.serverInfo?.name).toBe("hwp-mcp");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
