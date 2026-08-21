# Panel Review — Project Specialists

Saved: 2026-08-20

## Specialists
1. Deep Accessibility Specialist — detected: hand-rolled fallback menu with `role="menu"`/`role="menuitem"`/`aria-haspopup`/`aria-expanded` in src/ui.tsx, `htmlFor` on Label in DeployTargetForm.tsx. Replaces @sanity/ui's a11y-complete MenuButton on ui v4+.
2. React Runtime / Hooks Engineer — detected: conditional hook call in `useToast` (src/ui.tsx:107), module-scope mutable toast queue + listener Set (src/ui.tsx:76-94), forwardRef components constructed at module scope (src/icons.tsx:49).
3. Sanity Plugin Ecosystem Engineer — detected: Studio v3–v6 support matrix, barrel vs subpath resolution for @sanity/icons and @sanity/ui, definePlugin tool contract.
4. Dependency / Semver Engineer — detected: peerDependencies spanning three majors of two packages, the `IS_UI_V4_PLUS` runtime heuristic, ERESOLVE risk across five consumer studios.
5. Bundler / SSR Interop Engineer — detected: `import * as ns` namespace reads resolved at runtime, dual ESM+CJS tsup output with @sanity/* externalised, `document` access in effects.

## Known intentional patterns
<!-- Populated automatically after each review session -->
- Namespace import + runtime branch instead of subpath imports — intentional. Subpaths for `@sanity/icons` exist only from 4.1.0 and for `@sanity/ui` only from 4.0.0, so a static subpath import breaks Studio v3–v6.3. Dynamic `import()` of a v4-only subpath also fails, because the consumer's bundler must resolve the specifier at build time even on branches that never execute.
- Local fallbacks for Tooltip / menu / Code / toasts on `@sanity/ui` v4+ — intentional degradation, not an attempt to reimplement Sanity's components wholesale.
