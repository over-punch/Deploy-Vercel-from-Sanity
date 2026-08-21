// Version-agnostic access to @sanity/icons — named exports on v2/v3/v4, <Icon symbol> on v5+
import { forwardRef } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { ICONS, resolveExport } from './compat/resolve'

/** Props every Sanity icon accepts — it renders a plain sized SVG. */
export type IconProps = SVGProps<SVGSVGElement>

/** An icon component, whichever shape the installed @sanity/icons exposes it in. */
export type IconComponent = ComponentType<IconProps>

/** Sizing of a Sanity icon glyph — 1em square on a 25-unit viewBox, matching @sanity/icons. */
const GLYPH = { width: '1em', height: '1em', viewBox: '0 0 25 25', fill: 'none' } as const

/**
 * Placeholder for when the installed @sanity/icons exposes neither shape. Holds
 * layout, draws nothing, and is hidden from assistive tech since every icon in
 * this plugin is decorative.
 */
const MissingIcon = forwardRef<SVGSVGElement, IconProps>(function MissingIcon(props, ref) {
	return <svg {...GLYPH} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" {...props} ref={ref} />
})

/** The v5+ `<Icon>` component, absent on icons v2, v3 and v4. */
type SymbolIcon = ComponentType<IconProps & { symbol: string }>

/**
 * The symbol map v5+ exposes alongside `Icon`. Used to check a symbol exists
 * before relying on it: `<Icon>` renders `null` for an unrecognised symbol, so
 * a renamed glyph would otherwise vanish silently rather than reaching
 * {@link MissingIcon}.
 */
const SYMBOL_MAP = resolveExport<Record<string, unknown>>(ICONS, 'icons')

/**
 * Resolve one glyph against whichever @sanity/icons the host Studio installed.
 * Always reads from the host package, so new and revised artwork is picked up on
 * the consumer's next @sanity/icons update without a release here.
 *
 * Note the named exports are not merely absent on v5 — they are declared `never`
 * with a deprecation note pointing at per-icon subpaths, so a static named import
 * is a type error as well as a runtime one. Subpaths only exist from v4.1.0,
 * which is why this resolves at runtime instead.
 *
 * @param name   Named export used by icons v2, v3 and v4, e.g. `RocketIcon`.
 * @param symbol Kebab-case symbol used by the v5+ `<Icon>` component, e.g. `rocket`.
 */
function resolveIcon(name: string, symbol: string): IconComponent {
	const named = resolveExport<IconComponent>(ICONS, name)
	if (named) return named

	const Icon = resolveExport<SymbolIcon>(ICONS, 'Icon')
	if (!Icon) return MissingIcon
	// An unknown symbol would render nothing at all; fall back to the sized placeholder instead.
	if (SYMBOL_MAP && !(symbol in SYMBOL_MAP)) return MissingIcon

	const Resolved = forwardRef<SVGSVGElement, IconProps>(function SanityIcon(props, ref) {
		return <Icon symbol={symbol} {...props} ref={ref} />
	})
	Resolved.displayName = name
	return Resolved
}

export const AddIcon = resolveIcon('AddIcon', 'add')
export const CheckmarkCircleIcon = resolveIcon('CheckmarkCircleIcon', 'checkmark-circle')
export const CheckmarkIcon = resolveIcon('CheckmarkIcon', 'checkmark')
export const ChevronDownIcon = resolveIcon('ChevronDownIcon', 'chevron-down')
export const ChevronUpIcon = resolveIcon('ChevronUpIcon', 'chevron-up')
export const ClockIcon = resolveIcon('ClockIcon', 'clock')
export const CloseIcon = resolveIcon('CloseIcon', 'close')
export const CopyIcon = resolveIcon('CopyIcon', 'copy')
export const EditIcon = resolveIcon('EditIcon', 'edit')
export const EllipsisVerticalIcon = resolveIcon('EllipsisVerticalIcon', 'ellipsis-vertical')
export const LaunchIcon = resolveIcon('LaunchIcon', 'launch')
export const RocketIcon = resolveIcon('RocketIcon', 'rocket')
export const TokenIcon = resolveIcon('TokenIcon', 'token')
export const TrashIcon = resolveIcon('TrashIcon', 'trash')
export const WarningOutlineIcon = resolveIcon('WarningOutlineIcon', 'warning-outline')
