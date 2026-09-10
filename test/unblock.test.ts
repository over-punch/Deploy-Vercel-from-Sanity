// Endpoint mode carries a session token, so its failure modes must not be silent or misleading
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestUnblock, endpointErrorMessage } from '../src/lib/unblock'
import { resolveConfig } from '../src/config'
import type { UnblockConfig } from '../src/types'

const ENDPOINT: UnblockConfig = { endpoint: 'https://example.com/api/deploy-unblock' }
const DISPATCH: UnblockConfig = { token: 'ghp_test', owner: 'acme', repo: 'site' }

/** Stub fetch with a Response-like object. */
function mockFetch(init: { ok?: boolean; status?: number; body?: unknown } = {}) {
	const fn = vi.fn().mockResolvedValue({
		ok: init.ok ?? true,
		status: init.status ?? 200,
		json: async () => init.body ?? {},
	})
	vi.stubGlobal('fetch', fn)
	return fn
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('requestUnblock — endpoint mode', () => {
	it('posts the branch and forwards the Studio token as a bearer credential', async () => {
		const fetchMock = mockFetch()
		await requestUnblock({ config: ENDPOINT, ref: 'staging', requestedBy: 'Jane', studioToken: 'sk_abc' })

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('https://example.com/api/deploy-unblock')
		expect(init.method).toBe('POST')
		expect(init.headers.Authorization).toBe('Bearer sk_abc')
		expect(JSON.parse(init.body)).toEqual({ ref: 'staging', requestedBy: 'Jane' })
	})

	it('never sends a request without a session token', async () => {
		// Sending anyway would reach the server as an anonymous call and be reported as
		// a permissions problem — misleading for someone who is in fact signed in.
		const fetchMock = mockFetch()
		await expect(
			requestUnblock({ config: ENDPOINT, ref: 'staging' }),
		).rejects.toThrow(/session token is not available/)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('refuses a plaintext endpoint, which would put the token on the wire', async () => {
		const fetchMock = mockFetch()
		await expect(
			requestUnblock({ config: { endpoint: 'http://example.com/x' }, ref: 'main', studioToken: 't' }),
		).rejects.toThrow(/must be https/)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('allows http on localhost so the route can be developed locally', async () => {
		const fetchMock = mockFetch()
		await requestUnblock({ config: { endpoint: 'http://localhost:3000/api/x' }, ref: 'main', studioToken: 't' })
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('rejects a malformed endpoint URL', async () => {
		await expect(
			requestUnblock({ config: { endpoint: 'not a url' }, ref: 'main', studioToken: 't' }),
		).rejects.toThrow(/not a valid URL/)
	})

	it('prefers the message the route supplies over a generic one', async () => {
		mockFetch({ ok: false, status: 403, body: { error: 'Editors cannot bump production.' } })
		await expect(
			requestUnblock({ config: ENDPOINT, ref: 'main', studioToken: 't' }),
		).rejects.toThrow('Editors cannot bump production.')
	})

	it('falls back to a status-derived message when the body is not JSON', async () => {
		const fn = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => { throw new Error('not json') },
		})
		vi.stubGlobal('fetch', fn)
		await expect(
			requestUnblock({ config: ENDPOINT, ref: 'main', studioToken: 't' }),
		).rejects.toThrow(/function logs/)
	})

	it('explains an unreachable host in terms of CORS, the likelier setup failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
		await expect(
			requestUnblock({ config: ENDPOINT, ref: 'main', studioToken: 't' }),
		).rejects.toThrow(/origin/)
	})
})

describe('requestUnblock — mode selection', () => {
	it('uses the endpoint when both it and a GitHub token are configured', async () => {
		const fetchMock = mockFetch()
		await requestUnblock({
			config: { ...ENDPOINT, ...DISPATCH },
			ref: 'main',
			studioToken: 't',
		})
		// Endpoint host, not api.github.com.
		expect(fetchMock.mock.calls[0][0]).toContain('example.com')
	})

	it('falls back to workflow dispatch when no endpoint is set', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ status: 204 })
		vi.stubGlobal('fetch', fetchMock)
		await requestUnblock({ config: DISPATCH, ref: 'main' })
		expect(fetchMock.mock.calls[0][0]).toContain('api.github.com')
	})

	it('reports a config with neither an endpoint nor a repo', async () => {
		await expect(
			requestUnblock({ config: { token: 'ghp' }, ref: 'main' }),
		).rejects.toThrow(/set either `endpoint`, or `owner` and `repo`/)
	})
})

describe('endpointErrorMessage', () => {
	it('distinguishes a rejected session from a forbidden user', () => {
		expect(endpointErrorMessage(401, 'x.com')).toMatch(/signing out/)
		expect(endpointErrorMessage(403, 'x.com')).toMatch(/not permitted/)
	})

	it('points a 404 at deployment rather than at permissions', () => {
		expect(endpointErrorMessage(404, 'x.com')).toMatch(/may not be deployed yet/)
	})
})

describe('resolveConfig — endpoint mode', () => {
	it('keeps an endpoint-only config, which needs no GitHub token', () => {
		expect(resolveConfig({ unblock: ENDPOINT }).unblock).toEqual(ENDPOINT)
	})

	it('still requires token, owner and repo together for dispatch mode', () => {
		expect(resolveConfig({ unblock: { token: 't', owner: 'o' } }).unblock).toBeUndefined()
		expect(resolveConfig({ unblock: DISPATCH }).unblock).toEqual(DISPATCH)
	})
})
