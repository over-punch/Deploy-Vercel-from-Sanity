// Deploy proxy route for Next.js App Router — drop in at app/api/vercel-deploy/[...path]/route.ts
//
// Requires `next-sanity` for webhook signature verification:
//   npm i next-sanity
//
// The Sanity plugin is configured with:
//   vercelDeploy({ mode: 'proxy', proxyUrl: 'https://your-site.com/api/vercel-deploy', statusKey: '…' })

import { parseBody } from 'next-sanity/webhook'
import {
	envFromProcess,
	handleCancel,
	handleDeployRequest,
	handleDeployments,
	handleEvents,
	type DeployRequestPayload,
} from '../core'

/**
 * Status key the Studio sends.
 *
 * Header only — deliberately no query-string fallback, so the key cannot end up in
 * access logs, Referer headers or CDN cache keys.
 */
function statusKeyOf(request: Request): string | null {
	return request.headers.get('x-deploy-status-key')
}

/** Last path segment, which selects the operation. */
function operation(request: Request): string {
	const { pathname } = new URL(request.url)
	return pathname.split('/').filter(Boolean).pop() ?? ''
}

/**
 * Origins allowed to call the status endpoints, comma-separated —
 * e.g. `https://acme.sanity.studio,http://localhost:3333`.
 *
 * The Studio is served from a different origin than this route and sends a custom
 * `x-deploy-status-key` header, which forces a CORS preflight. Without this the
 * browser blocks every status, log and cancel call.
 */
const ALLOWED_ORIGINS = (process.env.VERCEL_DEPLOY_ALLOWED_ORIGINS ?? '')
	.split(',')
	.map(o => o.trim())
	.filter(Boolean)

/** CORS headers for an allowed origin, or none when the origin is not permitted. */
function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get('origin')
	if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'content-type, x-deploy-status-key',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	}
}

/** Preflight. Required because of the custom status-key header. */
export async function OPTIONS(request: Request): Promise<Response> {
	return new Response(null, { status: 204, headers: corsHeaders(request) })
}

function json(result: { status: number; body: unknown }, request: Request): Response {
	return Response.json(result.body, { status: result.status, headers: corsHeaders(request) })
}

export async function GET(request: Request): Promise<Response> {
	try {
		return await handleGet(request)
	} catch (err) {
		// Must go through json(): an uncaught throw returns a 500 with no CORS
		// headers, which the browser refuses to expose, so the Studio shows
		// "Failed to fetch" rather than the message the transport wrote for this.
		return json({ status: 500, body: { error: err instanceof Error ? err.message : 'Proxy error' } }, request)
	}
}

async function handleGet(request: Request): Promise<Response> {
	const env = envFromProcess(process.env)
	const url = new URL(request.url)
	const key = url.searchParams.get('key')
	const statusKey = statusKeyOf(request)

	switch (operation(request)) {
		case 'deployments': {
			const limit = Number(url.searchParams.get('limit')) || undefined
			return json(await handleDeployments({ key, limit, statusKey }, env), request)
		}
		case 'events':
			return json(await handleEvents({ key, deploymentId: url.searchParams.get('deploymentId'), statusKey }, env), request)
		default:
			return json({ status: 404, body: { error: 'Unknown operation' } }, request)
	}
}

export async function POST(request: Request): Promise<Response> {
	try {
		return await handlePost(request)
	} catch (err) {
		return json({ status: 500, body: { error: err instanceof Error ? err.message : 'Proxy error' } }, request)
	}
}

async function handlePost(request: Request): Promise<Response> {
	const env = envFromProcess(process.env)

	// The deploy path is driven by a signed Sanity webhook, never by a direct call.
	// Signature verification is what makes this endpoint safe to expose publicly.
	if (operation(request) === 'deploy') {
		const secret = process.env.SANITY_WEBHOOK_SECRET
		if (!secret) return json({ status: 500, body: { error: 'Missing SANITY_WEBHOOK_SECRET' } }, request)

		const { isValidSignature, body } = await parseBody<DeployRequestPayload>(request, secret)
		if (!isValidSignature) return json({ status: 401, body: { error: 'Invalid signature' } }, request)
		if (!body) return json({ status: 400, body: { error: 'Empty payload' } }, request)

		return json(await handleDeployRequest(body, env), request)
	}

	if (operation(request) === 'cancel') {
		const payload = (await request.json()) as { key?: string; deploymentId?: string }
		return json(await handleCancel({ ...payload, statusKey: statusKeyOf(request) }, env), request)
	}

	return json({ status: 404, body: { error: 'Unknown operation' } }, request)
}
