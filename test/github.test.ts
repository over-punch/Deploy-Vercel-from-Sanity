// The dispatch token ships in a public Studio bundle, so path building is treated as untrusted input
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchVersionBump, dispatchErrorMessage, DEFAULT_WORKFLOW } from '../src/lib/github'
import { stateLabel } from '../src/lib/helpers'
import { resolveConfig } from '../src/config'
import type { UnblockConfig } from '../src/types'

const CONFIG: UnblockConfig = {
	token: 'ghp_test',
	owner: 'Liiift-Studio',
	repo: 'the-designers-foundry',
}

/** Stub fetch, returning 204 (GitHub's success for a dispatch) unless told otherwise. */
function mockFetch(status = 204) {
	const fn = vi.fn().mockResolvedValue({ status })
	vi.stubGlobal('fetch', fn)
	return fn
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('dispatchVersionBump', () => {
	it('posts to the workflow dispatch endpoint with the branch as ref', async () => {
		const fetchMock = mockFetch()
		await dispatchVersionBump({ config: CONFIG, ref: 'staging', requestedBy: 'Jane' })

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(
			`https://api.github.com/repos/Liiift-Studio/the-designers-foundry/actions/workflows/${DEFAULT_WORKFLOW}/dispatches`,
		)
		expect(init.method).toBe('POST')
		expect(init.headers.Authorization).toBe('Bearer ghp_test')
		expect(JSON.parse(init.body)).toEqual({ ref: 'staging', inputs: { requested_by: 'Jane' } })
	})

	it('accepts branch names containing slashes', async () => {
		const fetchMock = mockFetch()
		await dispatchVersionBump({ config: CONFIG, ref: 'release/2026-01' })
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).ref).toBe('release/2026-01')
	})

	it('honours a custom workflow filename', async () => {
		const fetchMock = mockFetch()
		await dispatchVersionBump({ config: { ...CONFIG, workflow: 'unblock.yaml' }, ref: 'main' })
		expect(fetchMock.mock.calls[0][0]).toContain('/workflows/unblock.yaml/dispatches')
	})

	it('caps the attribution string rather than sending unbounded browser input', async () => {
		const fetchMock = mockFetch()
		await dispatchVersionBump({ config: CONFIG, ref: 'main', requestedBy: 'x'.repeat(500) })
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).inputs.requested_by).toHaveLength(80)
	})

	it('refuses path segments that would redirect the authenticated request', async () => {
		const fetchMock = mockFetch()
		const bad = [
			{ ...CONFIG, owner: '../../evil' },
			{ ...CONFIG, repo: 'repo/../../other' },
			{ ...CONFIG, workflow: '../secrets.yml' },
		]
		for (const config of bad) {
			await expect(dispatchVersionBump({ config, ref: 'main' })).rejects.toThrow(/Invalid/)
		}
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('refuses refs git itself would reject, and traversal attempts', async () => {
		const fetchMock = mockFetch()
		for (const ref of ['', '../main', 'a//b', '/main', 'main/', '-main', 'main.lock', 'ref with space', 'a'.repeat(256)]) {
			await expect(dispatchVersionBump({ config: CONFIG, ref })).rejects.toThrow(/Invalid branch/)
		}
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('does not call GitHub when no token is configured', async () => {
		const fetchMock = mockFetch()
		await expect(
			dispatchVersionBump({ config: { ...CONFIG, token: undefined }, ref: 'main' }),
		).rejects.toThrow(/No GitHub token/)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('treats any non-204 response as a failure, including 200', async () => {
		mockFetch(200)
		await expect(dispatchVersionBump({ config: CONFIG, ref: 'main' })).rejects.toThrow(/GitHub 200/)
	})

	it('surfaces the status code alongside the explanation', async () => {
		mockFetch(403)
		await expect(dispatchVersionBump({ config: CONFIG, ref: 'main' })).rejects.toThrow(/Actions: write.*GitHub 403/s)
	})
})

describe('dispatchErrorMessage', () => {
	it('names both causes of a 404, since GitHub does not distinguish them', () => {
		const message = dispatchErrorMessage(404, 'version-bump.yml', 'staging')
		expect(message).toContain('default branch')
		expect(message).toContain('staging')
		expect(message).toContain('cannot see this repository')
	})

	it('reports auth and permission failures separately', () => {
		expect(dispatchErrorMessage(401, 'w.yml', 'main')).toMatch(/invalid or expired/)
		expect(dispatchErrorMessage(403, 'w.yml', 'main')).toMatch(/Actions: write/)
	})

	it('treats 5xx as transient', () => {
		expect(dispatchErrorMessage(503, 'w.yml', 'main')).toMatch(/Try again/)
	})
})

describe('BLOCKED state', () => {
	it('is labelled distinctly rather than falling through to Unknown', () => {
		// The regression this guards: an unhandled state rendered as "Unknown" with a
		// neutral tone, which is why author-blocked deploys looked like nothing at all.
		expect(stateLabel('BLOCKED')).toEqual({ label: 'Blocked', tone: 'critical' })
		expect(stateLabel(undefined)).toEqual({ label: 'Unknown', tone: 'default' })
	})
})

describe('resolveConfig — unblock', () => {
	it('drops an unblock config with no token, so no dead button is rendered', () => {
		expect(resolveConfig({ unblock: { owner: 'o', repo: 'r' } }).unblock).toBeUndefined()
	})

	it('drops an unblock config missing owner or repo', () => {
		expect(resolveConfig({ unblock: { token: 't', owner: '', repo: 'r' } }).unblock).toBeUndefined()
		expect(resolveConfig({ unblock: { token: 't', owner: 'o', repo: '' } }).unblock).toBeUndefined()
	})

	it('keeps a complete unblock config', () => {
		const unblock = { token: 't', owner: 'o', repo: 'r' }
		expect(resolveConfig({ unblock }).unblock).toEqual(unblock)
	})

	it('leaves unblock unset when the plugin is configured without it', () => {
		expect(resolveConfig({}).unblock).toBeUndefined()
		expect(resolveConfig().unblock).toBeUndefined()
	})
})
