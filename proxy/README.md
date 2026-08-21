# Deploy proxy

Optional. Use this if you need **editors and above to trigger deploys, without any
credential being stealable from the dataset**.

## Why it exists

In the default (`direct`) mode the Studio talks to Vercel itself. That means two
things live in the dataset:

- the **Vercel API token**, in a `config.vercelDeploy` document
- a **deploy hook URL** on every target

Sanity has no per-document access control, so both are readable by everyone who
can read the dataset — and if the dataset is public, by anyone at all. The hook
URL matters as much as the token: it *is* the deploy credential, so restricting
the Deploy tool to editors does nothing while a viewer can read the URL and
`curl` it.

Proxy mode moves both to a server you control. The Studio holds no credential.

## How it works

```
Deploy   Studio creates a vercelDeploy.request document
         └─ Sanity's write ACL authorises this. Viewers cannot write, so they cannot deploy.
         └─ Sanity webhook (signed) ──▶ proxy ──▶ POSTs the hook URL from its own env

Status   Studio ──▶ proxy /deployments|/events|/cancel ──▶ Vercel API with the server-held token
```

The only value that reaches the browser is a **status key**. It permits reading
deployment status and build logs for the configured **projects**, and cancelling
their in-progress deployments — cancel is a write, so this is not a read-only key.
It ships inside the Studio bundle, so treat it as public.

Read [What this does not solve](#what-this-does-not-solve) before deciding this is
enough for your threat model.

## Setup

Roughly 15 minutes.

### 1. Add the route

Copy `core.ts` and `nextjs-app-router/route.ts` into your Next.js app:

```
app/api/vercel-deploy/[...path]/route.ts   ← nextjs-app-router/route.ts
app/api/vercel-deploy/core.ts              ← core.ts
```

`route.ts` imports `parseBody` from `next-sanity`, so install it if you have not:

```sh
npm i next-sanity
```

Not on Next.js? `core.ts` has no framework dependency. Wrap it in your own handler
and verify the Sanity webhook signature before calling `handleDeployRequest` —
that verification is the only thing standing between the endpoint and an
unauthenticated deploy trigger.

### 2. Set environment variables

See `.env.example`. The two per-target ones:

```sh
VERCEL_DEPLOY_HOOK_PRODUCTION=https://api.vercel.com/v1/integrations/deploy/prj_xxx/yyy
VERCEL_DEPLOY_PROJECT_PRODUCTION=prj_xxx:yyy
```

`prj_xxx` and `yyy` are the last two path segments of the hook URL. The suffix
after the prefix (`PRODUCTION`) is the **proxy key** you put on the target
document; it is matched case-insensitively. Environment variable names cannot
contain hyphens, so keys must be `[A-Za-z0-9_]` — use `my_site`, not `my-site`.

For a team-owned project, append the team id — `projectId:hookId:teamId`. **The
Team ID field on the target document is ignored in proxy mode**; the proxy reads
it from here, because the Studio never talks to Vercel.

Scope `VERCEL_API_TOKEN` to the **Team** that owns the projects, not Full Account.

`VERCEL_DEPLOY_STATUS_KEY` and the plugin's `statusKey` must hold the **same
value**. Generate one with `openssl rand -hex 16`. The proxy fails closed — if the
server-side variable is unset, status requests return 500 rather than serving
everyone.

Set `VERCEL_DEPLOY_ALLOWED_ORIGINS` to your Studio's origin(s), comma-separated —
for example `https://acme.sanity.studio,http://localhost:3333`. The Studio is
cross-origin and sends a custom header, so without this the browser blocks every
status call at the preflight.

### 3. Add the Sanity webhook

Sanity → Project → API → Webhooks → Create:

Use a **GROQ-powered webhook**, not a legacy one.

| Field | Value |
| --- | --- |
| URL | `https://your-site.com/api/vercel-deploy/deploy` |
| Dataset | your dataset |
| Trigger on | Create |
| Filter | `_type == "vercelDeploy.request"` |
| Projection | *leave empty* — the proxy needs both `proxyKey` and `_createdBy` |
| HTTP method | POST |
| Secret | same value as `SANITY_WEBHOOK_SECRET` |

The secret must match byte for byte; `parseBody` verifies the
`sanity-webhook-signature` header against it and rejects anything else.

### 4. Point the plugin at it

`SANITY_STUDIO_DEPLOY_STATUS_KEY` goes in the **Studio's** `.env`, not the proxy's.
Sanity only inlines variables prefixed `SANITY_STUDIO_`, and it inlines them at
**build time** — so it must be present wherever you run `sanity build` / `sanity
deploy`, and changing it needs a rebuild. If it is missing the header is omitted
entirely and the proxy answers 401, which reads like a mismatch rather than an
absence.

```ts
vercelDeploy({
  mode: 'proxy',
  proxyUrl: 'https://your-site.com/api/vercel-deploy',
  statusKey: process.env.SANITY_STUDIO_DEPLOY_STATUS_KEY,
})
```

### 5. Set a proxy key on each target

In the Deploy tool, each target now asks for a **Proxy Key** instead of a hook
URL. Use the same suffix as the environment variables — `production`, `staging`.

## Verify it worked

Status path — expect `{"deployments":[…]}`. `{"error":"Unknown target key"}` is
also JSON, so read the body, not just the status:

```sh
curl -s -H "x-deploy-status-key: $VERCEL_DEPLOY_STATUS_KEY" \
  "https://your-site.com/api/vercel-deploy/deployments?key=production"
```

CORS — curl does not implement CORS, so the call above passes even with
`VERCEL_DEPLOY_ALLOWED_ORIGINS` unset. Check the preflight explicitly and look for
`Access-Control-Allow-Origin` in the response headers:

```sh
curl -si -X OPTIONS \
  -H "Origin: https://your-project.sanity.studio" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-deploy-status-key" \
  "https://your-site.com/api/vercel-deploy/deployments" | head -20
```

Deploy path — click **Deploy** in the Studio, then check, in order:

1. **Sanity → API → Webhooks → your webhook → delivery log.** This is where the
   proxy's response lands. The Studio never sees it, so a 400/403/404/502 here is
   invisible in the UI and this log is the only place it appears.
2. A new `vercelDeploy.request` document exists. If not, the click failed
   client-side — check the browser console.
3. A new deployment in Vercel.

## When the webhook fires but nothing deploys

| Symptom in the delivery log | Cause |
| --- | --- |
| `400 Request document has no proxyKey` | The target has no Proxy Key set |
| `404 No hook configured for key "…"` | Key does not match any `VERCEL_DEPLOY_HOOK_*` variable |
| `403 Requesting user is not permitted` | `VERCEL_DEPLOY_ALLOWED_ROLES` excludes the requester |
| `502 Deploy hook returned …` | Vercel rejected the hook — check it still exists |
| `401 Invalid signature` | `SANITY_WEBHOOK_SECRET` does not match the webhook's secret |
| `500 Missing SANITY_WEBHOOK_SECRET` | The variable is not set on the proxy |
| `403 Request document has no creator` | `_createdBy` was absent — the webhook has a projection set; leave it empty |
| An opaque 500 with no body | `VERCEL_DEPLOY_ALLOWED_ROLES` is set without `SANITY_PROJECT_ID` / `SANITY_READ_TOKEN` |
| An SSO/login page instead of JSON | **Vercel Deployment Protection** is on for the app hosting the proxy. Use Protection Bypass for Automation, or add the route to the **OPTIONS Allowlist**. This breaks the *status* path too — a preflight from the Studio gets the SSO challenge, which surfaces as a blocked CORS request rather than an auth error. |

Status shows nothing while deploys work? That is the CORS or status-key path, not
the webhook — check the browser console for a blocked preflight, and confirm both
sides hold the same status key.

## Who can deploy

By default: anyone Sanity lets create a document. That already excludes viewers,
which is usually what "editors and above" means in practice.

To require specific roles, set `VERCEL_DEPLOY_ALLOWED_ROLES` plus the `SANITY_*`
variables. The proxy then looks up the roles of the user in `_createdBy` — a field
Sanity stamps and the client cannot forge — and rejects anything not on the list.
Note that `contributor` can also write, so include it explicitly or exclude it
deliberately.

## What this does not solve

**The status key is effectively public, and it can do more than read.** A hosted
Studio bundle is fetchable without logging in, and the key is compiled into it. So
in the worst case anyone on the internet can: list your deployments (which yields
deployment ids), read their build logs, and **cancel an in-progress production
build**. `VERCEL_DEPLOY_ALLOWED_ORIGINS` does not prevent this — CORS constrains
browsers, not `curl`.

**Build logs can contain secrets.** A failed build that dumps `process.env`, a
registry 401 echoing a token, a stack trace with a connection string — all of that
is returned to a status-key holder. Do not treat log exposure as harmless.

If that is unacceptable, do not rely on the status key alone: put the proxy behind
network controls, or drop `statusKey` usage and accept losing status while keeping
the deploy path, which is properly gated by the signed webhook and Sanity's write
ACL.

**Scoping is per project, not per target.** `assertDeploymentInProject` checks the
deployment's `projectId`. A key holder can therefore read logs for, and cancel, any
deployment in a configured project — including git-push deployments the plugin's UI
never lists — but nothing outside those projects.

**Role gating is proxy-wide.** `VERCEL_DEPLOY_ALLOWED_ROLES` is one list for all
targets; there is no "contributors may deploy staging but not production."

**Request documents accumulate** unless you prune them. The proxy does not delete
them, so they double as an audit trail of who deployed what and when. Their type is
not registered in the schema, so they appear in the Studio as "Unknown document
type" if you browse to one — that is expected, not a bug.

**`assertDeploymentInProject` assumes** `GET /v13/deployments/{id}` returns a
top-level `projectId`. If Vercel ever changes that, the proxy returns a loud 502
rather than silently allowing or denying.
