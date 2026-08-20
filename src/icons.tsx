// Version-agnostic access to @sanity/icons — resolves named exports (icons v3/v4) or <Icon symbol> (icons v5+)
import { forwardRef } from 'react'
import type { ComponentType, SVGProps } from 'react'
import * as sanityIcons from '@sanity/icons'

/** Props every Sanity icon accepts — it renders a plain sized SVG. */
export type IconProps = SVGProps<SVGSVGElement>

/** An icon component, whichever shape the installed @sanity/icons exposes it in. */
export type IconComponent = ComponentType<IconProps>

/**
 * The installed @sanity/icons namespace, read through an index signature.
 *
 * icons v3 and v4 export one named component per glyph (`RocketIcon`). v5.0.0
 * dropped those from the barrel and replaced them with a single `<Icon symbol>`
 * that lazy-loads from an internal map. Its `index.d.ts` still declares the old
 * named exports, so the mismatch is invisible to TypeScript and only surfaces at
 * runtime — reading the namespace dynamically lets one build serve every major.
 */
const INSTALLED = sanityIcons as unknown as Record<string, unknown>

/** Sizing of a Sanity icon glyph — 1em square on a 25-unit viewBox, matching @sanity/icons. */
const GLYPH = { width: '1em', height: '1em', viewBox: '0 0 25 25', fill: 'none' } as const

/** Last-resort placeholder when the installed @sanity/icons exposes neither shape. Holds layout, draws nothing. */
const MissingIcon = forwardRef<SVGSVGElement, IconProps>(function MissingIcon(props, ref) {
	return <svg {...GLYPH} xmlns="http://www.w3.org/2000/svg" {...props} ref={ref} />
})

/** The v5+ `<Icon>` component, absent on icons v3 and v4. */
type SymbolIcon = ComponentType<IconProps & { symbol: string }>

/**
 * Resolve one glyph against whichever @sanity/icons the host Studio installed.
 * Always reads from the host package, so new and revised artwork is picked up
 * on the consumer's next `@sanity/icons` update without a release here.
 *
 * @param name   Named export used by icons v3 and v4, e.g. `RocketIcon`.
 * @param symbol Kebab-case symbol used by the v5+ `<Icon>` component, e.g. `rocket`.
 */
function resolveIcon(name: string, symbol: string): IconComponent {
	const named = INSTALLED[name] as IconComponent | undefined
	if (named) return named

	const Icon = INSTALLED.Icon as SymbolIcon | undefined
	if (!Icon) return MissingIcon

	const Resolved = forwardRef<SVGSVGElement, IconProps>(function SanityIcon(props, ref) {
		return <Icon symbol={symbol} {...props} ref={ref as never} />
	})
	Resolved.displayName = name
	return Resolved as IconComponent
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
export const SchemaIcon = resolveIcon('SchemaIcon', 'schema')
export const TokenIcon = resolveIcon('TokenIcon', 'token')
export const TrashIcon = resolveIcon('TrashIcon', 'trash')
export const WarningOutlineIcon = resolveIcon('WarningOutlineIcon', 'warning-outline')
