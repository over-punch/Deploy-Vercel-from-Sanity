// Vercel REST API helpers — all calls require a bearer token
import type { VercelDeployment, DeploymentEvent } from '../types'

const BASE = 'https://api.vercel.com'

/** Only allow genuine Vercel deploy hook URLs through triggerDeploy */
const VERCEL_HOOK_RE = /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//

async function vercelFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	})
	if (!res.ok) {
		const hint =
			res.status === 401 ? ' — token is invalid or expired. Reconnect your API token.' :
			res.status === 403 ? ' — token lacks the required permissions. Scope it to the team that owns the project, and set the target\'s Team ID.' :
			res.status === 404 ? ' — resource not found. Check the deploy hook URL and team ID.' :
			res.status === 429 ? ' — rate limit reached. Wait a moment and try again.' :
			res.status >= 500  ? ' — Vercel is experiencing issues. Try again shortly.' :
			''
		throw new Error(`Vercel API ${res.status}${hint}`)
	}
	return res.json() as Promise<T>
}

/** Fetch the last N deployments triggered by a specific deploy hook */
export async function listDeployments(opts: {
	projectId: string
	hookId: string
	token: string
	teamId?: string
	limit?: number
}): Promise<VercelDeployment[]> {
	const params = new URLSearchParams({
		projectId: opts.projectId,
		'meta-deployHookId': opts.hookId,
		limit: String(opts.limit ?? 10),
	})
	if (opts.teamId) params.set('teamId', opts.teamId)
	const data = await vercelFetch<{ deployments: VercelDeployment[] }>(
		`/v6/deployments?${params}`,
		opts.token,
	)
	return data.deployments ?? []
}

/** Cancel an in-progress deployment */
export async function cancelDeployment(opts: {
	deploymentId: string
	token: string
	teamId?: string
}): Promise<void> {
	// teamId is free text from the target document — encode it rather than splicing it in raw,
	// or an '&' injects extra parameters into an authenticated request.
	const params = new URLSearchParams()
	if (opts.teamId) params.set('teamId', opts.teamId)
	const query = params.toString() ? `?${params}` : ''
	await vercelFetch(
		`/v12/deployments/${encodeURIComponent(opts.deploymentId)}/cancel${query}`,
		opts.token,
		{ method: 'PATCH' },
	)
}

/**
 * Trigger a deploy by POSTing to the hook URL.
 * Validates the URL is a genuine Vercel hook before calling to prevent
 * SSRF if a document is tampered with outside the Studio schema.
 */
export async function triggerDeploy(hookUrl: string): Promise<void> {
	if (!VERCEL_HOOK_RE.test(hookUrl)) {
		throw new Error('Invalid deploy hook URL — must be a Vercel hook (api.vercel.com/v1/integrations/deploy/…)')
	}
	const res = await fetch(hookUrl, { method: 'POST' })
	if (!res.ok) throw new Error(`Deploy hook returned ${res.status}`)
}

/**
 * Fetch build events for a deployment.
 * Returns up to 100 events in reverse chronological order,
 * filtered to lines with actual text content.
 */
export async function getDeploymentEvents(opts: {
	deploymentId: string
	token: string
	teamId?: string
}): Promise<DeploymentEvent[]> {
	const params = new URLSearchParams({ limit: '100', direction: 'backward' })
	if (opts.teamId) params.set('teamId', opts.teamId)
	// API returns either a plain array or a wrapped object depending on version
	const raw = await vercelFetch<DeploymentEvent[] | { events?: DeploymentEvent[] }>(
		`/v2/deployments/${encodeURIComponent(opts.deploymentId)}/events?${params}`,
		opts.token,
	)
	const events: DeploymentEvent[] = Array.isArray(raw) ? raw : (raw.events ?? [])
	return events.filter(e => e.text?.trim())
}
