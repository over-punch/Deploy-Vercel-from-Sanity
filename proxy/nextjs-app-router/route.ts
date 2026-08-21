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

/** Status key the Studio sends. Read from the header, falling back to the query string. */
function statusKeyOf(request: Request): string | null {
	const url = new URL(request.url)
	return request.headers.get('x-deploy-status-key') ?? url.searchParams.get('key_')
}

/** Last path segment, which selects the operation. */
function operation(request: Request): string {
	const { pathname } = new URL(request.url)
	return pathname.split('/').filter(Boolean).pop() ?? ''
}

function json(result: { status: number; body: unknown }): Response {
	return Response.json(result.body, { status: result.status })
}

export async function GET(request: Request): Promise<Response> {
	const env = envFromProcess(process.env)
	const url = new URL(request.url)
	const key = url.searchParams.get('key')
	const statusKey = statusKeyOf(request)

	switch (operation(request)) {
		case 'deployments': {
			const limit = Number(url.searchParams.get('limit')) || undefined
			return json(await handleDeployments({ key, limit, statusKey }, env))
		}
		case 'events':
			return json(await handleEvents({ key, deploymentId: url.searchParams.get('deploymentId'), statusKey }, env))
		default:
			return Response.json({ error: 'Unknown operation' }, { status: 404 })
	}
}

export async function POST(request: Request): Promise<Response> {
	const env = envFromProcess(process.env)

	// The deploy path is driven by a signed Sanity webhook, never by a direct call.
	// Signature verification is what makes this endpoint safe to expose publicly.
	if (operation(request) === 'deploy') {
		const secret = process.env.SANITY_WEBHOOK_SECRET
		if (!secret) return Response.json({ error: 'Missing SANITY_WEBHOOK_SECRET' }, { status: 500 })

		const { isValidSignature, body } = await parseBody<DeployRequestPayload>(request, secret)
		if (!isValidSignature) return Response.json({ error: 'Invalid signature' }, { status: 401 })
		if (!body) return Response.json({ error: 'Empty payload' }, { status: 400 })

		return json(await handleDeployRequest(body, env))
	}

	if (operation(request) === 'cancel') {
		const payload = (await request.json()) as { key?: string; deploymentId?: string }
		return json(await handleCancel({ ...payload, statusKey: statusKeyOf(request) }, env))
	}

	return Response.json({ error: 'Unknown operation' }, { status: 404 })
}
