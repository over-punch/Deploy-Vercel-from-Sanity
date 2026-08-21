# Changelog

All notable changes to `@liiift-studio/deploy-vercel-from-sanity`.

## 1.3.0

Adds an optional deploy proxy for setups where the dataset is not a safe place for
credentials. **Direct mode is unchanged and remains the default** — existing
installs need no changes.

### Added

- **`mode: 'proxy'`.** The Studio holds no Vercel credentials. Deploys are
  requested by creating a `vercelDeploy.request` document, which Sanity's own
  write ACL already restricts to roles that can write — so viewers cannot deploy —
  and a signed Sanity webhook hands the request to a server-side proxy that owns
  the token and the hook URLs.
- **`proxy/`** ships with the package: a framework-agnostic `core.ts`, a drop-in
  Next.js App Router route, an annotated `.env.example`, and a setup guide.
  Roughly 15 minutes to stand up.
- **`proxyKey`** on deploy targets. In proxy mode the target form asks for this
  instead of a hook URL, because a hook URL *is* a deploy credential — leaving one
  in the dataset lets any reader trigger a build regardless of role.
- Optional `VERCEL_DEPLOY_ALLOWED_ROLES` on the proxy, checked against
  `_createdBy`, which Sanity stamps and the client cannot forge.

### Fixed before release

A README and persona-panel review of the proxy caught defects in it:

- Proxy mode's entire status half was dead code — the fetch guard still required a
  hook URL and a token, which proxy targets deliberately lack, so polling, history,
  cancel and build logs never ran while deploys succeeded silently.
- No CORS handling, so every cross-origin status call from the Studio was blocked at
  the preflight. Added an allowlist, an `OPTIONS` handler, and error responses that
  carry CORS headers — without which every operational fault surfaced as
  "Failed to fetch" instead of the real message.
- `deploymentId` was never checked against the target's project, so a holder of the
  (public by design) status key could read build logs for, and cancel, any
  deployment the token could see. Now verified against the deployment's `projectId`.
- An unset status key served everyone rather than failing closed.
- Build logs came back oldest-first and the wrapped response shape was discarded, so
  a failed build showed the top of its log and never the error.
- Editing a target's proxy key left the card polling the old one until reload.

### Changed

- The deploy hook URL is no longer unconditionally required on a target; a target
  needs either a hook URL or a proxy key, enforced by cross-field validation.
- Token controls are hidden in proxy mode, where they have nothing to do.
- The README documents that restricting the tool to editors is a UI convenience in
  direct mode, not a security control.

## 1.2.1

Fixes for defects the 1.2.0 changes themselves introduced, found by a re-check
pass over the rewritten files.

### Fixed

- **Cards rendered permanently empty under `sanity dev`.** The unmount guard added
  in 1.2.0 was only ever cleared, never re-armed, and StrictMode runs
  mount → cleanup → mount. After the double-invoke every deployment response was
  discarded, so the card left its loading state and showed nothing. Production
  builds were unaffected, which is what made it easy to miss.
- **Tooltips described nothing.** `aria-describedby` was placed on the wrapper
  element rather than the control inside it, and a description is exposed from the
  focused element — so the text was announced to nobody, and the copy button was
  left with no accessible name at all once the old `title` was removed. The
  description is now cloned onto the child and attached only while shown.
- The copy button has an explicit accessible name, and the copied state is
  announced through its own live region rather than relying on a changed label.
- Tabbing out of the overflow menu returns focus to the trigger instead of
  dropping it to `<body>` and restarting tab order at the top of the Studio.
  Dismissing by clicking outside reclaims focus only if it was inside the menu.
- Space activates link menu items, which anchors do not do natively.
- Menu items are no longer `<button>` elements wrapping block content, which was
  an invalid content model.
- Hovering the menu no longer moves real keyboard focus and desyncs arrow-key
  position.
- Toast auto-dismiss resumes on blur as well as mouse-leave; previously tabbing to
  a toast pinned it on screen permanently. A toast holding focus is not re-armed.
- Trimming the toast stack cancels the dropped toast's timer instead of leaving it
  to fire for an id no longer queued.
- The toast region uses `role="log"`, whose implicit `aria-atomic="false"` matches
  an append-only stack; `role="status"` implies atomic and re-announced the whole
  column on every new toast.
- The DOM fallbacks forward `as`, `htmlFor`, `target` and `rel`, so a degraded
  `Button as="a" href` stays a link and a degraded `Label htmlFor` keeps its
  association — previously the fallback would have silently undone the labelling
  and link fixes it exists to protect.
- Dialog ids are generated rather than hardcoded, matching the reasoning already
  applied to the form field ids.
- The resolution helpers are split by what they return — component, function or
  plain record — with guards to match. The previous single generic was
  unconstrained, so a caller could name a type the runtime check never
  established, and a non-callable tombstone would have read as a present
  `useToast` and thrown on call.
- The installed-menu branch is type-checked again. It had been typed as an
  index-signature bag, which accepted any prop on the path most Studios take.
- `exports` declares types per format; an ESM consumer was resolving the
  CJS-flavoured declarations, and `dist/index.d.mts` was unreachable.
- `engines` records the real Node constraint (`>=20.19 <22 || >=22.12`). Node
  22.0–22.11 has no `require(esm)`, so the CJS build cannot load there.
- The `sanity` peer range is capped. Leaving it open while `@sanity/ui` is capped
  would have kept claiming support for a release whose own dependency this
  plugin forbids.
- `src` is no longer published. It was about a third of the tarball and, with the
  `source` condition removed in 1.2.0, nothing could resolve it.

### Changed

- The Vercel token document type is no longer registered in the schema. Registering
  it in 1.2.0 added a "Vercel Deploy Configuration" entry to the Structure sidebar
  for every editor, which is a worse trade than the visibility it bought. The token
  is revoked from the tool instead: **Token connected → Remove token**.

## 1.2.0

Follow-up to the 1.1.x Studio v6 work, after a full review pass.

### Changed — compatibility

- Every `@sanity/ui` value is now resolved from the installed package rather than
  statically imported. Previously only the seven names that v4 relocated went
  through the compat layer; thirteen others were still named imports, so a future
  major relocating `Dialog` or `Badge` would have stopped the Studio booting
  rather than degrading.
- The `space` → `gap` decision for `Stack` now probes the shape of `Stack` itself
  (a `forwardRef` object on ui 2/3, a plain function on ui 4) instead of inferring
  it from the absence of `useToast` from the barrel. The old signal could be
  flipped by an unrelated upstream patch release, silently collapsing every
  vertical gap in the tool.
- Peer ranges are bounded: `@sanity/ui >=2 <5`, `@sanity/icons >=2 <6`. A new
  major must be reviewed rather than installed automatically.
- Minimum Studio is now stated as **v3.30**, not v3.0 — `sanity@3.0` resolves
  `@sanity/ui` v1, which this plugin has never supported.
- `react-dom` is declared as a peer dependency. It was imported and externalised
  but undeclared, so it resolved only by hoisting.
- `engines` now records the Node floor (20.19) that the ESM-only Sanity packages require.

### Fixed — on @sanity/ui v4 (Studio 6.10+)

- The copy button's "Copied!" confirmation never appeared, because the fallback
  tooltip used the native `title` attribute and browsers do not re-read it while
  the pointer is stationary. Tooltips are now real elements, shown on focus as
  well as hover, and wired to their control with `aria-describedby`.
- The overflow menu now implements the WAI-ARIA menu button pattern: focus moves
  into the menu on open, arrow keys and Home/End move between items with a roving
  tabindex, Escape and Tab close it and return focus to the trigger, and the
  active item has a visible focus ring. It previously declared `role="menu"` while
  implementing only Escape.
- Menu items are snapshotted while the menu is open, so background polling can no
  longer insert or remove rows under the pointer — which could shift **Delete**
  into the slot the user was about to click.
- The Delete item keeps its destructive tone; an inline `background` override was
  cancelling it.
- Toasts are announced in a live region that stays mounted, can be dismissed,
  pause on hover and focus, and no longer swallow pointer events over the tool.
  Error and warning toasts persist until dismissed.
- Build-log blocks render as blocks rather than relying on the caller to pass
  `display: block`.

### Fixed — all versions

- Draft deploy targets no longer render duplicate cards. `useClient` returns a
  raw-perspective client, so the target query now excludes drafts, and deleting a
  target removes its draft counterpart.
- Deployment hostnames from the Vercel API are validated before use as an `href`
  or copied to the clipboard. Concatenating `https://` onto an API value fixed
  only the scheme, so a host of `@evil.com` produced a link to another origin.
  GitHub commit links are validated the same way.
- `teamId` is URL-encoded before being sent on authenticated API requests.
- Polling failures are shown in the card. Rate-limit and auth errors were caught
  and logged only, so a card that had stopped updating looked idle.
- Deployment fetches are sequenced, so a slow earlier poll can no longer overwrite
  a newer response.
- The token dialog can always be dismissed. On first run it offered neither a
  Cancel button nor Escape, which made it a keyboard trap.
- Form fields have real labels, required state, and validation wired via
  `aria-describedby`/`aria-invalid`; ids are generated rather than hardcoded.
- The build-logs link in the history table is a link, not a `<Button>` nested in
  an `<a>` — the previous markup was inoperable by keyboard.
- The injected stylesheet is reference-counted, so a second tool instance
  unmounting no longer strips the first instance's styles.
- The stored Vercel token can be revoked from the tool — **Token connected →
  Remove token**.
- The schema icon is an eager SVG. Studio serialises schema icons with
  `renderToString`, which cannot resolve `@sanity/icons` v5's lazy component, so
  the type published to Canvas/Create with a blank icon.

### Documentation

- Corrected the claim that the `@sanity/icons` v5 break was invisible to
  TypeScript. It is not: v5 declares the removed names as `never` with a
  deprecation note, so a static named import is a compile error as well as a
  runtime one. The runtime-resolution design still stands, but on the version-range
  argument alone — per-icon subpaths do not exist before icons 4.1.0.
- Rewrote the compatibility table, which described Studio v3 as pairing with
  `@sanity/icons` 3.x when it ships 2.x, and keyed behaviour to Studio version
  when the code keys it to the resolved `@sanity/ui`.
- Corrected the security section: the token is readable by anyone who can read the
  dataset, including unauthenticated readers of a public dataset.
- Corrected the external-link claim, which described `safeHref()` coverage the code
  did not have.
- Noted that `tool.icon` is not rendered by any Studio version from v3 to v6.

## 1.1.1

- Relaxed the `@sanity/icons` peer range to `>=2`; `>=3` failed installs on Studio 3.

## 1.1.0

- Added Sanity Studio v6 support by resolving `@sanity/icons` and `@sanity/ui`
  from the installed package at runtime.

## 1.0.10 and earlier

See the commit history.
