# Setup & Publishing Guide

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

Peer dependencies (provided by consuming projects):
- `react` >= 18
- `react-dom` >= 18
- `sanity` >= 3.30
- `@sanity/ui` >= 2 < 5
- `@sanity/icons` >= 2 < 6

`@sanity/ui` and `@sanity/icons` are normally transitive dependencies of `sanity`
rather than direct entries in a studio's package.json, so they resolve by hoisting.
Under pnpm's isolated store or Yarn PnP you may need to install them explicitly.

### 2. Configure NPM Authentication

Ensure you're logged in to npm:

```bash
npm whoami
```

If not logged in:

```bash
npm login
```

### 3. Verify Package Contents

Check what will be published:

```bash
npm pack --dry-run
```

---

## Local Development Workflow

### Setting Up npm link (for Darden or any consuming studio)

The `npm link` workflow creates a symlink from the studio's `node_modules` to your local development folder. Because the package exports a `"source": "./src/index.ts"` condition, Vite picks up the raw TypeScript directly — no build step needed during development.

**One-Time Setup:**

```bash
# Step 1: Register the package globally
cd /path/to/foundry-platform/tools/sanity-tools/deploy-vercel-from-sanity
npm link

# Step 2: Link it into a studio (e.g., darden)
cd /path/to/foundry-platform/sites/darden/sanity
npm link @liiift-studio/deploy-vercel-from-sanity
```

**How It Works:**
- The studio's `node_modules/@liiift-studio/deploy-vercel-from-sanity` now points to your local development folder
- Vite resolves the `"source"` export condition and loads `src/index.ts` directly
- Hot-reload works automatically on save — no `npm run build` needed during development

**Development Loop:**

1. Edit a file in `src/`
2. Save the file
3. Vite detects the change and hot-reloads the Sanity Studio
4. Test the change in the browser

**When Done Developing:**

```bash
# Unlink and return to the published version
cd /path/to/foundry-platform/sites/darden/sanity
npm unlink @liiift-studio/deploy-vercel-from-sanity
npm install @liiift-studio/deploy-vercel-from-sanity@latest
```

### Troubleshooting npm link

**Problem: Changes not appearing**
- Restart the Sanity dev server: `npm run dev`
- Clear the Vite cache: `rm -rf node_modules/.vite` in the studio directory

**Problem: Module not found**
- Ensure you ran `npm link` in the package directory first
- Verify the symlink exists: `ls -la node_modules/@liiift-studio/`

**Problem: TypeScript errors in the studio**
- The studio resolves `src/index.ts` — ensure the TypeScript source is valid before testing

---

## Publishing

### 1. Build the Package

```bash
npm run build
```

This runs `tsup` and outputs CJS (`dist/index.js`) and ESM (`dist/index.mjs`) along with type declarations.

### 2. Version Bump

Follow semantic versioning:

```bash
# Patch release (bug fixes, minor UI tweaks)
npm version patch

# Minor release (new features, backward compatible)
npm version minor

# Major release (breaking changes)
npm version major
```

> **Note:** If the git working directory is not clean, `npm version` will refuse to run. Either commit pending changes first, or manually edit the `version` field in `package.json`.

### 3. Publish to NPM

```bash
npm publish
```

**Post-Publish:**
- Verify on npm: https://www.npmjs.com/package/@liiift-studio/deploy-vercel-from-sanity
- Update consuming studios (see below)

---

## Integration in Consumer Projects

### 1. Install the Package

```bash
cd sites/darden/sanity
npm install @liiift-studio/deploy-vercel-from-sanity
```

> If the studio uses React 19 with older packages that declare strict React peer deps, add `legacy-peer-deps=true` to the studio's `.npmrc`.

### 2. Update sanity.config.js

```js
import { vercelDeploy } from '@liiift-studio/deploy-vercel-from-sanity'

export default defineConfig({
  plugins: [
    vercelDeploy(),
  ],
})
```

To restrict to editors and above:

```js
tools: (prev, { currentUser }) => {
  const canDeploy = currentUser?.roles?.some(r =>
    ['administrator', 'editor'].includes(r.name)
  )
  return canDeploy ? prev : prev.filter(t => t.name !== 'vercel-deploy')
},
```

### 3. Create Deploy Targets

Each deploy environment needs a `vercel_deploy` document in the Sanity dataset:

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

---

## Updating Consumer Studios

After publishing a new version:

```bash
# darden
cd sites/darden/sanity && npm install @liiift-studio/deploy-vercel-from-sanity@latest

# tdf
cd sites/tdf/sanity && npm install @liiift-studio/deploy-vercel-from-sanity@latest

# positype
cd sites/positype/sanity && npm install @liiift-studio/deploy-vercel-from-sanity@latest
```

---

## Release Checklist

- [ ] Test changes with `npm link` in at least one studio — note which `@sanity/ui`
      major that studio resolves. Under `npm link` the namespace imports resolve
      against **this package's** node_modules (ui 4 / icons 5), so linking alone
      does not exercise the v2/v3 paths.
- [ ] Typecheck against the oldest and newest supported majors, not just the installed one
- [ ] Run `npm test` — the suite covers the proxy's authorization boundary and the URL validators
- [ ] Run `npm run build` and confirm no TypeScript errors
- [ ] Bump version in `package.json` **and `src/version.ts`** — they are hand-synced
      and the value is rendered to users as a watermark in the tool
- [ ] Add a `CHANGELOG.md` entry
- [ ] Run `npm publish`
- [ ] Verify on npm: https://www.npmjs.com/package/@liiift-studio/deploy-vercel-from-sanity
- [ ] Update consuming studios with the new version
- [ ] Push git changes
