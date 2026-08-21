# deploy-vercel-from-sanity

**Trigger and monitor Vercel deployments directly from [Sanity Studio](https://www.sanity.io) — no context switching required.**

[![npm version](https://img.shields.io/npm/v/@liiift-studio/deploy-vercel-from-sanity)](https://www.npmjs.com/package/@liiift-studio/deploy-vercel-from-sanity)
[![Sanity v3.30–v6](https://img.shields.io/badge/sanity-v3.30%20%E2%80%93%20v6-f03e2f)](https://www.sanity.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

![The Deploy tool inside Sanity Studio — Production and Preview targets each showing a live status badge, branch, commit SHA, deploy author, and a one-click Deploy button](https://raw.githubusercontent.com/Liiift-Studio/Deploy-Vercel-from-Sanity/main/docs/screenshot.png?v=1)

---

## Features

- **One-click deploy** — trigger Production or Preview builds from inside Sanity Studio
- **Live status** with automatic polling — Queued → Building → Ready / Error
- **Build timer** showing elapsed time while a deploy is in progress
- **Cancel** in-progress deployments
- **Deploy-complete notifications** — Studio toast when a build finishes, errors, or is canceled
- **Copy deployment URL** with one click
- **GitHub commit links** — commit SHA links directly to the GitHub commit when repo metadata is available
- **Inline error log viewer** — see build errors without leaving the studio
- **Deployment history** per target
- **"Open in Vercel"** link to your project dashboard
- **Multiple targets** — configure Production, Preview, and any number of custom environments
- **Shared API token** — set it once; readable by anyone who can read the dataset (see [Security](#security))
- **Responsive grid layout** — cards reflow to fill the available width, one column on narrow viewports

---

## Installation

```bash
npm install @liiift-studio/deploy-vercel-from-sanity
```

---

## Quick start

### 1. Add the plugin to your Sanity config

```ts
// sanity.config.ts
import { defineConfig } from 'sanity'
import { vercelDeploy } from '@liiift-studio/deploy-vercel-from-sanity'

export default defineConfig({
  // ...
  plugins: [
    vercelDeploy({ title: 'Deploy', name: 'vercel-deploy' }),
  ],
})
```

### 2. Connect your Vercel API token

Open the **Deploy** tab in Sanity Studio and enter a Vercel API token when prompted.

To create a token: **vercel.com → Settings → Tokens → Create → Full Account scope**.

The token is stored in a `config.vercelDeploy` document in your dataset and shared across all authenticated studio users.

### 3. Add a deploy target

Create one or more `vercel_deploy` documents — each represents an environment (Production, Preview, etc.).

**Via Sanity CLI:**

```bash
sanity documents create << 'EOF'
{
  "_type": "vercel_deploy",
  "_id": "vercel-deploy-production",
  "name": "Production",
  "url": "https://api.vercel.com/v1/integrations/deploy/YOUR_PROJECT_ID/YOUR_HOOK_ID"
}
EOF
```

**To get your deploy hook URL:** Vercel Dashboard → Project → Settings → Git → Deploy Hooks → Create Hook.

**Available fields on each `vercel_deploy` document:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Display label (e.g. "Production", "Preview") |
| `url` | `url` | ✓ | Vercel deploy hook URL |
| `teamId` | `string` | | Vercel team ID — required for team-owned projects |
| `disableDeleteAction` | `boolean` | | Hides the delete button for this target in the studio UI |

---

## Plugin options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'vercel-deploy'` | Tool slug in the Studio sidebar |
| `title` | `string` | `'Deploy'` | Tool label in the Studio sidebar |
| `icon` | `ComponentType` | `RocketIcon` | Accepted and stored on the tool descriptor. Note that no Studio version from v3 to v6 currently renders `tool.icon`, so this has no visible effect today. |

---

## Restrict access to editors and above

By default the Deploy tab is visible to all authenticated users. To hide it from viewers:

> Filter on the tool name you actually configured. The snippet below uses the default `vercel-deploy`; if you passed a custom `name`, match that instead or the filter silently does nothing.

```ts
// sanity.config.ts
tools: (prev, { currentUser }) => {
  const canDeploy = currentUser?.roles?.some(r =>
    ['administrator', 'editor'].includes(r.name)
  )
  return canDeploy ? prev : prev.filter(t => t.name !== 'vercel-deploy')
},
```

---

## How it works

```mermaid
flowchart LR
    subgraph studio["Sanity Studio"]
        tool["Deploy tool"]
    end
    subgraph dataset["Sanity dataset"]
        targets["vercel_deploy docs<br/>(deploy targets)"]
        cfg["config.vercelDeploy doc<br/>(API token)"]
    end
    subgraph vercel["Vercel"]
        hook["Deploy hook<br/>POST /v1/integrations/deploy/…"]
        api["REST API<br/>/v6/deployments · /v2/.../events"]
    end

    tool -- "reads targets + token" --> targets
    tool -- "reads token" --> cfg
    tool -- "1 - click Deploy" --> hook
    hook -- "queues a build" --> api
    api -- "poll every 5s while active" --> tool
    tool -. "toast on Ready / Error / Canceled" .-> tool
```

1. Deploy targets are stored as `vercel_deploy` documents in your Sanity dataset.
2. The plugin fetches the last 10 deployments for each target from the Vercel API, filtered to those triggered by that hook.
3. While a deployment is active (Queued / Initializing / Building), it polls every 5 seconds.
4. Clicking **Deploy** POSTs to the hook URL — Vercel queues a new build.
5. If a deploy fails, clicking **Show error details** fetches the last 30 build log lines from the Vercel API inline.
6. A Studio toast notification fires when a deployment completes (Ready, Error, or Canceled).

> **Polling and rate limits** — Active deployments are polled every 5 seconds per target. With many simultaneous active deploys, API call volume adds up. Vercel's rate limit is generous for normal use, but studios with a large number of targets triggering concurrently may hit `429` errors. The plugin surfaces these with a clear message.

---

## Troubleshooting

### "Vercel API 401 — token is invalid or expired"

Your Vercel API token has been revoked or expired. Go to **Vercel → Settings → Tokens**, create a new token with **Full Account** scope, and reconnect it in the Deploy tab (top-right → *Token connected* button).

### "Vercel API 403 — token lacks the required permissions"

The token exists but was created with insufficient scope. Vercel tokens need **Full Account** scope to read deployments. Delete the token and create a new one with the correct scope.

### "Vercel API 404 — resource not found. Check the deploy hook URL and team ID."

Either the deploy hook URL is incorrect, or the project belongs to a Vercel team and the **Team ID** field is missing from the deploy target. Find your Team ID at **Vercel → Settings → General → Team ID** (starts with `team_`) and add it to the deploy target via the edit menu.

### "Vercel API 429 — rate limit reached"

The plugin is making too many API calls at once (common when many targets are all actively building). Wait a few seconds — polling will resume automatically.

### Deploy triggers but status never updates

This usually means the token is missing. The plugin can trigger deploys via hook URL without a token, but it needs an API token to read back deployment status. Connect a token using the button in the top-right of the Deploy tab.

### Commit SHA does not link to GitHub

The SHA link requires Vercel to return GitHub repo metadata with the deployment. This is present on deployments triggered by GitHub pushes but not on manually triggered hook deploys. Manually triggered deploys will show the SHA as plain text with a tooltip.

### No error logs shown after a failed build

If "No stderr or stdout was captured" appears, the build may have failed before producing log output, or the events API returned no lines. Use **Open in Vercel** to view the full build log in the Vercel dashboard.

---

## Security

**API token storage** — The Vercel API token is stored in cleartext in a `config.vercelDeploy` document of type `vercelDeploy.config`. Sanity has no per-document access control at this tier, so **the token is readable by anyone who can read the dataset** — and if the dataset is public, which is the usual setup for a statically generated front-end, that includes unauthenticated requests to the public GROQ API. A `viewer`-role member who cannot write a single document can also read it. Note that a **Full Account** scoped token can read and write your entire Vercel account, so anyone with studio access can read a credential that grants broad Vercel access — treat the token accordingly. The document type is registered with the plugin, so it is visible in Structure and can be deleted from the Studio to revoke the stored token. Audit who has access to your Sanity project at sanity.io → Project → Members, and do not store a Full Account token in a public dataset. If your studio includes untrusted editors, consider a server-side proxy that holds the token and exposes only a scoped deploy endpoint.

**Deploy hook URL validation** — `triggerDeploy` validates that the hook URL matches `api.vercel.com/v1/integrations/deploy/` before making the request, preventing SSRF from a tampered document.

**External links** — All external links use `target="_blank" rel="noreferrer"` and every `href` is validated before rendering: `safeHref()` rejects any non-http(s) scheme, and deployment hostnames from the API go through `deploymentHref()`, which rejects anything that is not a bare host. Both block `javascript:` injection and host substitution from a compromised API response.

**GROQ queries** — All GROQ queries in this plugin are static strings — no user input is interpolated.

---

## Requirements

- Sanity Studio v3.30 or newer, through v6
- React 18 or 19 (Studio v5 and v6 require React 19)
- Node 20.19+ or 22.12+
- A Vercel account with at least one project and a deploy hook configured

Zero runtime dependencies — `react`, `react-dom`, `sanity`, `@sanity/ui` and `@sanity/icons` are peer dependencies provided by your Studio; the plugin ships nothing else.

> **Why v3.30 and not v3.0?** `sanity@3.0` pulls `@sanity/ui` v1, and this plugin needs v2 or newer. `@sanity/ui` reaches 2.x at `sanity@3.30.0`.

### Studio compatibility

A single build supports the whole range. `@sanity/icons` v5 and `@sanity/ui` v4
both moved components out of their barrel files, so the plugin resolves every
`@sanity/ui` and `@sanity/icons` value from the installed package at runtime
rather than importing names that exist on only one major.

Behaviour depends on the resolved packages, not on the Studio version — a
lockfile that hoists a different major changes which row applies:

| `@sanity/ui` | `@sanity/icons` | Typical Studio | Behaviour |
| --- | --- | --- | --- |
| 2.x | 2.x / 3.x | v3.30 – v3.x | Fully Studio-native |
| 3.x | 3.x | v4 – v6.3 | Fully Studio-native |
| 3.x | 5.x | v6.4 – v6.9 | Icons resolved via `<Icon symbol>` |
| 4.x | 5.x | v6.10+ | Tooltips, overflow menu, log blocks and toasts use built-in equivalents, since `@sanity/ui` v4 serves those from subpaths that do not exist on earlier majors |

The built-in equivalents are functional rather than pixel-identical to Studio's
own: the overflow menu implements the WAI-ARIA menu button pattern locally, and
toasts render in a live region anchored to the bottom-right of the tool.

---

## Contributing

Issues and pull requests welcome at [github.com/Liiift-Studio/Deploy-Vercel-from-Sanity](https://github.com/Liiift-Studio/Deploy-Vercel-from-Sanity).

Local development, `npm link`, and publishing steps are documented in [SETUP.md](./SETUP.md).

---

## License

MIT
