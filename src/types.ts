// TypeScript types for deploy-vercel-from-sanity

export type VercelDeployState =
	| 'QUEUED'
	| 'INITIALIZING'
	| 'BUILDING'
	| 'READY'
	| 'ERROR'
	| 'CANCELED'
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
	 * Studio, so treat it as public. It is deliberately low-value: it permits
	 * reading deployment status for the configured projects and nothing else. The
	 * Vercel API token never leaves the proxy.
	 */
	statusKey?: string
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
