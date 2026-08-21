// Chooses between calling Vercel directly and going through the deploy proxy
import type { VercelDeployment, DeploymentEvent } from '../types'
import { listDeployments, cancelDeployment, getDeploymentEvents } from './api'

/**
 * How status and cancel requests reach Vercel.
 *
 * `direct` carries the Vercel API token in the browser; `proxy` carries only a
 * status key, and the token stays on the server.
 */
export type Transport =
	| { mode: 'direct'; token: string }
	| { mode: 'proxy'; proxyUrl: string; statusKey?: string }

/** One deploy target, as the transport needs to identify it. */
export interface TargetRef {
	projectId?: string
	hookId?: string
	proxyKey?: string
	teamId?: string
}

/** Read a JSON response from the proxy, turning a failure into a useful message. */
async function proxyFetch<T>(url: string, statusKey: string | undefined, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(statusKey ? { 'x-deploy-status-key': statusKey } : {}),
			...init?.headers,
		},
	})
	if (!res.ok) {
		const hint =
			res.status === 401 ? ' — the proxy rejected the status key. Check `statusKey` matches the proxy.' :
			res.status === 404 ? ' — the proxy has no target with that key. Check `proxyKey` matches the proxy configuration.' :
			res.status >= 500  ? ' — the deploy proxy is failing. Check its logs.' :
			''
		throw new Error(`Deploy proxy ${res.status}${hint}`)
	}
	return res.json() as Promise<T>
}

/** Fetch recent deployments for a target, over whichever transport is configured. */
export async function fetchDeployments(
	transport: Transport,
	target: TargetRef,
	limit?: number,
): Promise<VercelDeployment[]> {
	if (transport.mode === 'direct') {
		if (!target.projectId || !target.hookId) return []
		return listDeployments({
			projectId: target.projectId,
			hookId: target.hookId,
			token: transport.token,
			teamId: target.teamId,
			limit,
		})
	}
	const params = new URLSearchParams({ key: target.proxyKey ?? '' })
	if (limit) params.set('limit', String(limit))
	const data = await proxyFetch<{ deployments: VercelDeployment[] }>(
		`${transport.proxyUrl}/deployments?${params}`,
		transport.statusKey,
	)
	return data.deployments ?? []
}

/** Cancel an in-progress deployment, over whichever transport is configured. */
export async function cancelDeploy(
	transport: Transport,
	target: TargetRef,
	deploymentId: string,
): Promise<void> {
	if (transport.mode === 'direct') {
		return cancelDeployment({ deploymentId, token: transport.token, teamId: target.teamId })
	}
	await proxyFetch(`${transport.proxyUrl}/cancel`, transport.statusKey, {
		method: 'POST',
		body: JSON.stringify({ key: target.proxyKey, deploymentId }),
	})
}

/** Fetch build log events for a deployment, over whichever transport is configured. */
export async function fetchDeploymentEvents(
	transport: Transport,
	target: TargetRef,
	deploymentId: string,
): Promise<DeploymentEvent[]> {
	if (transport.mode === 'direct') {
		return getDeploymentEvents({ deploymentId, token: transport.token, teamId: target.teamId })
	}
	const params = new URLSearchParams({ key: target.proxyKey ?? '', deploymentId })
	const data = await proxyFetch<{ events: DeploymentEvent[] }>(
		`${transport.proxyUrl}/events?${params}`,
		transport.statusKey,
	)
	return data.events ?? []
}
