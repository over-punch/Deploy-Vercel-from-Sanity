// A card filtered only by deploy hook reports its own button presses, not what is live
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listDeployments } from '../src/lib/api'
import { fetchDeployments } from '../src/lib/transport'
import { handleDeployments } from '../proxy/core'

function mockFetch(body: unknown = { deployments: [] }) {
	const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
	vi.stubGlobal('fetch', fn)
	return fn
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const BASE = { projectId: 'prj_1', hookId: 'hook_1', token: 't' }

describe('listDeployments filtering', () => {
	it('filters by branch when one is known', async () => {
		const f = mockFetch()
		await listDeployments({ ...BASE, branch: 'staging' })
		const url = f.mock.calls[0][0] as string
		expect(url).toContain('meta-githubCommitRef=staging')
		// The hook filter must be gone, not merely joined by it — together they would
		// exclude every git-push deployment again, which is the bug being fixed.
		expect(url).not.toContain('meta-deployHookId')
	})

	it('falls back to the hook filter before the branch is known', async () => {
		const f = mockFetch()
		await listDeployments(BASE)
		const url = f.mock.calls[0][0] as string
		expect(url).toContain('meta-deployHookId=hook_1')
		expect(url).not.toContain('meta-githubCommitRef')
	})

	it('encodes a branch containing a slash', async () => {
		const f = mockFetch()
		await listDeployments({ ...BASE, branch: 'release/2026-01' })
		expect(f.mock.calls[0][0]).toContain('meta-githubCommitRef=release%2F2026-01')
	})
})

describe('fetchDeployments transport', () => {
	it('passes the branch through in direct mode', async () => {
		const f = mockFetch()
		await fetchDeployments(
			{ mode: 'direct', token: 't' },
			{ projectId: 'prj_1', hookId: 'hook_1' },
			undefined,
			'main',
		)
		expect(f.mock.calls[0][0]).toContain('meta-githubCommitRef=main')
	})

	it('sends the branch to the proxy as a query parameter', async () => {
		const f = mockFetch()
		await fetchDeployments(
			{ mode: 'proxy', proxyUrl: 'https://x.com/api', statusKey: 'k' },
			{ proxyKey: 'production' },
			10,
			'main',
		)
		expect(f.mock.calls[0][0]).toContain('branch=main')
	})

	it('omits the branch when absent, so an older proxy behaves as before', async () => {
		const f = mockFetch()
		await fetchDeployments(
			{ mode: 'proxy', proxyUrl: 'https://x.com/api', statusKey: 'k' },
			{ proxyKey: 'production' },
		)
		expect(f.mock.calls[0][0]).not.toContain('branch=')
	})
})

describe('proxy handleDeployments', () => {
	const env = {
		vercelToken: 'vt',
		hooks: {},
		projects: { production: { projectId: 'prj_1', hookId: 'hook_1' } },
		statusKey: 'sk',
	}

	it('filters by branch when given a valid one', async () => {
		const f = mockFetch()
		await handleDeployments({ key: 'production', statusKey: 'sk', branch: 'staging' }, env)
		const url = f.mock.calls[0][0] as string
		expect(url).toContain('meta-githubCommitRef=staging')
		expect(url).not.toContain('meta-deployHookId')
	})

	it('ignores a branch that is not a plausible git ref rather than forwarding it', async () => {
		const f = mockFetch()
		await handleDeployments({ key: 'production', statusKey: 'sk', branch: 'a b;rm -rf' }, env)
		const url = f.mock.calls[0][0] as string
		expect(url).toContain('meta-deployHookId=hook_1')
		expect(url).not.toContain('meta-githubCommitRef')
	})

	it('keeps hook filtering when no branch is supplied', async () => {
		const f = mockFetch()
		await handleDeployments({ key: 'production', statusKey: 'sk' }, env)
		expect(f.mock.calls[0][0]).toContain('meta-deployHookId=hook_1')
	})
})
