// TypeScript types for deploy-vercel-from-sanity

export type VercelDeployState =
	| 'QUEUED'
	| 'INITIALIZING'
	| 'BUILDING'
	| 'READY'
	| 'ERROR'
	| 'CANCELED'
	/**
	 * Vercel refused to build the commit because its git author is not a member of
	 * the team that owns the project. Nothing was compiled, so there are no build
	 * logs to read — the fix is a new commit by an authorised author, not a retry.
	 * Re-firing the deploy hook cannot clear it: the hook rebuilds the same HEAD.
	 */
	| 'BLOCKED'
	| 'LOADING' // internal — before first API response

/** A vercel_deploy document stored in the Sanity dataset */
export interface DeployTarget {
	_id: string
	_type: 'vercel_deploy'
	name: string
	/**
	 * Full Vercel deploy hook URL. Used in `direct` mode.
	 *
	 * In `proxy` mode leave this empty and set {@link proxyKey} instead — a hook URL
	 * is itself a deploy credential, so storing one in the dataset lets anyone who
	 * can read the dataset trigger a build regardless of their Studio role.
	 */
	url?: string
	/**
	 * Identifier the proxy maps to a hook URL held in its own environment. Used in
	 * `proxy` mode. Contains no secret.
	 */
	proxyKey?: string
	/** Vercel team ID — optional, only needed for team projects */
	teamId?: string
	/** Prevent editors from deleting this target */
	disableDeleteAction?: boolean
}

/** A single deployment returned by GET /v6/deployments */
export interface VercelDeployment {
	uid: string
	/** Preview hostname, e.g. my-project-abc123.vercel.app */
	url: string
	state: VercelDeployState
	/** Unix ms timestamp — when the deployment was created */
	created: number
	/** Unix ms timestamp — when the deployment became ready */
	ready?: number
	/** Link to the Vercel dashboard page for this deployment */
	inspectorUrl?: string
	creator?: {
		uid: string
		username: string
		avatar?: string
	}
	meta?: {
		githubCommitMessage?: string
		githubCommitRef?: string
		githubCommitSha?: string
		githubCommitAuthorName?: string
		/**
		 * GitHub login of the commit author. This — not `creator` — is what Vercel
		 * checks when deciding whether to build, so it is the value to name when a
		 * deployment comes back BLOCKED.
		 */
		githubCommitAuthorLogin?: string
		/**
		 * Branch the deploy hook is configured for. Present only on hook-triggered
		 * deployments, and more reliable than githubCommitRef for learning which branch
		 * a target follows, since it describes the hook rather than one commit.
		 */
		deployHookRef?: string
		/** GitHub repo in "org/repo" format — used to construct commit links */
		githubRepo?: string
		/** GitHub org slug — fallback when githubRepo is absent */
		githubCommitOrg?: string
	}
}

/** A single build event returned by GET /v2/deployments/{id}/events */
export interface DeploymentEvent {
	type: 'command' | 'stdout' | 'stderr' | 'exit' | 'deployment-state'
	text?: string
	created: number
	payload?: Record<string, unknown>
}

/** Vercel config document stored at _id: 'config.vercelDeploy' — readable by all authenticated users */
export interface VercelConfig {
	_id: 'config.vercelDeploy'
	_type: 'vercelDeploy.config'
	accessToken: string
}

/**
 * How the plugin reaches Vercel.
 *
 * - `direct` (default) — the Studio calls Vercel itself, using an API token stored
 *   in the dataset and deploy hook URLs stored on each target. Simplest to set up.
 *   Everything in the dataset is readable by everyone who can read the dataset,
 *   so anyone with read access can both read the token and trigger a deploy.
 * - `proxy` — the Studio holds no Vercel credentials. Deploys are requested by
 *   creating a document, which Sanity's own write ACL already restricts to roles
 *   that can write, and a server-side proxy performs the actual deploy. See
 *   `proxy/README.md`.
 */
export type VercelDeployMode = 'direct' | 'proxy'

/**
 * Opt-in recovery path for deployments Vercel refuses to build because the HEAD
 * commit's git author is not a member of the Vercel team.
 *
 * The Studio cannot fix this itself — the remedy is a commit by an authorised
 * author, and a browser holds no git credential. There are two ways to borrow
 * one, and they are not equivalent:
 *
 * - **{@link endpoint} (preferred).** The Studio posts the signed-in user's
 *   Sanity session token to a route on your own site; the route verifies it and
 *   commits with its own server-held GitHub token. Nothing secret reaches the
 *   browser, there is one token to maintain, and there is no workflow file whose
 *   presence on the default branch you have to remember.
 *
 * - **{@link token}.** The Studio dispatches a GitHub Actions workflow directly.
 *   Needs no server, but puts a GitHub token in the bundle, which is public.
 *   Scope it to **Actions: write on the one repo** so the worst a leak permits is
 *   running that workflow, and never give it `Contents: write` — a public token
 *   that can push code is a public token that can run code on your next build.
 *
 * Set `endpoint` if you have anywhere to put a route. It wins when both are set.
 */
export interface UnblockConfig {
	/**
	 * URL of a site API route that performs the bump server-side. **Preferred.**
	 *
	 * In this mode the Studio carries no GitHub credential at all. It posts the
	 * signed-in user's Sanity session token, the route verifies it against Sanity,
	 * and the route's own server-held GitHub token makes the commit. One token,
	 * never public, and no workflow file to keep on the default branch.
	 *
	 * Takes precedence over {@link token} when both are set.
	 */
	endpoint?: string
	/**
	 * Fine-grained GitHub token, scoped to `Actions: write` on {@link repo} alone.
	 * Only used when {@link endpoint} is not set.
	 *
	 * Compiled into the Studio bundle, so anyone who can load the Studio can read
	 * it and dispatch the workflow. Never give it `Contents: write` — that would
	 * let a reader push arbitrary commits to the production repo. If you have a
	 * server to put a route on, prefer {@link endpoint} and avoid this entirely.
	 */
	token?: string
	/** Repository owner, e.g. `your-org`. Required for workflow-dispatch mode only. */
	owner?: string
	/** Repository name. Required for workflow-dispatch mode only. */
	repo?: string
	/**
	 * Workflow filename to dispatch. Defaults to `version-bump.yml`.
	 * Workflow-dispatch mode only.
	 *
	 * GitHub resolves a dispatch against the workflow file **on the repository's
	 * default branch**, then runs the copy on the requested ref — so the file must
	 * exist on the default branch as well as on every branch you deploy from, or
	 * the dispatch returns 404. `endpoint` mode has no such constraint.
	 */
	workflow?: string
	/**
	 * Branch to bump when the blocked deployment does not name one. Normally
	 * unnecessary: the branch is read from the deployment being unblocked.
	 */
	defaultRef?: string
}

/** Plugin configuration options */
export interface VercelDeployPluginConfig {
	/** Tool name slug shown in Studio sidebar (default: 'vercel-deploy') */
	name?: string
	/** Tool label shown in Studio sidebar (default: 'Deploy') */
	title?: string
	/**
	 * Accepted and stored on the tool descriptor. No Studio version from v3 to v6
	 * renders `tool.icon`, so this currently has no visible effect.
	 */
	icon?: React.ComponentType
	/** Transport used to reach Vercel. Defaults to `direct`. */
	mode?: VercelDeployMode
	/**
	 * Base URL of the deploy proxy, without a trailing slash — for example
	 * `https://example.com/api/vercel-deploy`. Required when `mode` is `proxy`.
	 */
	proxyUrl?: string
	/**
	 * Key sent with status requests to the proxy.
	 *
	 * This ends up in the Studio bundle, which is served publicly for a hosted
	 * Studio, so treat it as public. It permits reading deployment status and build
	 * logs for the configured projects, and cancelling their in-progress
	 * deployments — cancel is a write, so this is not a read-only key. The Vercel
	 * API token never leaves the proxy.
	 */
	statusKey?: string
	/**
	 * Enables the "Bump version" recovery button on deployments Vercel blocked for
	 * git-author reasons. Omit to leave the feature off — the button never renders
	 * and no GitHub token is required.
	 */
	unblock?: UnblockConfig
}

/** A deploy request document, created by the Studio and consumed by the proxy. */
export interface VercelDeployRequest {
	_type: 'vercelDeploy.request'
	/** Reference to the `vercel_deploy` target being deployed. */
	target: { _type: 'reference'; _ref: string }
	/** Proxy key of the target, duplicated so the proxy needs no dataset read to act. */
	proxyKey: string
	requestedAt: string
}
