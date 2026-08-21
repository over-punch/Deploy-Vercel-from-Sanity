# Changelog

All notable changes to `@liiift-studio/deploy-vercel-from-sanity`.

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
- The token document type (`vercelDeploy.config`) is registered, making the stored
  credential visible in Structure and removable from the Studio.
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
