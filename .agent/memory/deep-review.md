# Panel Review — Project Specialists

Saved: 2026-08-20

## Specialists
1. Deep Accessibility Specialist — hand-rolled fallback UI replaces @sanity/ui components that had real a11y behaviour.
2. React Runtime / Hooks Engineer — module-scope resolution, conditional hook call, module-level toast queue.
3. Sanity Plugin Ecosystem Engineer — Studio v3–v6 matrix, barrel vs subpath, plugin contract.
4. Dependency / Semver Engineer — peer ranges across three majors of two packages.
5. Bundler / SSR Interop Engineer — namespace reads resolved at runtime, dual ESM+CJS output.

## Known intentional patterns
Do not re-flag these; each was decided deliberately with evidence.

- **Namespace import + runtime branch instead of subpath imports.** Subpaths for `@sanity/icons` exist only from 4.1.0 and for `@sanity/ui` only from 4.0.0, so a static subpath import breaks Studio v3.30–v6.3. A dynamic `import()` of a v4-only subpath also fails, because the consumer's bundler must resolve the specifier at build time even on branches that never execute.
- **The namespace is aliased into a binding and probed with `in`/member access.** Verified through Vite/Rollup that this is what forces bundlers to materialise a real namespace object rather than rewriting member access into named bindings. Do not "optimise" it into direct `sanityUi.x` access without re-checking the emitted bundle.
- **`sideEffects: true`.** Not laziness — `icons.tsx` and `primitives.tsx` run impure top-level resolution at import time. `false` would be a lie.
- **The token document type is NOT registered in the schema.** Registering it (tried in 1.2.0) adds a "Vercel Deploy Configuration" entry to the Structure sidebar for every editor. Revocation lives in the tool instead.
- **`resolveComponent<P>` still lets a caller name an arbitrary props type.** No runtime guard can verify a component's prop shape; the constraint that matters is that the return is a component, not an arbitrary `T`.
- **Local fallbacks for Tooltip / menu / Code / toasts on ui v4+** are deliberate degradation, not an attempt to reimplement Sanity's components wholesale.

## Measured facts worth not re-deriving
- Extending the seam from 7 names to all 28 costs **+889 B raw / +289 B gz** end-to-end (0.22% of a ~395 KB consumer bundle). The larger figures quoted early in review compared namespace-vs-named in isolation; 1.1.1 already carried the namespace.
- `@sanity/icons` namespace vs `import { Icon }`: **144 B**. The 236 lazy chunks come from `Icon` itself.
- `Stack` is a `forwardRef` object on ui 2.16.27 and 3.5.3, a plain function on 4.0.5. That is the probe for `space` vs `gap`.
- Passing both `space` and `gap` is not viable: `gap` leaks to the DOM as a stray attribute on v2, `space` leaks on v4.
- `tool.icon` is not rendered by any Studio from v3 to v6 (checked the built `lib/` of 3.80.1, 5.31.2, 6.10.1).

## Process notes
- Three panels called the module-scoped toast `setTimeout` a leak; the React specialist showed it is correct by design. Domain specialists overruled majority opinion — weigh accordingly.
- The first fix round introduced its own defects (a StrictMode guard that was never re-armed, a tooltip that named nothing, DOM fallbacks that would have undone the labelling fixes). **Always run the bounded re-check pass on rewritten files** — it caught a bug that broke `sanity dev` for every consumer.
