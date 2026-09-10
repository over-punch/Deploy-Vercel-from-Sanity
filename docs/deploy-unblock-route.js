/** API route — makes an authorised version-bump commit so Vercel will build a branch it refused */
//
// Vercel will not build a commit whose git author is not a member of the Vercel
// team; it marks the deployment BLOCKED and compiles nothing. Re-firing the deploy
// hook cannot clear that, because the hook rebuilds the same HEAD. The only remedy
// is a fresh commit by an authorised author.
//
// The Studio cannot make one: its bundle is public, so any GitHub token compiled
// into it is readable from devtools, and a token able to push code is a token able
// to run code on the next build. So the Studio proves *who is asking* by forwarding
// its Sanity session token, and the single GitHub credential lives here, server-side,
// where the browser never sees it.
// Self-contained on purpose: this file is meant to be copied into your own repo,
// so it pulls in nothing beyond what Next.js already gives you.

/** Repository this route is allowed to commit to. */
const OWNER = 'your-org'
const REPO = 'your-site-repo'

/**
 * Branches this route will bump. Narrow by design — a signed-in Studio user of any
 * role can reach this, and bumping an arbitrary branch is not something the recovery
 * flow ever needs.
 */
const ALLOWED_REFS = ['main', 'staging']

/**
 * Studio origins permitted to call this route. The Studio is served from
 * <you>.sanity.studio, not this domain, so every request is cross-origin and the
 * preflight fails without an allow-list.
 */
const ALLOWED_ORIGINS = ['https://your-studio.sanity.studio', 'http://localhost:3333']

/**
 * Commit identity. The EMAIL is what GitHub attributes a commit by, and therefore
 * what decides whether Vercel builds it — the name alone is cosmetic.
 */
const COMMIT_AUTHOR = { name: 'Deploy Bot', email: 'deploy-bot@example.com' }

const GITHUB_API = 'https://api.github.com'
/** Max characters of caller-supplied attribution kept in the commit message. */
const MAX_REQUESTER_LENGTH = 60

/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Increment the patch component of a semver string.
 *
 * @param version - current version, e.g. "0.1.15"
 * @returns the next patch version, e.g. "0.1.16"
 */
function bumpPatch(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
	if (!match) throw new Error(`Cannot bump a non-semver version: "${version}"`)
	return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

/**
 * Replace only the top-level version string, leaving the rest of the file byte for byte.
 *
 * Round-tripping through JSON.parse/stringify would reformat the whole of
 * package.json and turn a one-line bump into a whole-file diff.
 *
 * @param source - the current package.json text
 * @param current - the version to replace
 * @param next - the version to write
 */
function replaceVersion(source, current, next) {
	const pattern = new RegExp(`("version"\\s*:\\s*)"${escapeRegExp(current)}"`)
	if (!pattern.test(source)) throw new Error('Could not locate the version field in package.json')
	return source.replace(pattern, `$1"${next}"`)
}

/** Call the GitHub API with the server-held token. */
async function github(path, token, init) {
	return fetch(`${GITHUB_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json',
			...init?.headers,
		},
	})
}

/**
 * Echo one allow-listed origin and answer the preflight.
 *
 * A wildcard is fine for public HTML but not for an endpoint that reads an
 * Authorization header, so the caller's origin is matched against the list rather
 * than reflected blindly.
 *
 * @returns true when the request was a preflight and has been answered
 */
function applyCors(req, res, allowedOrigins) {
	const origin = req.headers.origin
	if (origin && allowedOrigins.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin)
		res.setHeader('Vary', 'Origin')
		res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
	}
	if (req.method === 'OPTIONS') {
		res.status(204).end()
		return true
	}
	return false
}

/**
 * Verify the caller holds a valid Sanity session token for this project, and
 * answer 401 if not.
 *
 * A shared secret is the wrong alternative: the Studio bundle is public, so any
 * constant compiled into it is readable from devtools. A session token instead
 * proves a signed-in project user and gives a real identity to log.
 *
 * @returns the user, or null when a response has already been sent
 */
async function requireStudioUser(req, res, sanityProjectId) {
	const header = req.headers.authorization
	const token = typeof header === 'string' && header.startsWith('Bearer ')
		? header.slice(7)
		: null
	if (!token) {
		res.status(401).json({ error: 'Sign in to the Studio to use this.' })
		return null
	}

	let user
	try {
		const response = await fetch(
			`https://${sanityProjectId}.api.sanity.io/v2021-06-07/users/me`,
			{ headers: { Authorization: `Bearer ${token}` } },
		)
		user = response.ok ? await response.json() : null
	} catch (err) {
		console.error('Studio auth: lookup failed —', err?.message)
		res.status(502).json({ error: 'Could not verify your Studio session.' })
		return null
	}

	// Sanity answers 200 with a null id for an unauthenticated request rather than
	// 401, so checking response.ok alone would let anonymous callers straight through.
	if (!user?.id) {
		res.status(401).json({ error: 'Your Studio session was not accepted.' })
		return null
	}
	return user
}

export default async function handler(req, res) {
	if (applyCors(req, res, ALLOWED_ORIGINS)) return

	if (req.method !== 'POST') {
		res.setHeader('Allow', 'POST')
		return res.status(405).json({ error: 'Method not allowed' })
	}

	const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
	if (!projectId) {
		console.error('Deploy unblock: no Sanity project id configured, cannot verify the caller')
		return res.status(500).json({ error: 'The recovery route is not configured.' })
	}

	// Proves the caller is a signed-in user of this Sanity project. No role filter:
	// anyone who can open the Deploy tool can already trigger a build with the Deploy
	// button, so this grants no power they lack — it only makes the build succeed.
	const user = await requireStudioUser(req, res, projectId)
	if (!user) return // requireStudioUser has already answered 401/403.

	const token = process.env.DEPLOY_COMMIT_TOKEN
	if (!token) {
		console.error('Deploy unblock: DEPLOY_COMMIT_TOKEN is not set')
		return res.status(500).json({ error: 'No deploy credential is configured on the site.' })
	}

	const { ref, requestedBy } = req.body ?? {}
	if (!ALLOWED_REFS.includes(ref)) {
		return res.status(400).json({ error: `Refusing to bump "${ref}". Allowed branches: ${ALLOWED_REFS.join(', ')}.` })
	}

	// Attribution only, and never trusted for access. Newlines are stripped because
	// they would otherwise split the commit message into a spurious body.
	const requester = String(requestedBy ?? user.name ?? user.email ?? 'a Studio user')
		.replace(/[\r\n]+/g, ' ')
		.trim()
		.slice(0, MAX_REQUESTER_LENGTH) || 'a Studio user'

	try {
		const readRes = await github(`/repos/${OWNER}/${REPO}/contents/package.json?ref=${encodeURIComponent(ref)}`, token)
		if (!readRes.ok) {
			console.error('Deploy unblock: could not read package.json —', readRes.status)
			return res.status(502).json({
				error: readRes.status === 404
					? `Could not find package.json on "${ref}".`
					: 'Could not read the current version from GitHub.',
			})
		}

		const file = await readRes.json()
		const source = Buffer.from(file.content, 'base64').toString('utf8')
		const current = JSON.parse(source).version
		const next = bumpPatch(current)

		const writeRes = await github(`/repos/${OWNER}/${REPO}/contents/package.json`, token, {
			method: 'PUT',
			body: JSON.stringify({
				message: `v${next}\n\nVersion bump to unblock deployment, requested by ${requester} from the Sanity Studio.`,
				content: Buffer.from(replaceVersion(source, current, next), 'utf8').toString('base64'),
				// Guards against two people bumping at once: GitHub rejects a stale blob sha.
				sha: file.sha,
				branch: ref,
				author: COMMIT_AUTHOR,
				committer: COMMIT_AUTHOR,
			}),
		})

		if (!writeRes.ok) {
			console.error('Deploy unblock: commit failed —', writeRes.status)
			if (writeRes.status === 409) {
				return res.status(409).json({ error: 'Someone else just bumped this branch. Reload to see the new deploy.' })
			}
			return res.status(502).json({
				error: writeRes.status === 403
					? 'The site deploy credential is not allowed to write to this repository.'
					: 'GitHub refused the version-bump commit.',
			})
		}

		const committed = await writeRes.json()
		console.warn(`Deploy unblock: v${next} committed to ${ref} for ${requester} (${user.id})`)
		return res.status(200).json({ version: next, ref, commit: committed?.commit?.sha })
	} catch (err) {
		// Never surface err.message — it can carry request URLs and token fragments.
		console.error('Deploy unblock: unexpected failure —', err?.message)
		return res.status(500).json({ error: 'The version bump failed. Check the site function logs.' })
	}
}
