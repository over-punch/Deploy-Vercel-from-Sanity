// Chooses how a blocked deploy is recovered — via your own site route, or by dispatching a workflow
import type { UnblockConfig } from '../types'
import { dispatchVersionBump } from './github'

/** What the Studio sends to a site endpoint, and what {@link requestUnblock} needs. */
export interface UnblockRequest {
	config: UnblockConfig
	/** Branch to bump — the branch of the blocked deployment. */
	ref: string
	/**
	 * Display name of the Sanity user who pressed the button, recorded in the
	 * commit message. Attribution only; the server does not trust it for access.
	 */
	requestedBy?: string
	/**
	 * The Studio's own Sanity session token, forwarded so the endpoint can verify
	 * the caller is a signed-in user of the project.
	 *
	 * Required by `endpoint` mode and unused by workflow-dispatch mode. Sanity does
	 * not always expose one — it is absent under cookie-based auth — which is why
	 * the caller must handle it being missing rather than sending `Bearer undefined`.
	 */
	studioToken?: string
}

/** Only https endpoints are called. An http endpoint would put the session token on the wire in clear. */
function assertSafeEndpoint(endpoint: string): URL {
	let parsed: URL
	try {
		parsed = new URL(endpoint)
	} catch {
		throw new Error(`The configured recovery endpoint is not a valid URL: "${endpoint}".`)
	}
	// localhost is exempt so the route can be developed against `next dev`.
	const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
	if (parsed.protocol !== 'https:' && !isLocal) {
		throw new Error('The recovery endpoint must be https — the Studio session token is sent with the request.')
	}
	return parsed
}

/**
 * Ask a site route to make the bump commit.
 *
 * The Studio holds no GitHub credential in this mode; it proves who the caller is
 * and the server decides whether to act.
 */
async function postToEndpoint(opts: UnblockRequest): Promise<void> {
	const { config, ref, requestedBy, studioToken } = opts
	const endpoint = assertSafeEndpoint(config.endpoint!)

	if (!studioToken) {
		// Sending the request anyway would fail at the server as an anonymous call and
		// report as a permissions problem, which is a misleading thing to show someone
		// who is in fact signed in.
		throw new Error(
			'Your Studio session token is not available, so the site cannot verify who you are. ' +
			'This happens under cookie-based login — sign out and back in, or ask a developer to deploy manually.',
		)
	}

	let res: Response
	try {
		res = await fetch(endpoint.toString(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${studioToken}`,
			},
			body: JSON.stringify({ ref, requestedBy }),
		})
	} catch {
		// A CORS rejection and an offline browser are indistinguishable here, and
		// CORS is much the likelier of the two during setup.
		throw new Error(
			`Could not reach ${endpoint.host}. Check the site is up and that the route allows requests from this Studio's origin.`,
		)
	}

	if (res.ok) return

	// The route is expected to answer { error } on failure; fall back to the status.
	let detail = ''
	try {
		const body = await res.json() as { error?: unknown }
		if (typeof body?.error === 'string') detail = body.error
	} catch {
		// Non-JSON body — an HTML error page from the platform, most likely.
	}

	throw new Error(detail || endpointErrorMessage(res.status, endpoint.host))
}

/** Turn an endpoint failure with no message of its own into something actionable. */
export function endpointErrorMessage(status: number, host: string): string {
	switch (status) {
		case 401:
			return 'The site did not accept your Studio session. Try signing out of the Studio and back in.'
		case 403:
			return 'Your Studio account is not permitted to trigger a deploy recovery.'
		case 404:
			return `No recovery route at ${host}. It may not be deployed yet — check the endpoint URL.`
		case 429:
			return 'A bump was requested very recently. Wait a moment before trying again.'
		default:
			return status >= 500
				? 'The site failed while making the bump commit. Check its function logs.'
				: `The site refused the request (${status}).`
	}
}

/**
 * Recover a blocked deployment, by whichever route is configured.
 *
 * Prefers `endpoint`, because that keeps every credential server-side; falls back
 * to dispatching a GitHub Actions workflow for setups with no server to host a
 * route.
 */
export async function requestUnblock(opts: UnblockRequest): Promise<void> {
	if (opts.config.endpoint) return postToEndpoint(opts)

	if (!opts.config.owner || !opts.config.repo) {
		throw new Error('Deploy recovery is misconfigured — set either `endpoint`, or `owner` and `repo`.')
	}
	return dispatchVersionBump({
		config: opts.config as UnblockConfig & { owner: string; repo: string },
		ref: opts.ref,
		requestedBy: opts.requestedBy,
	})
}
