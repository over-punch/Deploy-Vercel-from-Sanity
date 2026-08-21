// Framework-agnostic deploy proxy — holds the Vercel token and hook URLs so the Studio never does
//
// Copy this file, and one of the runtime wrappers next to it, into your own
// project. It has no dependency on the Sanity plugin.

/** Environment the proxy needs. Everything here is a server-side secret except TARGETS' keys. */
export interface ProxyEnv {
	/** Vercel API token. Scope it to the Team that owns the projects, not Full Account. */
	vercelToken: string
	/**
	 * Map of proxy key to Vercel deploy hook URL, e.g.
	 * `{ production: 'https://api.vercel.com/v1/integrations/deploy/prj_.../...' }`.
	 * These are deploy credentials — they belong here, not in the dataset.
	 */
	hooks: Record<string, string>
	/**
	 * Map of proxy key to the project the hook belongs to, used for status lookups:
	 * `{ production: { projectId: 'prj_…', hookId: '…', teamId: 'team_…' } }`.
	 * projectId and hookId are the last two path segments of the deploy hook URL.
	 */
	projects: Record<string, { projectId: string; hookId: string; teamId?: string }>
	/**
	 * Key the Studio sends with status, log and cancel requests.
	 *
	 * Present in the Studio bundle and therefore public. It permits reading
	 * deployment status and build logs for the configured targets, and cancelling
	 * their in-progress deployments — cancel is a write, so this is not a read-only
	 * key. Requests are scoped to the configured projects. Required.
	 */
	statusKey?: string
	/**
	 * Sanity roles permitted to deploy, checked against the requesting user.
	 * Omit to accept anyone Sanity's write ACL already let create the request —
	 * which excludes viewers, since they cannot write at all.
	 */
	allowedRoles?: string[]
	/** Sanity project id, dataset and a read token — only needed when `allowedRoles` is set. */
	sanity?: { projectId: string; dataset: string; readToken: string }
}

/** Minimal shape of the webhook payload the Studio's request document produces. */
export interface DeployRequestPayload {
	_id?: string
	_type?: string
	proxyKey?: string
	/** Sanity stamps this; the client cannot forge it. */
	_createdBy?: string
}

/** Result of handling a request, ready to be turned into a runtime response. */
export interface ProxyResult {
	status: number
	body: unknown
}

const VERCEL_API = 'https://api.vercel.com'

/** Only genuine Vercel deploy hooks are ever POSTed to. */
const VERCEL_HOOK_RE = /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//

/** Call the Vercel API with the server-held token. */
async function vercel<T>(path: string, env: ProxyEnv, init?: RequestInit): Promise<T> {
	const res = await fetch(`${VERCEL_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${env.vercelToken}`,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	})
	if (!res.ok) throw new Error(`Vercel API ${res.status}`)
	return res.json() as Promise<T>
}

/**
 * Look up the Sanity roles of the user who created the request document.
 *
 * Only used when `allowedRoles` is set. Without it, authorisation is already
 * handled by Sanity's write ACL — a viewer cannot create the document at all.
 */
async function userRoles(userId: string, env: ProxyEnv): Promise<string[]> {
	if (!env.sanity) throw new Error('allowedRoles is set but sanity config is missing')
	const { projectId, readToken } = env.sanity
	const res = await fetch(`https://api.sanity.io/v2021-06-07/projects/${projectId}/acl`, {
		headers: { Authorization: `Bearer ${readToken}` },
	})
	if (!res.ok) throw new Error(`Sanity ACL lookup failed: ${res.status}`)
	const acl = (await res.json()) as Array<{ userId: string; roles?: Array<{ name: string }> }>
	const entry = acl.find(a => a.userId === userId)
	return entry?.roles?.map(r => r.name) ?? []
}

/**
 * Handle a verified deploy-request webhook.
 *
 * The caller MUST have verified the Sanity webhook signature before calling this
 * — see the runtime wrappers. An unverified payload is an unauthenticated deploy
 * trigger.
 *
 * @param payload Parsed webhook body for the created request document.
 * @param env     Proxy environment.
 */
export async function handleDeployRequest(payload: DeployRequestPayload, env: ProxyEnv): Promise<ProxyResult> {
	// Lowercased to match envFromProcess, which lowercases the env-var side. Without
	// this, a target typed as "Production" would 404 against a PRODUCTION env var.
	const key = payload.proxyKey?.trim().toLowerCase()
	if (!key) return { status: 400, body: { error: 'Request document has no proxyKey' } }

	const hook = env.hooks[key]
	if (!hook) return { status: 404, body: { error: `No hook configured for key "${key}"` } }
	if (!VERCEL_HOOK_RE.test(hook)) return { status: 500, body: { error: `Hook for "${key}" is not a Vercel deploy hook` } }

	if (env.allowedRoles?.length) {
		const userId = payload._createdBy
		if (!userId) return { status: 403, body: { error: 'Request document has no creator' } }
		const roles = await userRoles(userId, env)
		if (!roles.some(r => env.allowedRoles!.includes(r))) {
			return { status: 403, body: { error: 'Requesting user is not permitted to deploy' } }
		}
	}

	const res = await fetch(hook, { method: 'POST' })
	if (!res.ok) return { status: 502, body: { error: `Deploy hook returned ${res.status}` } }
	return { status: 200, body: { ok: true, key } }
}

/**
 * Reject a request whose status key does not match.
 *
 * Fails closed: an unset key rejects everything rather than serving everyone. The
 * previous behaviour left cancellation open to unauthenticated callers, since
 * cancel is gated by this same check.
 */
function checkStatusKey(provided: string | null, env: ProxyEnv): ProxyResult | null {
	if (!env.statusKey) {
		return { status: 500, body: { error: 'VERCEL_DEPLOY_STATUS_KEY is not configured' } }
	}
	return provided === env.statusKey ? null : { status: 401, body: { error: 'Invalid status key' } }
}

/**
 * Confirm a deployment actually belongs to the project behind `key`.
 *
 * Without this, `deploymentId` is caller-supplied and the project lookup only
 * supplies `teamId` — so a team-scoped token would let any holder of the (public)
 * status key read build logs for, or cancel, any deployment in the whole team.
 *
 * @param deploymentId Deployment the caller is asking about.
 * @param project      Project configured for the requested proxy key.
 */
async function assertDeploymentInProject(
	deploymentId: string,
	project: { projectId: string; teamId?: string },
	env: ProxyEnv,
): Promise<ProxyResult | null> {
	const query = new URLSearchParams()
	if (project.teamId) query.set('teamId', project.teamId)
	const suffix = query.toString() ? `?${query}` : ''
	let deployment: { projectId?: string }
	try {
		deployment = await vercel<{ projectId?: string }>(
			`/v13/deployments/${encodeURIComponent(deploymentId)}${suffix}`,
			env,
		)
	} catch (err) {
		// Distinguish an unknown deployment from a broken token or a rate limit —
		// collapsing all three into 404 makes a revoked token look like a UI bug.
		const status = Number(String(err instanceof Error ? err.message : '').match(/\b(\d{3})\b/)?.[1])
		if (status === 401 || status === 403) {
			return { status: 502, body: { error: 'Vercel rejected the proxy token — check VERCEL_API_TOKEN' } }
		}
		if (status === 429) return { status: 429, body: { error: 'Vercel rate limit reached' } }
		return { status: 404, body: { error: 'Deployment not found' } }
	}
	if (!deployment.projectId) {
		// Loud rather than silently denying forever if the API shape ever changes.
		return { status: 502, body: { error: 'Vercel returned no projectId; cannot verify deployment ownership' } }
	}
	if (deployment.projectId !== project.projectId) {
		return { status: 403, body: { error: 'Deployment does not belong to this target' } }
	}
	return null
}

/** List recent deployments for a proxy key. */
export async function handleDeployments(
	params: { key: string | null; limit?: number; statusKey: string | null },
	env: ProxyEnv,
): Promise<ProxyResult> {
	const denied = checkStatusKey(params.statusKey, env)
	if (denied) return denied
	const project = params.key ? env.projects[params.key.trim().toLowerCase()] : undefined
	if (!project) return { status: 404, body: { error: 'Unknown target key' } }

	const query = new URLSearchParams({
		projectId: project.projectId,
		'meta-deployHookId': project.hookId,
		limit: String(params.limit ?? 10),
	})
	if (project.teamId) query.set('teamId', project.teamId)
	const data = await vercel<{ deployments: unknown[] }>(`/v6/deployments?${query}`, env)
	return { status: 200, body: { deployments: data.deployments ?? [] } }
}

/** Fetch build log events for a deployment. */
export async function handleEvents(
	params: { key: string | null; deploymentId: string | null; statusKey: string | null },
	env: ProxyEnv,
): Promise<ProxyResult> {
	const denied = checkStatusKey(params.statusKey, env)
	if (denied) return denied
	const project = params.key ? env.projects[params.key.trim().toLowerCase()] : undefined
	if (!project) return { status: 404, body: { error: 'Unknown target key' } }
	if (!params.deploymentId) return { status: 400, body: { error: 'Missing deploymentId' } }
	const wrongProject = await assertDeploymentInProject(params.deploymentId, project, env)
	if (wrongProject) return wrongProject

	// direction=backward returns the *newest* events. Without it Vercel returns the
	// first 100, so a failed build showed the top of its log and never the error.
	const query = new URLSearchParams({ limit: '100', direction: 'backward' })
	if (project.teamId) query.set('teamId', project.teamId)
	const raw = await vercel<unknown>(
		`/v2/deployments/${encodeURIComponent(params.deploymentId)}/events?${query}`,
		env,
	)
	// Vercel has returned both a bare array and a wrapped object here; tolerate both.
	const events = Array.isArray(raw)
		? raw
		: Array.isArray((raw as { events?: unknown[] })?.events)
			? (raw as { events: unknown[] }).events
			: []
	return { status: 200, body: { events } }
}

/** Cancel an in-progress deployment. */
export async function handleCancel(
	params: { key?: string; deploymentId?: string; statusKey: string | null },
	env: ProxyEnv,
): Promise<ProxyResult> {
	const denied = checkStatusKey(params.statusKey, env)
	if (denied) return denied
	const project = params.key ? env.projects[params.key.trim().toLowerCase()] : undefined
	if (!project) return { status: 404, body: { error: 'Unknown target key' } }
	if (!params.deploymentId) return { status: 400, body: { error: 'Missing deploymentId' } }
	const wrongProject = await assertDeploymentInProject(params.deploymentId, project, env)
	if (wrongProject) return wrongProject

	const query = new URLSearchParams()
	if (project.teamId) query.set('teamId', project.teamId)
	const suffix = query.toString() ? `?${query}` : ''
	await vercel(`/v12/deployments/${encodeURIComponent(params.deploymentId)}/cancel${suffix}`, env, {
		method: 'PATCH',
	})
	return { status: 200, body: { ok: true } }
}

/** Build a {@link ProxyEnv} from process.env, using the documented variable names. */
export function envFromProcess(e: Record<string, string | undefined>): ProxyEnv {
	const hooks: ProxyEnv['hooks'] = {}
	const projects: ProxyEnv['projects'] = {}
	// VERCEL_DEPLOY_HOOK_<KEY> and VERCEL_DEPLOY_PROJECT_<KEY> pairs define the targets.
	for (const [name, value] of Object.entries(e)) {
		if (!value) continue
		const hookMatch = name.match(/^VERCEL_DEPLOY_HOOK_(.+)$/)
		if (hookMatch) hooks[hookMatch[1].toLowerCase()] = value
		const projMatch = name.match(/^VERCEL_DEPLOY_PROJECT_(.+)$/)
		if (projMatch) {
			const [projectId, hookId, teamId] = value.split(':')
			projects[projMatch[1].toLowerCase()] = { projectId, hookId, teamId: teamId || undefined }
		}
	}
	const allowedRoles = e.VERCEL_DEPLOY_ALLOWED_ROLES?.split(',').map(r => r.trim()).filter(Boolean)
	return {
		vercelToken: e.VERCEL_API_TOKEN ?? '',
		hooks,
		projects,
		statusKey: e.VERCEL_DEPLOY_STATUS_KEY,
		allowedRoles: allowedRoles?.length ? allowedRoles : undefined,
		sanity: e.SANITY_PROJECT_ID && e.SANITY_READ_TOKEN
			? { projectId: e.SANITY_PROJECT_ID, dataset: e.SANITY_DATASET ?? 'production', readToken: e.SANITY_READ_TOKEN }
			: undefined,
	}
}
