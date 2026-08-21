// The resolution helpers decide whether a Studio gets Sanity's components or the local fallbacks
import { describe, expect, it } from 'vitest'
import { resolveComponent, resolveFunction, resolveRecord } from '../src/compat/resolve'

/** A namespace shaped like the ones @sanity/ui and @sanity/icons expose. */
const ns = {
	fn: () => 'called',
	forwardRefLike: { $$typeof: Symbol.for('react.forward_ref'), render: () => null },
	map: { rocket: 1, trash: 2 },
	// v4/v5 tombstone the removed exports; at runtime they are simply absent,
	// but a future major could leave a non-callable marker behind.
	tombstoneString: 'deprecated',
	tombstoneNumber: 0,
	tombstoneNull: null,
	tombstoneFalse: false,
} as Record<string, unknown>

describe('resolveComponent', () => {
	it('accepts both component shapes a barrel can expose', () => {
		// A plain function component, and a forwardRef/memo exotic object.
		expect(resolveComponent(ns, 'fn')).toBeDefined()
		expect(resolveComponent(ns, 'forwardRefLike')).toBeDefined()
	})

	it('treats an absent export as absent, which is what triggers the fallback', () => {
		expect(resolveComponent(ns, 'neverExisted')).toBeUndefined()
	})

	it('rejects non-component tombstones rather than handing them to React', () => {
		for (const key of ['tombstoneString', 'tombstoneNumber', 'tombstoneNull', 'tombstoneFalse']) {
			expect(resolveComponent(ns, key), key).toBeUndefined()
		}
	})
})

describe('resolveFunction', () => {
	it('accepts a callable', () => {
		const fn = resolveFunction<() => string>(ns, 'fn')
		expect(fn?.()).toBe('called')
	})

	it('rejects a non-callable object, which would otherwise throw on call', () => {
		// A hook resolved from an object tombstone would read as present and then
		// blow up the first time a component rendered.
		expect(resolveFunction(ns, 'forwardRefLike')).toBeUndefined()
		expect(resolveFunction(ns, 'map')).toBeUndefined()
		expect(resolveFunction(ns, 'tombstoneString')).toBeUndefined()
	})
})

describe('resolveRecord', () => {
	it('returns a plain object', () => {
		expect(resolveRecord(ns, 'map')).toEqual({ rocket: 1, trash: 2 })
	})

	it('rejects anything that is not an object', () => {
		expect(resolveRecord(ns, 'fn')).toBeUndefined()
		expect(resolveRecord(ns, 'tombstoneNull')).toBeUndefined()
		expect(resolveRecord(ns, 'missing')).toBeUndefined()
	})
})
