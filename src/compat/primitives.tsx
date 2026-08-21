// Layout and control primitives resolved from the installed @sanity/ui, with plain-DOM fallbacks
import { createElement, forwardRef } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type * as SanityUi from '@sanity/ui'
import { UI, resolveComponent, STACK_USES_GAP } from './resolve'

/** Loose props for a resolved @sanity/ui primitive — upstream types vary by major. */
type AnyProps = Record<string, unknown>

/**
 * Build a last-resort component that renders a plain DOM element, used when the
 * installed @sanity/ui no longer exports a name this plugin needs. It drops the
 * design-system props it cannot honour so React does not warn about unknown
 * attributes, and keeps children so the tool stays usable rather than blank.
 *
 * @param tag DOM element to render in place of the missing component.
 */
function domFallback(tag: string): ComponentType<AnyProps> {
	const Fallback = forwardRef<HTMLElement, AnyProps>(function SanityUiFallback(props, ref) {
		const { children, style, id, className, onClick, href, title, as, ...rest } = props
		// `as` is honoured so `Button as="a" href` degrades to a link rather than a
		// dead <button href>, and `Label as="label" htmlFor` keeps its association.
		const element = typeof as === 'string' ? as : tag
		const passthrough: AnyProps = { style, id, className, onClick, href, title, ref }
		for (const key of [
			'role', 'type', 'value', 'checked', 'placeholder', 'disabled', 'tabIndex',
			'onChange', 'onKeyDown', 'onFocus', 'onBlur', 'onMouseEnter', 'onMouseLeave',
			'htmlFor', 'target', 'rel', 'name', 'autoComplete', 'required', 'readOnly',
		]) {
			if (key in rest) passthrough[key] = rest[key]
		}
		for (const key of Object.keys(rest)) {
			if (key.startsWith('aria-') || key.startsWith('data-')) passthrough[key] = rest[key]
		}
		return createElement(element, passthrough, children as ReactNode)
	})
	Fallback.displayName = `SanityUiFallback(${tag})`
	return Fallback as unknown as ComponentType<AnyProps>
}

/**
 * Resolve one @sanity/ui export, falling back to a DOM element when the installed
 * major no longer provides it. Keeps a relocated export from turning into a
 * module-evaluation failure that stops the whole Studio from booting.
 *
 * @param name Export name on the @sanity/ui barrel.
 * @param tag  DOM element to degrade to.
 */
function primitive(name: string, tag: string): ComponentType<AnyProps> {
	return resolveComponent<AnyProps>(UI, name) ?? domFallback(tag)
}

/*
 * The value comes through the seam so a relocated export degrades instead of
 * failing to link; the *type* is taken from the installed @sanity/ui so call
 * sites keep full prop checking. If a future major tombstones one of these as
 * `never` — as v4 did to Tooltip and Menu — the assertion makes every call site
 * a build error rather than a silent runtime blank.
 */
export const Box = primitive('Box', 'div') as typeof SanityUi.Box
export const Card = primitive('Card', 'div') as typeof SanityUi.Card
export const Flex = primitive('Flex', 'div') as typeof SanityUi.Flex
export const Grid = primitive('Grid', 'div') as typeof SanityUi.Grid
export const Text = primitive('Text', 'span') as typeof SanityUi.Text
export const Heading = primitive('Heading', 'h2') as typeof SanityUi.Heading
export const Label = primitive('Label', 'label') as typeof SanityUi.Label
export const Badge = primitive('Badge', 'span') as typeof SanityUi.Badge
export const Spinner = primitive('Spinner', 'span') as typeof SanityUi.Spinner
export const Button = primitive('Button', 'button') as typeof SanityUi.Button
export const TextInput = primitive('TextInput', 'input') as typeof SanityUi.TextInput
export const Select = primitive('Select', 'select') as typeof SanityUi.Select
export const Switch = primitive('Switch', 'input') as typeof SanityUi.Switch
export const Dialog = primitive('Dialog', 'div') as unknown as typeof SanityUi.Dialog

const SanityStack = primitive('Stack', 'div')

/** Props for the compat Stack. Mirrors the upstream surface this plugin uses. */
export type StackProps = {
	/** Spacing step on Sanity's scale, forwarded as `gap` or `space` per installed major. */
	space?: number
	padding?: number
	paddingX?: number
	paddingY?: number
	flex?: number
	style?: React.CSSProperties
	className?: string
	role?: string
	children?: ReactNode
}

/**
 * Vertical stack. Forwards `space` on @sanity/ui v2 and v3 and `gap` on v4+, so
 * one call site spells spacing correctly on either major. See STACK_USES_GAP for
 * how the two are told apart.
 */
export function Stack({ space, children, ...rest }: StackProps): React.JSX.Element {
	const spacing = space === undefined ? {} : STACK_USES_GAP ? { gap: space } : { space }
	return <SanityStack {...rest} {...spacing}>{children}</SanityStack>
}
