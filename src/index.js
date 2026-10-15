// Log in to Artifact Keeper from GitHub Actions, without a stored secret:
// exchange the job's GitHub OIDC token for a short-lived Artifact Keeper
// token.
import * as core from "@actions/core";

async function run() {
  const url = core.getInput("url", { required: true }).replace(/\/+$/, "");
  const audience = core.getInput("audience") || url;
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new Error("no GitHub OIDC token available: give the job `permissions: id-token: write`");
  }

  const githubToken = await core.getIDToken(audience);

  const exchange = await fetch(`${url}/api/v1/auth/ci/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  if (!exchange.ok) {
    throw new Error(`Artifact Keeper login failed: HTTP ${exchange.status} ${await exchange.text()}`);
  }
  const { access_token: token, username } = await exchange.json();

  core.setSecret(token);
  core.setOutput("token", token);
  core.setOutput("username", username);
  core.info(`Logged in to Artifact Keeper as ${username}`);
}

run().catch((error) => core.setFailed(error.message));
