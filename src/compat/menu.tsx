// Overflow menu — Studio's MenuButton where available, a WAI-ARIA menu button implementation otherwise
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { UI, resolveExport } from './resolve'
import { Button, Card, Flex, Stack, Text } from './primitives'

/** An icon component, matching what this plugin's icon shim produces. */
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

/** One entry in an ActionMenu. Exactly one of `onClick` or `href` drives the behaviour. */
export type MenuAction =
	| { key?: string; text: string; icon: IconComponent; tone?: 'critical'; onClick: () => void; href?: never }
	| { key?: string; text: string; icon: IconComponent; tone?: 'critical'; href: string; onClick?: never }

/** Props for the compat ActionMenu — a declarative item list rather than nested JSX. */
export type ActionMenuProps = {
	/** Stable DOM id for the trigger. */
	id: string
	/** Accessible name for the trigger, which is icon-only. */
	label: string
	items: MenuAction[]
	buttonIcon: IconComponent
}

const InstalledMenuButton = resolveExport<ComponentType<Record<string, unknown>>>(UI, 'MenuButton')
const InstalledMenu = resolveExport<ComponentType<Record<string, unknown>>>(UI, 'Menu')
const InstalledMenuItem = resolveExport<ComponentType<Record<string, unknown>>>(UI, 'MenuItem')

/** Whether the installed @sanity/ui still exports the full menu trio. */
const INSTALLED_MENU = InstalledMenuButton && InstalledMenu && InstalledMenuItem
	? { MenuButton: InstalledMenuButton, Menu: InstalledMenu, MenuItem: InstalledMenuItem }
	: null

/** Stable identity for an item, used for React keys and focus tracking. Labels can repeat; keys should not. */
const itemKey = (item: MenuAction, index: number): string => item.key ?? `${index}-${item.text}`

/**
 * Overflow menu. Uses Studio's MenuButton where available and otherwise implements
 * the WAI-ARIA menu button pattern locally: focus moves into the menu on open,
 * Arrow/Home/End move between items with a roving tabindex, Escape and Tab close
 * and return focus to the trigger.
 *
 * The item list is snapshotted while the menu is open, so background polling
 * cannot insert or remove rows under the pointer.
 */
export function ActionMenu({ id, label, items, buttonIcon }: ActionMenuProps): React.JSX.Element {
	const menuId = useId()
	const [open, setOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState(0)
	const wrapRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const itemRefs = useRef<(HTMLElement | null)[]>([])

	// Snapshot taken at open time — the live `items` array is rebuilt on every poll.
	const [frozenItems, setFrozenItems] = useState<MenuAction[]>(items)
	const shownItems = open ? frozenItems : items

	/** Close the menu and hand focus back to the trigger, as the menu button pattern requires. */
	const close = useCallback((returnFocus = true) => {
		setOpen(false)
		if (returnFocus) triggerRef.current?.focus()
	}, [])

	const openMenu = useCallback((index: number) => {
		setFrozenItems(items)
		setActiveIndex(index)
		setOpen(true)
	}, [items])

	// Move DOM focus to follow the active item while the menu is open.
	useEffect(() => {
		if (!open || INSTALLED_MENU) return
		itemRefs.current[activeIndex]?.focus()
	}, [open, activeIndex])

	// Fallback only — dismiss on outside pointer down. Escape and Tab are handled on the menu itself
	// so they do not swallow keys belonging to any dialog the tool has open.
	useEffect(() => {
		if (INSTALLED_MENU || !open) return
		const onPointerDown = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onPointerDown)
		return () => document.removeEventListener('mousedown', onPointerDown)
	}, [open])

	const runAction = useCallback((item: MenuAction) => {
		close()
		item.onClick?.()
	}, [close])

	if (INSTALLED_MENU) {
		const { MenuButton, Menu, MenuItem } = INSTALLED_MENU
		return (
			<MenuButton
				id={id}
				button={<Button mode="ghost" icon={buttonIcon} padding={2} aria-label={label} />}
				popover={{ placement: 'bottom-end' }}
				menu={
					<Menu>
						{items.map((item, i) => (
							<MenuItem
								key={itemKey(item, i)}
								text={item.text}
								icon={item.icon}
								tone={item.tone}
								{...(item.href
									? { as: 'a', href: item.href, target: '_blank', rel: 'noreferrer' }
									: { onClick: item.onClick })}
							/>
						))}
					</Menu>
				}
			/>
		)
	}

	/** Arrow/Home/End/Escape/Tab handling for the open menu, per the WAI-ARIA menu button pattern. */
	const onMenuKeyDown = (e: React.KeyboardEvent) => {
		const last = shownItems.length - 1
		if (e.key === 'Escape') { e.stopPropagation(); close(); return }
		if (e.key === 'Tab') { close(false); return }
		if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i >= last ? 0 : i + 1)); return }
		if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i <= 0 ? last : i - 1)); return }
		if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); return }
		if (e.key === 'End') { e.preventDefault(); setActiveIndex(last); return }
	}

	const onTriggerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(0) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); openMenu(items.length - 1) }
	}

	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<Button
				ref={triggerRef}
				mode="ghost"
				icon={buttonIcon}
				padding={2}
				id={id}
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				onClick={() => (open ? close() : openMenu(0))}
				onKeyDown={onTriggerKeyDown}
			/>
			{open && (
				<Card
					id={menuId}
					radius={2}
					shadow={3}
					padding={1}
					role="menu"
					aria-labelledby={id}
					onKeyDown={onMenuKeyDown}
					style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1000, minWidth: 200 }}
				>
					{/* role="none" so the menu still directly owns its menuitem children. */}
					<Stack space={1} role="none">
						{shownItems.map((item, i) => {
							const Icon = item.icon
							const row = (
								<Flex align="center" gap={2} paddingX={2} paddingY={2}>
									<Icon width="1em" height="1em" aria-hidden="true" />
									<Text size={1}>{item.text}</Text>
								</Flex>
							)
							// A destructive item is wrapped in a critical-tone Card so it picks up Sanity's
							// validated foreground/background pairing rather than a hand-picked colour.
							const content = item.tone === 'critical'
								? <Card tone="critical" radius={1}>{row}</Card>
								: row
							const shared = {
								role: 'menuitem',
								// Roving tabindex — the menu is one tab stop, arrows move within it.
								tabIndex: i === activeIndex ? 0 : -1,
								ref: (el: HTMLElement | null) => { itemRefs.current[i] = el },
								onMouseEnter: () => setActiveIndex(i),
								style: {
									display: 'block',
									width: '100%',
									textAlign: 'left' as const,
									cursor: 'pointer',
									borderRadius: 3,
									background: 'none',
									border: 0,
									padding: 0,
									font: 'inherit',
									color: 'inherit',
									textDecoration: 'none',
									// Card suppresses its own focus ring, so the active item draws one explicitly.
									outline: i === activeIndex ? '2px solid var(--card-focus-ring-color, currentColor)' : 'none',
									outlineOffset: -2,
								},
							}
							return item.href ? (
								<a
									key={itemKey(item, i)}
									{...shared}
									href={item.href}
									target="_blank"
									rel="noreferrer"
									onClick={() => close(false)}
								>
									{content}
								</a>
							) : (
								<button
									key={itemKey(item, i)}
									{...shared}
									type="button"
									onClick={() => runAction(item)}
								>
									{content}
								</button>
							)
						})}
					</Stack>
				</Card>
			)}
		</div>
	)
}
