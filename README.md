# Artifact Keeper login

Log in to [Artifact Keeper](https://github.com/artifact-keeper) from GitHub
Actions without a stored secret. The action exchanges the job's GitHub OIDC
token for a short-lived Artifact Keeper token. Which repositories that token
can use is decided on the Artifact Keeper side, by the CI OIDC mapping that
matches the job (repository, branch, workflow).

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - id: ak
    uses: openteams-ai/artifact-keeper-login@<commit sha>
    with:
      url: https://artifacts.example.com

  - run: rattler-build upload artifactory --url https://artifacts.example.com/conda/ --channel my-channel output/noarch/*.conda
    env:
      ARTIFACTORY_TOKEN: ${{ steps.ak.outputs.token }}
```

| Input | Required | Description |
| --- | --- | --- |
| `url` | yes | Artifact Keeper base URL. |
| `audience` | no | Audience requested in the GitHub OIDC token. Must match the Artifact Keeper CI OIDC provider's audience. Defaults to `url`. |

| Output | Description |
| --- | --- |
| `token` | Short-lived Artifact Keeper access token, masked in logs. |
| `username` | The Artifact Keeper service account the token belongs to. |

On the Artifact Keeper side, an admin creates a GitHub CI OIDC provider
(issuer `https://token.actions.githubusercontent.com`, audience as above) and a
mapping whose claim filters admit the job.

Built on GitHub's `@actions/core`. `dist/index.js` is the bundled action
(`npm ci --ignore-scripts && npm run build`); CI fails if it does not match
`src/`. Tests: `npm test`.
