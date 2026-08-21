// Hover/focus hint — Studio's Tooltip where available, an accessible local tooltip otherwise
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { UI, resolveExport } from './resolve'
import { Box, Card, Text } from './primitives'
import type { ComponentType } from 'react'

/** Props for the compat Tooltip — plain text rather than @sanity/ui's ReactNode `content`. */
export type TooltipProps = {
	/** Hint text. Also used as the accessible description of the wrapped control. */
	text: string
	children: ReactNode
}

/** The real Tooltip when the installed @sanity/ui still exports it, otherwise undefined. */
const InstalledTooltip = resolveExport<ComponentType<{
	content: ReactNode
	portal?: boolean
	children: ReactNode
}>>(UI, 'Tooltip')

/**
 * Hint shown on hover and on keyboard focus.
 *
 * The fallback deliberately does not use the native `title` attribute: `title`
 * never appears on keyboard focus, never appears on touch, cannot be dismissed,
 * and browsers will not re-read it while the pointer is stationary — which
 * silently broke the copy button's "Copied!" confirmation. This renders a real
 * element instead and wires it to the wrapped control via `aria-describedby`,
 * so the text is announced and updates when it changes.
 */
export function Tooltip({ text, children }: TooltipProps): React.JSX.Element {
	const id = useId()
	const [visible, setVisible] = useState(false)

	if (InstalledTooltip) {
		return (
			<InstalledTooltip content={<Box padding={2}><Text size={1}>{text}</Text></Box>} portal>
				{children}
			</InstalledTooltip>
		)
	}

	return (
		<span
			style={{ position: 'relative', display: 'inline-flex' }}
			aria-describedby={id}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
			onFocusCapture={() => setVisible(true)}
			onBlurCapture={() => setVisible(false)}
			onKeyDown={e => { if (e.key === 'Escape') setVisible(false) }}
		>
			{children}
			<Card
				id={id}
				role="tooltip"
				radius={2}
				shadow={2}
				padding={2}
				style={{
					position: 'absolute',
					bottom: '100%',
					left: '50%',
					transform: 'translateX(-50%)',
					marginBottom: 4,
					whiteSpace: 'nowrap',
					pointerEvents: 'none',
					zIndex: 1000,
					// Kept in the accessibility tree when hidden so `aria-describedby` still resolves.
					visibility: visible ? 'visible' : 'hidden',
				}}
			>
				<Text size={1}>{text}</Text>
			</Card>
		</span>
	)
}
