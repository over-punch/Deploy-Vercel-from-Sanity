// Version-agnostic access to the @sanity/ui components that v4 moved out of the barrel, with local fallbacks
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import * as sanityUi from '@sanity/ui'
import { Box, Button, Card, Flex, Stack as SanityStack, Text } from '@sanity/ui'

/**
 * The installed @sanity/ui namespace, read through an index signature.
 *
 * @sanity/ui v4 relocated Tooltip, Menu, MenuButton, MenuItem, Code, Popover and
 * useToast into subpath entry points (`@sanity/ui/tooltip`, `/menu`, …) and dropped
 * them from the root barrel. Those subpaths do not exist on v2 or v3, so a static
 * import of either shape breaks half the supported Studio range. Reading the barrel
 * dynamically lets one build prefer the real components wherever they are still
 * exported and fall back to the local equivalents below when they are not.
 */
const INSTALLED = sanityUi as unknown as Record<string, unknown>

/* ------------------------------------------------------------------ stack -- */

/**
 * Whether the installed @sanity/ui is v4 or newer.
 *
 * v4 both emptied the barrel of Tooltip/Menu/Code/useToast and renamed Stack's
 * `space` prop to `gap` (the old name is typed `never` and ignored at runtime, so
 * passing it silently collapses all vertical spacing). Those landed in the same
 * major, so the absence of `useToast` from the barrel identifies v4+ reliably.
 */
const IS_UI_V4_PLUS = !('useToast' in INSTALLED)

/** Props for the compat Stack — keeps the pre-v4 `space` name at every call site. */
export type StackProps = {
	space?: number
	children: ReactNode
	[key: string]: unknown
}

/**
 * Vertical stack. Forwards `space` on @sanity/ui v2 and v3 and `gap` on v4+, so one
 * call site spells spacing correctly on either major.
 *
 * @param space Spacing step on Sanity's scale, forwarded under whichever name applies.
 */
export function Stack({ space, children, ...rest }: StackProps): React.JSX.Element {
	const spacing = space === undefined ? {} : IS_UI_V4_PLUS ? { gap: space } : { space }
	const Component = SanityStack as unknown as React.ComponentType<Record<string, unknown>>
	return <Component {...rest} {...spacing}>{children}</Component>
}

/* ------------------------------------------------------------------ toast -- */

/** A toast request, matching the subset of @sanity/ui's ToastParams this plugin uses. */
export type ToastParams = {
	status?: 'success' | 'error' | 'warning' | 'info'
	title?: ReactNode
	description?: ReactNode
}

/** The object returned by useToast — only `push` is used here. */
export type Toaster = { push: (params: ToastParams) => void }

/** A queued fallback toast. `id` is a monotonic counter, unique for the session. */
type LocalToast = ToastParams & { id: number }

/** How long a fallback toast stays on screen, in milliseconds. */
const LOCAL_TOAST_MS = 5000

/** Border tone per toast status, used only by the fallback viewport. */
const LOCAL_TOAST_TONE: Record<string, 'positive' | 'critical' | 'caution' | 'primary'> = {
	success: 'positive',
	error: 'critical',
	warning: 'caution',
	info: 'primary',
}

let nextToastId = 0
let localToasts: LocalToast[] = []
const toastListeners = new Set<(toasts: LocalToast[]) => void>()

/** Publish the current fallback queue to every mounted viewport. */
function emitToasts(): void {
	for (const listener of toastListeners) listener(localToasts)
}

/** Queue a fallback toast and schedule its removal. */
function pushLocalToast(params: ToastParams): void {
	const toast: LocalToast = { ...params, id: nextToastId++ }
	localToasts = [...localToasts, toast]
	emitToasts()
	setTimeout(() => {
		localToasts = localToasts.filter(t => t.id !== toast.id)
		emitToasts()
	}, LOCAL_TOAST_MS)
}

/** The real hook when the installed @sanity/ui still exports it, otherwise undefined. */
const installedUseToast = INSTALLED.useToast as (() => Toaster) | undefined

/** Stable fallback toaster — identity never changes, so it is safe in dependency arrays. */
const localToaster: Toaster = { push: pushLocalToast }

/**
 * Push toasts through Studio's toast system where available, or through the local
 * viewport below on @sanity/ui v4+. Mount `<ToastViewport />` once for the fallback
 * to be visible; it renders nothing when the real hook is present.
 */
export function useToast(): Toaster {
	const real = installedUseToast
	// Hook order is stable across renders because `installedUseToast` is module-level.
	if (real) return real()
	return localToaster
}

/**
 * Renders queued fallback toasts. No-op when the installed @sanity/ui exports its
 * own useToast, because Studio's ToastProvider is already handling them.
 */
export function ToastViewport(): React.JSX.Element | null {
	const [toasts, setToasts] = useState<LocalToast[]>(localToasts)

	useEffect(() => {
		if (installedUseToast) return
		toastListeners.add(setToasts)
		return () => { toastListeners.delete(setToasts) }
	}, [])

	if (installedUseToast || toasts.length === 0) return null

	return (
		<Box style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000000, maxWidth: 360 }}>
			<Stack space={2}>
				{toasts.map(toast => (
					<Card
						key={toast.id}
						padding={3}
						radius={2}
						shadow={3}
						tone={LOCAL_TOAST_TONE[toast.status ?? 'info'] ?? 'primary'}
					>
						<Stack space={2}>
							{toast.title && <Text size={1} weight="semibold">{toast.title}</Text>}
							{toast.description && <Text size={1} muted>{toast.description}</Text>}
						</Stack>
					</Card>
				))}
			</Stack>
		</Box>
	)
}

/* ---------------------------------------------------------------- tooltip -- */

/** Props for the compat Tooltip — plain text rather than @sanity/ui's ReactNode `content`. */
export type TooltipProps = { text: string; children: ReactNode }

/** The real Tooltip when the installed @sanity/ui still exports it, otherwise undefined. */
const InstalledTooltip = INSTALLED.Tooltip as
	| React.ComponentType<{ content: ReactNode; portal?: boolean; children: ReactNode }>
	| undefined

/**
 * Hover hint over `children`. Uses Studio's Tooltip where available and degrades to
 * the native `title` attribute on @sanity/ui v4+.
 */
export function Tooltip({ text, children }: TooltipProps): React.JSX.Element {
	if (InstalledTooltip) {
		return (
			<InstalledTooltip content={<Box padding={2}><Text size={1}>{text}</Text></Box>} portal>
				{children}
			</InstalledTooltip>
		)
	}
	return <span title={text} style={{ display: 'inline-flex' }}>{children}</span>
}

/* ------------------------------------------------------------------- menu -- */

/** One entry in an ActionMenu. Either `onClick` or `href` drives the behaviour. */
export type MenuAction = {
	text: string
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
	onClick?: () => void
	href?: string
	tone?: 'critical' | 'default'
}

/** Props for the compat ActionMenu — a declarative item list rather than nested JSX. */
export type ActionMenuProps = { id: string; items: MenuAction[]; buttonIcon: MenuAction['icon'] }

const InstalledMenuButton = INSTALLED.MenuButton as React.ComponentType<Record<string, unknown>> | undefined
const InstalledMenu = INSTALLED.Menu as React.ComponentType<Record<string, unknown>> | undefined
const InstalledMenuItem = INSTALLED.MenuItem as React.ComponentType<Record<string, unknown>> | undefined

/** Whether the installed @sanity/ui still exports the full menu trio. */
const HAS_INSTALLED_MENU = Boolean(InstalledMenuButton && InstalledMenu && InstalledMenuItem)

/**
 * Overflow menu for a deploy target. Uses Studio's MenuButton where available and
 * falls back to a locally positioned card on @sanity/ui v4+.
 *
 * @param id        Stable DOM id, required by @sanity/ui's MenuButton.
 * @param items     Actions in display order.
 * @param buttonIcon Icon for the trigger button.
 */
export function ActionMenu({ id, items, buttonIcon }: ActionMenuProps): React.JSX.Element {
	const [open, setOpen] = useState(false)
	const wrapRef = useRef<HTMLDivElement>(null)

	// Fallback only — dismiss on outside click or Escape.
	useEffect(() => {
		if (HAS_INSTALLED_MENU || !open) return
		const onPointerDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
		}
		const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
		document.addEventListener('mousedown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('mousedown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open])

	const runAction = useCallback((item: MenuAction) => {
		setOpen(false)
		item.onClick?.()
	}, [])

	if (HAS_INSTALLED_MENU && InstalledMenuButton && InstalledMenu && InstalledMenuItem) {
		const MenuButton = InstalledMenuButton
		const Menu = InstalledMenu
		const MenuItem = InstalledMenuItem
		return (
			<MenuButton
				id={id}
				button={<Button mode="ghost" icon={buttonIcon} padding={2} />}
				popover={{ placement: 'bottom-end' }}
				menu={
					<Menu>
						{items.map(item => (
							<MenuItem
								key={item.text}
								text={item.text}
								icon={item.icon}
								tone={item.tone}
								{...(item.href
									? { as: 'a', href: item.href, target: '_blank', rel: 'noreferrer' }
									: { onClick: () => item.onClick?.() })}
							/>
						))}
					</Menu>
				}
			/>
		)
	}

	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<Button
				mode="ghost"
				icon={buttonIcon}
				padding={2}
				id={id}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen(o => !o)}
			/>
			{open && (
				<Card
					radius={2}
					shadow={3}
					padding={1}
					role="menu"
					style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1000, minWidth: 180 }}
				>
					<Stack space={1}>
						{items.map(item => {
							const Icon = item.icon
							const label = (
								<Flex align="center" gap={2} paddingX={2} paddingY={2}>
									<Icon width="1em" height="1em" />
									<Text size={1}>{item.text}</Text>
								</Flex>
							)
							return item.href ? (
								<a
									key={item.text}
									role="menuitem"
									href={item.href}
									target="_blank"
									rel="noreferrer"
									onClick={() => setOpen(false)}
									style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
								>
									{label}
								</a>
							) : (
								<Card
									key={item.text}
									as="button"
									role="menuitem"
									tone={item.tone === 'critical' ? 'critical' : 'default'}
									radius={1}
									onClick={() => runAction(item)}
									style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, background: 'none' }}
								>
									{label}
								</Card>
							)
						})}
					</Stack>
				</Card>
			)}
		</div>
	)
}

/* ------------------------------------------------------------------- code -- */

/** The real Code when the installed @sanity/ui still exports it, otherwise undefined. */
const InstalledCode = INSTALLED.Code as
	| React.ComponentType<{ size?: number; style?: CSSProperties; children: ReactNode }>
	| undefined

/** Monospace styling for the fallback Code element, approximating @sanity/ui's `size={1}`. */
const FALLBACK_CODE_STYLE: CSSProperties = {
	fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
	fontSize: '0.8125rem',
	lineHeight: 1.4,
	margin: 0,
}

/** Monospace block. Uses Studio's Code where available, a plain `<code>` on @sanity/ui v4+. */
export function Code({ style, children }: { style?: CSSProperties; children: ReactNode }): React.JSX.Element {
	if (InstalledCode) return <InstalledCode size={1} style={style}>{children}</InstalledCode>
	return <code style={{ ...FALLBACK_CODE_STYLE, ...style }}>{children}</code>
}
