// Dispatches the version-bump workflow that unblocks an author-gated Vercel deploy
import type { UnblockConfig } from '../types'

const GITHUB_API = 'https://api.github.com'

/** Default workflow filename, overridable via {@link UnblockConfig.workflow}. */
export const DEFAULT_WORKFLOW = 'version-bump.yml'

/**
 * Owner, repo and workflow filename are spliced into the request path, so each is
 * held to the characters GitHub actually permits. Without this a value carrying
 * `/` or `..` would redirect an authenticated request at a different endpoint.
 */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/

/**
 * Branch names may contain `/` (`release/2025-01`), so they are checked separately
 * and against git's own rules rather than reused from {@link SEGMENT_RE}.
 */
const REF_RE = /^[A-Za-z0-9._\-/]+$/

/**
 * Reject the ref shapes git itself forbids, plus the ones that would be unsafe in
 * a URL. Checked before encoding because a traversal segment survives encoding as
 * a path segment on some proxies.
 */
function isValidRef(ref: string): boolean {
	if (!ref || ref.length > 255) return false
	if (!REF_RE.test(ref)) return false
	if (ref.includes('..') || ref.includes('//')) return false
	if (ref.startsWith('/') || ref.endsWith('/')) return false
	if (ref.startsWith('-') || ref.endsWith('.lock')) return false
	return true
}

/** Everything {@link dispatchVersionBump} needs to identify and authorise the call. */
export interface DispatchOptions {
	config: UnblockConfig
	/** Branch to bump — the branch of the blocked deployment. */
	ref: string
	/**
	 * Display name of the Sanity user who pressed the button, recorded in the
	 * commit message.
	 *
	 * Attribution only, not authorisation: it comes from the browser and the
	 * workflow cannot verify it. The workflow sanitises it before use.
	 */
	requestedBy?: string
}

/**
 * Ask GitHub to run the version-bump workflow on `ref`.
 *
 * Returns once GitHub has accepted the dispatch, which is *before* the workflow
 * has run — the resulting commit, and the deployment it triggers, land a minute
 * or two later. Callers should say so rather than implying the deploy is done.
 *
 * @throws Error with a message written for an editor, not an API consumer.
 */
export async function dispatchVersionBump(opts: DispatchOptions): Promise<void> {
	const { config, ref, requestedBy } = opts
	const workflow = config.workflow ?? DEFAULT_WORKFLOW

	if (!config.token) throw new Error('No GitHub token is configured for deploy recovery.')
	if (!SEGMENT_RE.test(config.owner)) throw new Error(`Invalid repository owner "${config.owner}".`)
	if (!SEGMENT_RE.test(config.repo)) throw new Error(`Invalid repository name "${config.repo}".`)
	if (!SEGMENT_RE.test(workflow)) throw new Error(`Invalid workflow filename "${workflow}".`)
	if (!isValidRef(ref)) throw new Error(`Invalid branch name "${ref}".`)

	const path = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}` +
		`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`

	const res = await fetch(`${GITHUB_API}${path}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			ref,
			// Workflow inputs are strings; anything else is rejected with a 422.
			inputs: { requested_by: (requestedBy ?? 'a Studio user').slice(0, 80) },
		}),
	})

	// A successful dispatch is 204 with an empty body — there is nothing to parse.
	if (res.status === 204) return

	throw new Error(`${dispatchErrorMessage(res.status, workflow, ref)} (GitHub ${res.status})`)
}

/**
 * Turn a dispatch failure into something an editor can act on.
 *
 * GitHub answers "no such workflow" and "your token cannot see this repository"
 * with the same 404, deliberately, so that case names both possibilities rather
 * than guessing at one.
 */
export function dispatchErrorMessage(status: number, workflow: string, ref: string): string {
	switch (status) {
		case 401:
			return 'The GitHub token is invalid or expired. Ask a developer to reissue it.'
		case 403:
			return 'The GitHub token is not allowed to run workflows on this repository. It needs Actions: write.'
		case 404:
			return `GitHub could not find "${workflow}". It must exist on the repository's default branch as well as on "${ref}" — or the token cannot see this repository.`
		case 422:
			return `GitHub rejected the request: branch "${ref}" may not exist, or "${workflow}" has no workflow_dispatch trigger.`
		case 429:
			return 'GitHub rate limit reached. Wait a minute and try again.'
		default:
			return status >= 500
				? 'GitHub is having problems. Try again shortly.'
				: 'The version bump could not be started.'
	}
}
