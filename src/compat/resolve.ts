// Reads the installed @sanity/ui and @sanity/icons namespaces so relocated exports degrade instead of failing to link
import * as sanityUi from '@sanity/ui'
import * as sanityIcons from '@sanity/icons'

/**
 * The installed namespaces, read through an index signature.
 *
 * Both packages have split their barrels: @sanity/icons v5 removed the named
 * `*Icon` exports, and @sanity/ui v4 moved Tooltip, Menu, MenuButton, MenuItem,
 * Code, Popover and useToast into subpath entry points. Those subpaths do not
 * exist on the earlier majors this plugin supports, so neither import shape works
 * across the range.
 *
 * Both packages also still *declare* the moved names in their `.d.ts` — typed
 * `never`, with a deprecation note — so a static named import type-checks at the
 * import site and only fails when the value is used or evaluated. Reading the
 * namespace turns a link-time failure into a value this code can branch on.
 *
 * Verified through Vite/Rollup: aliasing the namespace into a binding is what
 * forces bundlers to materialise a real namespace object rather than rewriting
 * member access into named bindings. Do not inline these back into direct
 * `sanityUi.x` access without re-checking the emitted bundle.
 */
export const UI = sanityUi as unknown as Record<string, unknown>
export const ICONS = sanityIcons as unknown as Record<string, unknown>

/**
 * Look up one export by name, returning undefined when the installed major no
 * longer provides it.
 *
 * @param ns   Namespace to read — {@link UI} or {@link ICONS}.
 * @param name Exact export name, e.g. `Tooltip`.
 */
export function resolveExport<T>(ns: Record<string, unknown>, name: string): T | undefined {
	const value = ns[name]
	// A deprecation tombstone can be present but not callable; only accept usable values.
	return typeof value === 'function' || (typeof value === 'object' && value !== null)
		? (value as T)
		: undefined
}

/**
 * Whether the installed @sanity/ui expects `gap` rather than `space` on Stack.
 *
 * v4 renamed the prop, typed the old name `never`, and ignores it at runtime —
 * so guessing wrong collapses every vertical gap silently. It also rewrote Stack
 * from a `forwardRef` component into a plain function generic, in the same
 * release. Probing the shape of Stack itself keeps the signal attached to the
 * component whose prop is being chosen, rather than to an unrelated export.
 *
 * Verified: forwardRef object on @sanity/ui 2.16.27 and 3.5.3, plain function on
 * 4.0.5. Passing both prop names is not an option — `gap` leaks to the DOM as a
 * stray attribute on v2, and `space` leaks on v4.
 */
export const STACK_USES_GAP = typeof (UI.Stack as unknown) === 'function'
