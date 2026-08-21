// The proxy holds the Vercel token, so these handlers are the package's security boundary
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	envFromProcess,
	handleCancel,
	handleDeployRequest,
	handleDeployments,
	handleEvents,
	type ProxyEnv,
} from '../proxy/core'

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_abc/hook123'

/** A proxy configured with one target, as a correct setup would be. */
function makeEnv(overrides: Partial<ProxyEnv> = {}): ProxyEnv {
	return {
		vercelToken: 'tok_test',
		hooks: { production: HOOK },
		projects: { production: { projectId: 'prj_abc', hookId: 'hook123' } },
		statusKey: 'sk_correct',
		...overrides,
	}
}

/** Record every outbound call so tests can assert what the proxy actually sent. */
let calls: Array<{ url: string; init?: RequestInit }>

/** Queue a scripted sequence of fetch responses. */
function mockFetch(responses: Array<{ ok?: boolean; status?: number; body?: unknown }>) {
	let i = 0
	vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), init })
		const r = responses[Math.min(i++, responses.length - 1)] ?? {}
		return {
			ok: r.ok ?? true,
			status: r.status ?? 200,
			json: async () => r.body ?? {},
		} as Response
	}))
}

beforeEach(() => { calls = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe('status key', () => {
	it('fails closed when the key is not configured', async () => {
		// An unset key previously served everyone — including the cancel endpoint.
		mockFetch([{}])
		const res = await handleDeployments({ key: 'production', statusKey: null }, makeEnv({ statusKey: undefined }))
		expect(res.status).toBe(500)
		expect(calls).toHaveLength(0)
	})

	it('fails closed on an empty-string key, which is how .env.example ships it', async () => {
		mockFetch([{}])
		const res = await handleDeployments({ key: 'production', statusKey: '' }, makeEnv({ statusKey: '' }))
		expect(res.status).toBe(500)
	})

	it('rejects a wrong key without calling Vercel', async () => {
		mockFetch([{}])
		const res = await handleDeployments({ key: 'production', statusKey: 'sk_wrong' }, makeEnv())
		expect(res.status).toBe(401)
		expect(calls).toHaveLength(0)
	})

	it('gates cancel, not just reads', async () => {
		mockFetch([{}])
		const res = await handleCancel({ key: 'production', deploymentId: 'dpl_1', statusKey: 'sk_wrong' }, makeEnv())
		expect(res.status).toBe(401)
		expect(calls).toHaveLength(0)
	})
})

describe('deployment scoping', () => {
	it('allows a deployment that belongs to the target project', async () => {
		mockFetch([
			{ body: { projectId: 'prj_abc' } },   // ownership check
			{ body: { events: [] } },             // the actual call
		])
		const res = await handleEvents({ key: 'production', deploymentId: 'dpl_1', statusKey: 'sk_correct' }, makeEnv())
		expect(res.status).toBe(200)
	})

	it('refuses a deployment from another project, and never performs the action', async () => {
		// Without this the status key — public by construction — could read logs for
		// and cancel any deployment the proxy token could see.
		mockFetch([{ body: { projectId: 'prj_someone_else' } }])
		const res = await handleCancel({ key: 'production', deploymentId: 'dpl_x', statusKey: 'sk_correct' }, makeEnv())
		expect(res.status).toBe(403)
		expect(calls).toHaveLength(1) // ownership check only; no cancel issued
	})

	it('fails loudly rather than silently if Vercel stops returning projectId', async () => {
		mockFetch([{ body: {} }])
		const res = await handleEvents({ key: 'production', deploymentId: 'dpl_1', statusKey: 'sk_correct' }, makeEnv())
		expect(res.status).toBe(502)
	})

	it('distinguishes a bad token from a missing deployment', async () => {
		// Collapsing these into 404 made a revoked token look like a UI bug.
		mockFetch([{ ok: false, status: 401 }])
		expect((await handleEvents({ key: 'production', deploymentId: 'd', statusKey: 'sk_correct' }, makeEnv())).status).toBe(502)

		calls = []
		mockFetch([{ ok: false, status: 429 }])
		expect((await handleEvents({ key: 'production', deploymentId: 'd', statusKey: 'sk_correct' }, makeEnv())).status).toBe(429)

		calls = []
		mockFetch([{ ok: false, status: 404 }])
		expect((await handleEvents({ key: 'production', deploymentId: 'd', statusKey: 'sk_correct' }, makeEnv())).status).toBe(404)
	})

	it('cannot be tricked into a different team by smuggling a query param', async () => {
		mockFetch([{ body: { projectId: 'prj_abc' } }, { body: { events: [] } }])
		await handleEvents(
			{ key: 'production', deploymentId: 'dpl_1?teamId=other_team', statusKey: 'sk_correct' },
			makeEnv({ projects: { production: { projectId: 'prj_abc', hookId: 'h', teamId: 'team_ours' } } }),
		)
		// The '?' must be encoded, so it stays part of the id rather than becoming a parameter.
		expect(calls[0].url).toContain('dpl_1%3FteamId%3Dother_team')
		expect(calls[0].url).toContain('teamId=team_ours')
	})
})

describe('build logs', () => {
	it('asks for the newest events, so a failed build shows its error', async () => {
		mockFetch([{ body: { projectId: 'prj_abc' } }, { body: { events: [{ text: 'boom' }] } }])
		await handleEvents({ key: 'production', deploymentId: 'dpl_1', statusKey: 'sk_correct' }, makeEnv())
		expect(calls[1].url).toContain('direction=backward')
	})

	it('tolerates both the bare-array and wrapped response shapes', async () => {
		mockFetch([{ body: { projectId: 'prj_abc' } }, { body: [{ text: 'a' }] }])
		const bare = await handleEvents({ key: 'production', deploymentId: 'd', statusKey: 'sk_correct' }, makeEnv())
		expect((bare.body as { events: unknown[] }).events).toHaveLength(1)

		calls = []
		mockFetch([{ body: { projectId: 'prj_abc' } }, { body: { events: [{ text: 'a' }, { text: 'b' }] } }])
		const wrapped = await handleEvents({ key: 'production', deploymentId: 'd', statusKey: 'sk_correct' }, makeEnv())
		expect((wrapped.body as { events: unknown[] }).events).toHaveLength(2)
	})
})

describe('deploy requests', () => {
	it('POSTs the configured hook and nothing else', async () => {
		mockFetch([{}])
		const res = await handleDeployRequest({ proxyKey: 'production' }, makeEnv())
		expect(res.status).toBe(200)
		expect(calls[0].url).toBe(HOOK)
		expect(calls[0].init?.method).toBe('POST')
	})

	it('matches proxy keys case-insensitively, as documented', async () => {
		mockFetch([{}])
		const res = await handleDeployRequest({ proxyKey: '  Production  ' }, makeEnv())
		expect(res.status).toBe(200)
	})

	it('refuses a request with no key, and an unknown key', async () => {
		mockFetch([{}])
		expect((await handleDeployRequest({}, makeEnv())).status).toBe(400)
		expect((await handleDeployRequest({ proxyKey: 'nope' }, makeEnv())).status).toBe(404)
		expect(calls).toHaveLength(0)
	})

	it('refuses to POST anything that is not a Vercel deploy hook', async () => {
		// The hook comes from the proxy's own env, but a typo must not become SSRF.
		mockFetch([{}])
		const res = await handleDeployRequest({ proxyKey: 'production' }, makeEnv({
			hooks: { production: 'https://evil.example.com/webhook' },
		}))
		expect(res.status).toBe(500)
		expect(calls).toHaveLength(0)
	})

	it('reports a hook that Vercel rejects', async () => {
		mockFetch([{ ok: false, status: 410 }])
		const res = await handleDeployRequest({ proxyKey: 'production' }, makeEnv())
		expect(res.status).toBe(502)
	})
})

describe('role gating', () => {
	const roleEnv = makeEnv({
		allowedRoles: ['administrator'],
		sanity: { projectId: 'p1', dataset: 'production', readToken: 'tok' },
	})

	it('permits a user holding an allowed role', async () => {
		mockFetch([
			{ body: [{ userId: 'u1', roles: [{ name: 'administrator' }] }] }, // ACL lookup
			{},                                                               // hook POST
		])
		const res = await handleDeployRequest({ proxyKey: 'production', _createdBy: 'u1' }, roleEnv)
		expect(res.status).toBe(200)
	})

	it('refuses a user without one, and does not deploy', async () => {
		mockFetch([{ body: [{ userId: 'u1', roles: [{ name: 'viewer' }] }] }])
		const res = await handleDeployRequest({ proxyKey: 'production', _createdBy: 'u1' }, roleEnv)
		expect(res.status).toBe(403)
		expect(calls).toHaveLength(1) // ACL lookup only
	})

	it('refuses a payload with no creator, which the client cannot forge anyway', async () => {
		mockFetch([{}])
		const res = await handleDeployRequest({ proxyKey: 'production' }, roleEnv)
		expect(res.status).toBe(403)
	})
})

describe('envFromProcess', () => {
	it('pairs hooks with projects and lowercases the keys', () => {
		const env = envFromProcess({
			VERCEL_API_TOKEN: 'tok',
			VERCEL_DEPLOY_HOOK_PRODUCTION: HOOK,
			VERCEL_DEPLOY_PROJECT_PRODUCTION: 'prj_abc:hook123:team_x',
			VERCEL_DEPLOY_STATUS_KEY: 'sk',
		})
		expect(env.hooks.production).toBe(HOOK)
		expect(env.projects.production).toEqual({ projectId: 'prj_abc', hookId: 'hook123', teamId: 'team_x' })
		expect(env.statusKey).toBe('sk')
	})

	it('leaves teamId undefined when the third segment is omitted', () => {
		const env = envFromProcess({ VERCEL_DEPLOY_PROJECT_STAGING: 'prj_x:hook_y' })
		expect(env.projects.staging.teamId).toBeUndefined()
	})

	it('treats an empty allowed-roles list as unset', () => {
		expect(envFromProcess({ VERCEL_DEPLOY_ALLOWED_ROLES: '' }).allowedRoles).toBeUndefined()
		expect(envFromProcess({ VERCEL_DEPLOY_ALLOWED_ROLES: 'administrator, editor' }).allowedRoles)
			.toEqual(['administrator', 'editor'])
	})
})
