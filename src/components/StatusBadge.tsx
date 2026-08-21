// Status badge for a Vercel deployment state
import { stateLabel } from '../lib/helpers'
import type { VercelDeployState } from '../types'
import { Badge, Flex, Spinner } from '../compat'

interface StatusBadgeProps {
	state: VercelDeployState | undefined
	/** When true, shows a spinner alongside the label */
	showSpinner?: boolean
}

export function StatusBadge({ state, showSpinner }: StatusBadgeProps) {
	const { label, tone } = stateLabel(state)
	const spinning = showSpinner && (state === 'QUEUED' || state === 'INITIALIZING' || state === 'BUILDING')
	return (
		<Flex align="center" gap={2}>
			{spinning && <Spinner muted />}
			<Badge tone={tone} padding={2}>
				{label}
			</Badge>
		</Flex>
	)
}
