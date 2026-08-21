// URL validators guard every anchor the plugin renders and everything it copies to the clipboard
import { describe, expect, it } from 'vitest'
import {
	safeHref,
	deploymentHref,
	parseHookUrl,
	isActiveState,
	githubCommitHref,
	shortSha,
} from '../src/lib/helpers'

describe('safeHref', () => {
	it('allows http and https', () => {
		expect(safeHref('https://example.com/x')).toBe('https://example.com/x')
		expect(safeHref('http://example.com')).toBe('http://example.com')
	})

	it('rejects script-bearing schemes, including obfuscated ones', () => {
		// WHATWG URL strips leading control characters and whitespace before the
		// protocol, so these all normalise to javascript: and must still be refused.
		for (const url of [
			'javascript:alert(1)',
			'JaVaScRiPt:alert(1)',
			'\tjavascript:alert(1)',
			'\njavascript:alert(1)',
			' javascript:alert(1)',
			'data:text/html,<script>alert(1)</script>',
			'vbscript:msgbox(1)',
			'file:///etc/passwd',
		]) {
			expect(safeHref(url), url).toBeUndefined()
		}
	})

	it('rejects unparseable input and nothing', () => {
		expect(safeHref('not a url')).toBeUndefined()
		expect(safeHref('')).toBeUndefined()
		expect(safeHref(undefined)).toBeUndefined()
	})
})

describe('deploymentHref', () => {
	it('builds an https URL from a bare hostname', () => {
		expect(deploymentHref('my-app-abc123.vercel.app')).toBe('https://my-app-abc123.vercel.app')
	})

	it('refuses hosts that would redirect the origin', () => {
		// The API returns a bare host, so concatenating https:// fixes only the
		// scheme — '@evil.com' would otherwise yield https://@evil.com, which
		// navigates to evil.com with the intended host as credentials.
		for (const host of [
			'@evil.com',
			'user:pass@evil.com',
			'evil.com/path',
			'evil.com:8080',
			'evil.com?x=1',
			'evil.com#f',
			'//evil.com',
			'https://evil.com',
			'javascript:alert(1)',
		]) {
			expect(deploymentHref(host), host).toBeUndefined()
		}
	})

	it('rejects nothing', () => {
		expect(deploymentHref(undefined)).toBeUndefined()
		expect(deploymentHref('')).toBeUndefined()
	})
})

describe('parseHookUrl', () => {
	it('extracts the project and hook ids', () => {
		expect(parseHookUrl('https://api.vercel.com/v1/integrations/deploy/prj_abc/hook123'))
			.toEqual({ projectId: 'prj_abc', hookId: 'hook123' })
	})

	it('returns empties rather than throwing when a target has no hook URL', () => {
		// Proxy-mode targets deliberately have no URL.
		expect(parseHookUrl(undefined)).toEqual({ projectId: '', hookId: '' })
		expect(parseHookUrl('')).toEqual({ projectId: '', hookId: '' })
		expect(parseHookUrl('nonsense')).toEqual({ projectId: '', hookId: '' })
	})
})

describe('isActiveState', () => {
	it('treats in-progress states as active', () => {
		expect(isActiveState('BUILDING')).toBe(true)
		expect(isActiveState('QUEUED')).toBe(true)
	})

	it('treats terminal states and absence as inactive', () => {
		expect(isActiveState('READY')).toBe(false)
		expect(isActiveState('ERROR')).toBe(false)
		expect(isActiveState('CANCELED')).toBe(false)
		expect(isActiveState(undefined)).toBe(false)
	})
})

describe('githubCommitHref', () => {
	it('builds a commit URL when repo metadata is present', () => {
		expect(githubCommitHref({ githubRepo: 'acme/site', githubOrg: 'acme', githubCommitSha: 'deadbeef' }))
			.toContain('deadbeef')
	})

	it('returns nothing without metadata', () => {
		expect(githubCommitHref(undefined)).toBeFalsy()
		expect(githubCommitHref({})).toBeFalsy()
	})
})

describe('shortSha', () => {
	it('truncates to seven characters', () => {
		expect(shortSha('0123456789abcdef')).toBe('0123456')
		expect(shortSha(undefined)).toBe('')
	})
})
