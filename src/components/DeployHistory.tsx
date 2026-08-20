// Deployment history modal — shows last 10 deployments for a target
import { useEffect, useState, useCallback } from 'react'
import {
	Dialog, Card, Box, Flex, Text, Badge, Spinner, Button,
} from '@sanity/ui'
import { Stack } from '../ui'
import { LaunchIcon, CloseIcon } from '../icons'
import { listDeployments } from '../lib/api'
import { parseHookUrl, stateLabel, timeAgo, shortSha, safeHref } from '../lib/helpers'
import type { DeployTarget, VercelDeployment } from '../types'

interface DeployHistoryProps {
	target: DeployTarget
	token: string
	onClose: () => void
}

export function DeployHistory({ target, token, onClose }: DeployHistoryProps) {
	const [deployments, setDeployments] = useState<VercelDeployment[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const { projectId, hookId } = parseHookUrl(target.url)

	const load = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const data = await listDeployments({ projectId, hookId, token, teamId: target.teamId, limit: 10 })
			setDeployments(data)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load history')
		} finally {
			setLoading(false)
		}
	}, [projectId, hookId, token, target.teamId])

	useEffect(() => { load() }, [load])

	return (
		<Dialog
			header={`${target.name} — Deployment History`}
			id="deploy-history"
			onClose={onClose}
			width={2}
			footer={
				<Box padding={3}>
					<Button text="Close" icon={CloseIcon} mode="ghost" onClick={onClose} />
				</Box>
			}
		>
			<Box padding={4}>
				{loading && (
					<Flex justify="center" padding={6}>
						<Spinner muted />
					</Flex>
				)}

				{error && (
					<Card tone="critical" padding={4} radius={2}>
						<Text size={1}>{error}</Text>
					</Card>
				)}

				{!loading && !error && deployments.length === 0 && (
					<Card tone="transparent" padding={4}>
						<Text size={1} muted align="center">No deployments found for this hook.</Text>
					</Card>
				)}

				{!loading && deployments.length > 0 && (
					<Stack space={2}>
						{/* Column headers */}
						<Card padding={3} radius={2} tone="transparent">
							<Flex gap={3}>
								<Box flex={2}><Text size={0} weight="semibold" muted>Preview URL</Text></Box>
								<Box flex={1}><Text size={0} weight="semibold" muted>Status</Text></Box>
								<Box flex={2}><Text size={0} weight="semibold" muted>Branch · Commit</Text></Box>
								<Box flex={1}><Text size={0} weight="semibold" muted>Deployed</Text></Box>
								<Box style={{ width: 64 }}><Text size={0} weight="semibold" muted>Logs</Text></Box>
							</Flex>
						</Card>

						{deployments.map(d => {
							const { label, tone } = stateLabel(d.state)
							const branch = d.meta?.githubCommitRef ?? '—'
							const sha = shortSha(d.meta?.githubCommitSha)
							const message = d.meta?.githubCommitMessage?.split('\n')[0] ?? ''

							return (
								<Card key={d.uid} padding={3} radius={2} shadow={1} tone="default">
									<Flex gap={3} align="center">
										{/* Preview URL */}
										<Box flex={2} style={{ overflow: 'hidden' }}>
											{d.url ? (
												<a
													href={`https://${d.url}`}
													target="_blank"
													rel="noreferrer"
													style={{ color: 'inherit' }}
												>
													<Text size={1} style={{ textDecoration: 'underline' }}>
														{d.url.length > 36 ? `${d.url.slice(0, 36)}…` : d.url}
													</Text>
												</a>
											) : (
												<Text size={1} muted>—</Text>
											)}
										</Box>

										{/* Status */}
										<Box flex={1}>
											<Badge tone={tone}>{label}</Badge>
										</Box>

										{/* Branch + commit */}
										<Box flex={2} style={{ overflow: 'hidden' }}>
											<Stack space={1}>
												<Text size={1}>{branch}</Text>
												{sha && (
													<Text size={0} muted>
														{sha}{message ? ` · ${message.slice(0, 40)}${message.length > 40 ? '…' : ''}` : ''}
													</Text>
												)}
											</Stack>
										</Box>

										{/* Time */}
										<Box flex={1}>
											<Text size={1} muted>{timeAgo(d.created)}</Text>
										</Box>

										{/* Build logs link */}
										<Box style={{ width: 64 }}>
											{safeHref(d.inspectorUrl) ? (
												<a href={safeHref(d.inspectorUrl)} target="_blank" rel="noreferrer">
													<Button
														text="Logs"
														mode="ghost"
														tone="default"
														icon={LaunchIcon}
														style={{ fontSize: '12px' }}
													/>
												</a>
											) : (
												<Text size={1} muted>—</Text>
											)}
										</Box>
									</Flex>
								</Card>
							)
						})}
					</Stack>
				)}
			</Box>
		</Dialog>
	)
}
