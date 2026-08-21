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

The only value that reaches the browser is a **status key**, which permits reading
deployment status for the configured targets and nothing else. It ships inside the
Studio bundle, so treat it as public — that is why it is scoped this narrowly.

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
after the prefix (`PRODUCTION`) is the **proxy key** you will put on the target
document; it is matched case-insensitively.

Scope `VERCEL_API_TOKEN` to the **Team** that owns the projects, not Full Account.

### 3. Add the Sanity webhook

Sanity → Project → API → Webhooks → Create:

| Field | Value |
| --- | --- |
| URL | `https://your-site.com/api/vercel-deploy/deploy` |
| Dataset | your dataset |
| Trigger on | Create |
| Filter | `_type == "vercelDeploy.request"` |
| Secret | same value as `SANITY_WEBHOOK_SECRET` |

### 4. Point the plugin at it

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

## Who can deploy

By default: anyone Sanity lets create a document. That already excludes viewers,
which is usually what "editors and above" means in practice.

To require specific roles, set `VERCEL_DEPLOY_ALLOWED_ROLES` plus the `SANITY_*`
variables. The proxy then looks up the roles of the user in `_createdBy` — a field
Sanity stamps and the client cannot forge — and rejects anything not on the list.
Note that `contributor` can also write, so include it explicitly or exclude it
deliberately.

## What this does not solve

Deploy request documents accumulate unless you prune them. The proxy does not
delete them, so they double as an audit trail of who deployed what and when.

Status responses are readable by anyone holding the status key, which is public by
construction. That exposes deployment metadata — state, commit SHA, timings, build
log lines — but no credential.
