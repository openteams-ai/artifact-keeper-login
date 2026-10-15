// Runs the action against a local stand-in for GitHub's OIDC endpoint and
// Artifact Keeper. Run with: node --test
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function stub(exchangeStatus) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(JSON.stringify({ value: "github-oidc-token" }));
    } else if (exchangeStatus === 200) {
      res.end(JSON.stringify({ access_token: "ak-token", username: "svc-example" }));
    } else {
      res.statusCode = exchangeStatus;
      res.end(JSON.stringify({ message: "no mapping matches" }));
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, requests, base: `http://127.0.0.1:${server.address().port}` })),
  );
}

async function runAction(exchangeStatus, inputs = {}) {
  const { server, requests, base } = await stub(exchangeStatus);
  // The runner creates the $GITHUB_OUTPUT file before the step starts.
  const output = join(mkdtempSync(join(tmpdir(), "ak-login-")), "output");
  writeFileSync(output, "");
  // Not spawnSync: that would block the stub server in this process.
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/index.js"], {
      env: {
        PATH: process.env.PATH,
        ACTIONS_ID_TOKEN_REQUEST_URL: `${base}/oidc?api-version=2.0`,
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
        GITHUB_OUTPUT: output,
        INPUT_URL: `${base}/`,
        ...inputs,
      },
    });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("close", (status) => resolve({ status, stdout }));
  });
  server.close();
  return { ...result, requests, outputs: readFileSync(output, "utf8"), base };
}

test("exchanges the job's OIDC token for an Artifact Keeper token", async () => {
  const { status, stdout, requests, outputs, base } = await runAction(200);

  assert.equal(status, 0, stdout);
  assert.deepEqual(requests, [
    {
      method: "GET",
      url: `/oidc?api-version=2.0&audience=${encodeURIComponent(base)}`,
      auth: "Bearer request-token",
    },
    { method: "POST", url: "/api/v1/auth/ci/token", auth: "Bearer github-oidc-token" },
  ]);
  assert.match(stdout, /^::add-mask::ak-token$/m);
  assert.match(outputs, /^token<<.+\nak-token\n.+$/m);
  assert.match(outputs, /^username<<.+\nsvc-example\n.+$/m);
});

test("asks GitHub for the audience input when given", async () => {
  const { status, requests } = await runAction(200, { INPUT_AUDIENCE: "https://example.com" });

  assert.equal(status, 0);
  assert.equal(requests[0].url, `/oidc?api-version=2.0&audience=${encodeURIComponent("https://example.com")}`);
});

test("fails with Artifact Keeper's answer when the exchange is refused", async () => {
  const { status, stdout, outputs } = await runAction(403);

  assert.equal(status, 1);
  assert.match(stdout, /^::error::.*HTTP 403.*no mapping matches/m);
  assert.equal(outputs, "");
});

test("fails clearly without id-token: write", () => {
  const result = spawnSync(process.execPath, ["dist/index.js"], {
    env: { PATH: process.env.PATH, INPUT_URL: "https://ak.example.com" },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::.*id-token: write/m);
});
