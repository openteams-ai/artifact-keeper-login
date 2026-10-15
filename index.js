// Log in to Artifact Keeper from GitHub Actions, without a stored secret:
// exchange the job's GitHub OIDC token for a short-lived Artifact Keeper
// token. No dependencies; uses only Node's built-ins.
const { appendFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

function setOutput(name, value) {
  const delimiter = `ghadelimiter_${randomUUID()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

async function main() {
  const url = (process.env.INPUT_URL || "").trim().replace(/\/+$/, "");
  const audience = (process.env.INPUT_AUDIENCE || "").trim() || url;
  if (!url) {
    throw new Error("the url input is required");
  }
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error("no GitHub OIDC token available: give the job `permissions: id-token: write`");
  }

  const oidc = await fetch(`${requestUrl}&audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `Bearer ${requestToken}` },
  });
  if (!oidc.ok) {
    throw new Error(`GitHub OIDC token request failed: HTTP ${oidc.status} ${await oidc.text()}`);
  }
  const { value: githubToken } = await oidc.json();

  const exchange = await fetch(`${url}/api/v1/auth/ci/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  if (!exchange.ok) {
    throw new Error(`Artifact Keeper login failed: HTTP ${exchange.status} ${await exchange.text()}`);
  }
  const { access_token: token, username } = await exchange.json();

  console.log(`::add-mask::${token}`);
  setOutput("token", token);
  setOutput("username", username);
  console.log(`Logged in to Artifact Keeper as ${username}`);
}

main().catch((error) => {
  console.log(`::error::${error.message}`);
  process.exitCode = 1;
});
