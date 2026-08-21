// Per-deploy-target card — shows status, build timer, history, cancel, deploy, copy URL, and error logs
import { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { ActionMenu, Badge, Box, Button, Card, Code, Flex, Spinner, Stack, Text, Tooltip, useToast } from '../compat'
import {
	ClockIcon, TrashIcon, EllipsisVerticalIcon, LaunchIcon,
	CopyIcon, CheckmarkIcon, WarningOutlineIcon, ChevronDownIcon, ChevronUpIcon, EditIcon,
} from '../icons'
import { triggerDeploy } from '../lib/api'
import { fetchDeployments as transportFetch, cancelDeploy, fetchDeploymentEvents } from '../lib/transport'
import { usePluginConfig } from '../config'
import { useClient } from 'sanity'
import { parseHookUrl, isActiveState, formatDuration, timeAgo, shortSha, safeHref, projectHref, githubCommitHref, deploymentHref } from '../lib/helpers'
import { StatusBadge } from './StatusBadge'
import { DeployHistory } from './DeployHistory'
import type { DeployTarget, VercelDeployment, VercelDeployState } from '../types'

const POLL_INTERVAL_MS = 5_000
const LABEL_WIDTH      = 64
/** Max time (ms) to hold the optimistic pending state before giving up and deferring to real API status */
const PENDING_TIMEOUT_MS = 60_000

interface DeployItemProps {
	target: DeployTarget
	token: string
	onDelete: (target: DeployTarget) => void
	onEdit: (target: DeployTarget) => void
}

export function DeployItem({ target, token, onDelete, onEdit }: DeployItemProps) {
	const { projectId, hookId } = parseHookUrl(target.url)
	const toast = useToast()
	const pluginConfig = usePluginConfig()
	const client = useClient({ apiVersion: '2025-01-01' })

	/** Where status, cancel and log requests go — direct to Vercel, or via the proxy. */
	const transport = pluginConfig.mode === 'proxy'
		? { mode: 'proxy' as const, proxyUrl: pluginConfig.proxyUrl ?? '', statusKey: pluginConfig.statusKey }
		: { mode: 'direct' as const, token }
	const targetRef = { projectId, hookId, proxyKey: target.proxyKey, teamId: target.teamId }

	const [deployments, setDeployments]      = useState<VercelDeployment[]>([])
	const [loadingInitial, setLoadingInitial] = useState(true)
	const [pendingSince, setPendingSince]    = useState<number | null>(null)
	const [canceling, setCanceling]          = useState(false)
	const [deployError, setDeployError]      = useState<string | null>(null)
	const [showHistory, setShowHistory]      = useState(false)
	const [elapsed, setElapsed]              = useState(0)
	const [copied, setCopied]                = useState(false)
	const [showDetails, setShowDetails]      = useState(false)
	const [showErrorLogs, setShowErrorLogs]  = useState(false)
	const [errorLines, setErrorLines]        = useState<string[]>([])
	const [loadingLogs, setLoadingLogs]      = useState(false)
	const [logError, setLogError]            = useState<string | null>(null)
	const [pollError, setPollError]          = useState<string | null>(null)

	/** uid of the deployment that was latest when Deploy was clicked — lets us tell the optimistic state apart from a genuinely new deployment */
	const triggeredFromUidRef = useRef<string | undefined>(undefined)
	/** Monotonic request id — a slower earlier poll must not overwrite a newer response. */
	const requestSeqRef = useRef(0)
	/** False once the card unmounts, so in-flight responses stop updating state. */
	const mountedRef = useRef(true)
	useEffect(() => {
		// Re-armed on mount, not just cleared on unmount: StrictMode runs
		// mount -> cleanup -> mount, and `sanity dev` enables it by default. Without
		// this the flag stays false for the life of the card and every response is
		// discarded, leaving a permanently empty card in development only.
		mountedRef.current = true
		return () => { mountedRef.current = false }
	}, [])

	const latest = deployments[0]
	/** True between the click and the API returning a new deployment — drives the optimistic "Queued" state */
	const isPending = pendingSince !== null
	const isActive  = isPending || isActiveState(latest?.state)

	// ── Fetch deployments ──────────────────────────────────────────────────────
	const fetchDeployments = useCallback(async () => {
		// Proxy targets deliberately have no hook URL and no token — requiring them
		// here silently disabled polling, history, cancel and logs in proxy mode.
		const ready = transport.mode === 'proxy'
			? Boolean(target.proxyKey && pluginConfig.proxyUrl)
			: Boolean(projectId && hookId && token)
		if (!ready) return
		const seq = ++requestSeqRef.current
		try {
			const data = await transportFetch(transport, targetRef)
			// Drop the response if a newer request has since been issued, or the card unmounted.
			if (seq !== requestSeqRef.current || !mountedRef.current) return
			setDeployments(data)
			setPollError(null)
		} catch (err) {
			if (seq !== requestSeqRef.current || !mountedRef.current) return
			// Surfaced in the card rather than only logged — the README documents rate-limit
			// and auth failures as visible, and a silently frozen card looks identical to an idle one.
			setPollError(err instanceof Error ? err.message : 'Could not reach the Vercel API')
			console.error('Deploy-vercel-from-sanity: fetch error', err)
		}
	}, [projectId, hookId, token, target.teamId, target.proxyKey, transport.mode, pluginConfig.proxyUrl])

	useEffect(() => {
		fetchDeployments().finally(() => setLoadingInitial(false))
	}, [fetchDeployments])

	useEffect(() => {
		if (!isActive) return
		const id = setInterval(fetchDeployments, POLL_INTERVAL_MS)
		return () => clearInterval(id)
	}, [isActive, fetchDeployments])

	// Hand off from the optimistic state only once the API returns a deployment
	// that is not the one which was already latest when Deploy was clicked.
	useEffect(() => {
		if (!isPending) return
		if (latest?.uid && latest.uid !== triggeredFromUidRef.current) setPendingSince(null)
	}, [isPending, latest?.uid])

	// Safety net — never strand the card in the optimistic state if the new
	// deployment never appears (hook accepted but nothing was queued).
	useEffect(() => {
		if (!isPending) return
		const id = setTimeout(() => setPendingSince(null), PENDING_TIMEOUT_MS)
		return () => clearTimeout(id)
	}, [isPending])

	//── Deploy-complete toast ─────────────────────────────────────────────────
	const prevStateRef = useRef<VercelDeployState | undefined>(undefined)
	useEffect(() => {
		const current = latest?.state
		const prev = prevStateRef.current
		if (prev && isActiveState(prev) && current && !isActiveState(current)) {
			if (current === 'READY') {
				toast.push({ status: 'success', title: `${target.name} deployed`, description: 'Build completed successfully' })
			} else if (current === 'ERROR') {
				toast.push({ status: 'error', title: `${target.name} failed`, description: 'Build encountered an error — check error details' })
			} else if (current === 'CANCELED') {
				toast.push({ status: 'warning', title: `${target.name} canceled`, description: 'Deployment was canceled' })
			}
		}
		prevStateRef.current = current
	}, [latest?.state, target.name, toast])

	useEffect(() => {
		setShowErrorLogs(false)
		setErrorLines([])
		setLogError(null)
	}, [latest?.uid])

	// ── Build timer ───────────────────────────────────────────────────────────
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
	useEffect(() => {
		if (isActive) {
			// While optimistic, count from the click; once real, count from the deployment's own timestamp
			const start = pendingSince ?? latest?.created ?? Date.now()
			setElapsed(Math.floor((Date.now() - start) / 1000))
			timerRef.current = setInterval(() => {
				setElapsed(Math.floor((Date.now() - start) / 1000))
			}, 1000)
		} else {
			setElapsed(0)
			if (timerRef.current) clearInterval(timerRef.current)
		}
		return () => { if (timerRef.current) clearInterval(timerRef.current) }
	}, [isActive, pendingSince, latest?.created])

	// ── Actions ───────────────────────────────────────────────────────────────
	const deploy = useCallback(() => {
		// Paint the optimistic "Queued" state in the same frame as the click,
		// before the hook request is even sent
		flushSync(() => {
			setDeployError(null)
			triggeredFromUidRef.current = latest?.uid
			setPendingSince(Date.now())
		})
		void (async () => {
			try {
				if (pluginConfig.mode === 'proxy') {
					// The Studio holds no deploy credential. Creating this document is the
					// request; Sanity's write ACL is what authorises it, and a signed webhook
					// hands it to the proxy, which owns the hook URL. A viewer cannot write,
					// so a viewer cannot deploy.
					if (!target.proxyKey) throw new Error('Target has no proxy key — set one on the deploy target')
					await client.create({
						_type: 'vercelDeploy.request',
						target: { _type: 'reference', _ref: target._id },
						proxyKey: target.proxyKey,
						requestedAt: new Date().toISOString(),
					})
				} else {
					await triggerDeploy(target.url ?? '')
				}
				setTimeout(fetchDeployments, 2000)
			} catch (err) {
				setPendingSince(null)
				setDeployError(err instanceof Error ? err.message : 'Deploy failed')
			}
		})()
	}, [target.url, target.proxyKey, target._id, pluginConfig.mode, client, fetchDeployments, latest?.uid])

	const cancel = useCallback(async () => {
		if (!latest?.uid) return
		setCanceling(true)
		try {
			await cancelDeploy(transport, targetRef, latest.uid)
			await fetchDeployments()
		} catch (err) {
			console.error('deploy-vercel-from-sanity: cancel error', err)
		} finally {
			setCanceling(false)
		}
	}, [latest?.uid, token, target.teamId, fetchDeployments])

	const copyUrl = useCallback(() => {
		if (!latest?.url) return
		const fullUrl = deploymentHref(latest.url) ?? ''
		navigator.clipboard.writeText(fullUrl).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}).catch(() => {
			// Clipboard API unavailable — surface the URL for manual copy
			window.prompt('Copy deployment URL:', fullUrl)
		})
	}, [latest?.url])

	const fetchErrorLogs = useCallback(async () => {
		if (!latest?.uid) return
		setLoadingLogs(true)
		setLogError(null)
		try {
			const events = await fetchDeploymentEvents(transport, targetRef, latest.uid)
			const lines = events
				.filter(e => e.type === 'stderr' || e.type === 'stdout')
				.map(e => e.text ?? '')
				.filter(Boolean)
				.reverse()
				.slice(-30)
			setErrorLines(lines.length > 0 ? lines : ['No stderr or stdout was captured for this build. Open the full build log in Vercel for details.'])
		} catch (err) {
			setLogError(err instanceof Error ? err.message : 'Failed to load build logs')
		} finally {
			setLoadingLogs(false)
		}
	}, [latest?.uid, token, target.teamId])

	const toggleErrorLogs = useCallback(() => {
		if (!showErrorLogs && errorLines.length === 0 && !logError) fetchErrorLogs()
		setShowErrorLogs(v => !v)
	}, [showErrorLogs, errorLines.length, logError, fetchErrorLogs])

	// ── Derived display values ────────────────────────────────────────────────
	const branch           = latest?.meta?.githubCommitRef
	const commitMsg        = latest?.meta?.githubCommitMessage?.split('\n')[0]
	const sha              = shortSha(latest?.meta?.githubCommitSha)
	const fullSha          = latest?.meta?.githubCommitSha
	const commitHref       = safeHref(githubCommitHref(latest?.meta) ?? undefined)
	const creator          = latest?.creator?.username
	const deployedAt       = latest?.created ? timeAgo(latest.created) : null
	const vercelProjectUrl = projectHref(latest?.inspectorUrl)
	const isError          = latest?.state === 'ERROR'

	return (
		<>
			<Card radius={2} shadow={1} tone="default">
				<Flex align="stretch" className="dvfs-card-flex">

					{/* ── Left: info column ──────────────────────────────────── */}
					<Flex direction="column" flex={1} style={{ minWidth: 0 }}>

						<Stack space={3} padding={3} style={{ flex: 1 }}>

							{/* ── Title row: name + branch + status + menu ──────── */}
							<Flex align="center" justify="space-between" gap={2}>
								<Flex align="center" gap={2} style={{ minWidth: 0, flexWrap: 'wrap' }}>
									<Text size={2} weight="semibold" style={{ flexShrink: 0 }}>{target.name}</Text>
									{branch && (
										<Badge tone="default" padding={2}>
											<Flex align="center" gap={1}>
												{branch}
												<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ marginLeft: "-0.1em", opacity: 0.5 }}>
													<path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
												</svg>
											</Flex>
										</Badge>
									)}
									{token && !loadingInitial && (
										<>
											{isPending ? (
												<StatusBadge state="QUEUED" />
											) : (
												<StatusBadge state={latest?.state} />
											)}
											{isActiveState(latest?.state) && (
												<Button
													text="Cancel"
													mode="ghost"
													tone="critical"
													loading={canceling}
													disabled={canceling}
													onClick={cancel}
													style={{ cursor: 'pointer' }}
												/>
											)}
											{isPending ? (
												/* Optimistic — dimmed spinner only; no elapsed time until a real build exists */
												<Spinner muted style={{ marginLeft: 4, opacity: 0.5 }} />
											) : isActive ? (
												<Flex align="center" gap={1}>
													<Spinner muted style={{ marginLeft: 4 }} />
													<Text size={1} muted>{formatDuration(elapsed)}</Text>
												</Flex>
											) : deployedAt ? (
												<Text size={1} muted>{deployedAt}</Text>
											) : null}
										</>
									)}
								</Flex>
								<ActionMenu
									id={`menu-${target._id}`}
									label={`Actions for ${target.name}`}
									buttonIcon={EllipsisVerticalIcon}
									items={[
										{ text: 'Edit target', icon: EditIcon, onClick: () => onEdit(target) },
										{ text: 'History', icon: ClockIcon, onClick: () => setShowHistory(true) },
										...(safeHref(latest?.inspectorUrl)
											? [{ text: 'Build logs', icon: LaunchIcon, href: safeHref(latest?.inspectorUrl)! }]
											: []),
										...(vercelProjectUrl
											? [{ text: 'Open in Vercel', icon: LaunchIcon, href: vercelProjectUrl }]
											: []),
										...(!target.disableDeleteAction
											? [{ text: 'Delete', icon: TrashIcon, tone: 'critical' as const, onClick: () => onDelete(target) }]
											: []),
									]}
								/>
							</Flex>

							{/* ── Divider below title ────────────────────────────── */}
							<hr style={{ border: 'none', borderTop: '1px solid currentColor', opacity: 0.1, margin: 0 }} />

							{/* ── Status + metadata ──────────────────────────────── */}
							{!token ? (
								<Text size={1} muted>
									{pluginConfig.mode === 'proxy'
										? target.proxyKey
											? 'Waiting for status from the deploy proxy.'
											: 'Set a Proxy Key on this target to see deployment status.'
										: 'Connect a Vercel API token to see deployment status.'}
								</Text>
							) : loadingInitial ? (
								<Flex align="center" gap={2}>
									<Spinner muted />
									<Text size={1} muted>Loading…</Text>
								</Flex>
							) : (
								<Stack space={2}>

									{/* Metadata row */}
									<Flex align="center" gap={2} wrap="wrap">

										{/* Visit link + copy URL */}
										{latest?.url && latest.state === 'READY' && (
											<>
												<a
													href={deploymentHref(latest.url)}
													target="_blank"
													rel="noreferrer"
													style={{ color: 'inherit' }}
												>
													<Flex align="center" gap={1}>
														<Text size={1}>{latest.url}</Text>
													</Flex>
												</a>
											</>
										)}

										{/* Commit SHA — links to GitHub if repo info available, tooltip shows full message */}
										{sha && (
											<Tooltip text={commitMsg ?? sha}>
												{commitHref ? (
													<a
														href={commitHref}
														target="_blank"
														rel="noreferrer"
														style={{ color: 'inherit', textDecoration: 'none' }}
													>
														<Text size={1} muted style={{ cursor: 'pointer', fontFamily: 'monospace' }}>
															{sha}
														</Text>
													</a>
												) : (
													<Text size={1} muted style={{ cursor: 'default', fontFamily: 'monospace' }}>
														{sha}
													</Text>
												)}
											</Tooltip>
										)}

										{/* Creator */}
										{creator && <Text size={1} muted>by {creator}</Text>}

										{/* Build duration — only shown when READY and ready timestamp is available */}
										{latest?.state === 'READY' && latest.ready && latest.created && (
											<Text size={1} muted>Took {formatDuration(Math.floor((latest.ready - latest.created) / 1000))} to build</Text>
										)}

										{/* Visit link + copy URL */}
										{latest?.url && latest.state === 'READY' && (
											<>
												<Tooltip text={copied ? 'Copied' : 'Copy deployment URL'}>
													<Button
														mode="ghost"
														icon={copied ? CheckmarkIcon : CopyIcon}
														padding={1}
														tone={copied ? 'positive' : 'default'}
														onClick={copyUrl}
														// The button is icon-only, so it needs its own name — a tooltip
														// describes a control, it does not name it. The name also carries
														// the copied state, since colour and glyph alone do not (1.4.1).
														aria-label={copied ? 'Deployment URL copied' : 'Copy deployment URL'}
														style={{ cursor: 'pointer' }}
													/>
												</Tooltip>
												{/* Announced separately: a changed aria-label is not reliably re-read. */}
												<span
													role="status"
													aria-live="polite"
													style={{
														position: 'absolute',
														width: 1,
														height: 1,
														overflow: 'hidden',
														clip: 'rect(0 0 0 0)',
														whiteSpace: 'nowrap',
													}}
												>
													{copied ? 'Deployment URL copied to clipboard' : ''}
												</span>
											</>
										)}
									</Flex>

									<Flex align="center" gap={2} wrap="wrap">
										{/* Commit message */}
										{commitMsg && (
											<Text
												size={0}
												muted
												style={{ fontStyle: 'italic'}}
											>
												{commitMsg}
											</Text>
										)}

										{/* Error expansion */}
										{isError && (
											<Stack space={2}>
												<Button
													aria-expanded={showErrorLogs}
													text={showErrorLogs ? 'Hide error details' : 'Show error details'}
													mode="ghost"
													tone="critical"
													icon={WarningOutlineIcon}
													fontSize={1}
													padding={2}
													onClick={toggleErrorLogs}
													style={{ alignSelf: 'flex-start', cursor: 'pointer' }}
												/>
												{showErrorLogs && (
													<Card tone="critical" radius={2} padding={3}>
														{loadingLogs && (
															<Flex align="center" gap={2}>
																<Spinner muted />
																<Text size={1} muted>Loading logs…</Text>
															</Flex>
														)}
														{logError && (
															<Stack space={2}>
																<Text size={1}>{logError}</Text>
																{safeHref(latest?.inspectorUrl) && (
																	<a href={safeHref(latest?.inspectorUrl)} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
																		<Flex align="center" gap={1}>
																			<LaunchIcon />
																			<Text size={1}>View full logs in Vercel</Text>
																		</Flex>
																	</a>
																)}
															</Stack>
														)}
														{!loadingLogs && !logError && errorLines.length > 0 && (
															<Stack space={2}>
																<Box style={{ maxHeight: 240, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}>
																	{errorLines.map((line, i) => (
																		<Code key={i} style={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
																			{line}
																		</Code>
																	))}
																</Box>
																{safeHref(latest?.inspectorUrl) && (
																	<a href={safeHref(latest?.inspectorUrl)} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
																		<Flex align="center" gap={1}>
																			<LaunchIcon />
																			<Text size={1}>View full logs in Vercel</Text>
																		</Flex>
																	</a>
																)}
															</Stack>
														)}
													</Card>
												)}
											</Stack>
										)}

										{/* Trigger error */}
										{deployError && (
											<Card tone="critical" padding={2} radius={2}>
												<Text size={1}>{deployError}</Text>
											</Card>
										)}
									</Flex>
								</Stack>
							)}

							{/* Polling failures were previously logged only, so a card that had stopped
							    updating looked identical to an idle one. */}
							{pollError && (
								<Card tone="caution" padding={3} radius={2}>
									<Flex align="center" gap={2}>
										<WarningOutlineIcon aria-hidden="true" />
										<Text size={1}>Status updates paused — {pollError}</Text>
									</Flex>
								</Card>
							)}

						</Stack>

						{/* ── Details accordion — flush to left/bottom/right ─────── */}
						<Box>
							<Button
								mode="ghost"
								iconRight={showDetails ? ChevronUpIcon : ChevronDownIcon}
								aria-expanded={showDetails}
								text="Details"
								fontSize={0}
								padding={3}
								onClick={() => setShowDetails(v => !v)}
								style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, cursor: 'pointer' }}
							/>
							{showDetails && (
								<Card tone="primary" padding={3} className="dvfs-accordion-content" style={{ borderRadius: 0, borderTop: '1px solid rgba(128,128,128,0.15)' }}>
									<Stack space={2}>
										<Flex gap={2} align="center">
											<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Project</Text>
											<Text size={0} muted style={{ fontFamily: 'monospace' }}>{projectId || '—'}</Text>
										</Flex>
										<Flex gap={2} align="center">
											<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Hook</Text>
											<Text size={0} muted style={{ fontFamily: 'monospace' }}>{hookId || '—'}</Text>
										</Flex>
										{target.teamId && (
											<Flex gap={2} align="center">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Team</Text>
												<Text size={0} muted style={{ fontFamily: 'monospace' }}>{target.teamId}</Text>
											</Flex>
										)}
										{fullSha && (
											<Flex gap={2} align="flex-start">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Commit</Text>
												<Text size={0} muted style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{fullSha}</Text>
											</Flex>
										)}
										{latest?.meta?.githubCommitAuthorName && (
											<Flex gap={2} align="center">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Author</Text>
												<Text size={0} muted>{latest.meta.githubCommitAuthorName}</Text>
											</Flex>
										)}
										{branch && (
											<Flex gap={2} align="center">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Branch</Text>
												<Text size={0} muted style={{ fontFamily: 'monospace' }}>{branch}</Text>
											</Flex>
										)}
										{latest?.uid && (
											<Flex gap={2} align="center">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Deploy ID</Text>
												<Text size={0} muted style={{ fontFamily: 'monospace' }}>{latest.uid}</Text>
											</Flex>
										)}
										{latest?.url && (
											<Flex gap={2} align="flex-start">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>URL</Text>
												<Text size={0} muted style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{latest.url}</Text>
											</Flex>
										)}
										{safeHref(latest?.inspectorUrl) && (
											<Flex gap={2} align="center">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Inspector</Text>
												<a href={safeHref(latest?.inspectorUrl)!} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
													<Flex align="center" gap={1}>
														<Text size={0} muted style={{ fontFamily: 'monospace' }}>Open in Vercel</Text>
														<LaunchIcon style={{ width: 10, height: 10 }} />
													</Flex>
												</a>
											</Flex>
										)}
										{latest?.created && (
											<Flex gap={2} align="center">
												<Text size={0} muted weight="semibold" style={{ minWidth: LABEL_WIDTH }}>Created</Text>
												<Text size={0} muted>{new Date(latest.created).toLocaleString()}</Text>
											</Flex>
										)}
									</Stack>
								</Card>
							)}
						</Box>

					</Flex>

					{/* ── Right: action buttons — stretch full card height ── */}
					<Flex
						direction="column"
						gap={2}
						className="dvfs-deploy-col"
						style={{ flexShrink: 0, alignSelf: 'stretch' }}
					>
						<Button
							text="Deploy"
							tone="primary"
							loading={isPending}
							disabled={isActive}
							onClick={deploy}
							style={{
								flex: 1,
								borderRadius: 0,
								borderTopRightRadius: 3,
								borderBottomRightRadius: 3,
								cursor: 'pointer',
							}}
						/>
					</Flex>

				</Flex>
			</Card>

			{showHistory && (
				<DeployHistory
					target={target}
					token={token}
					onClose={() => setShowHistory(false)}
				/>
			)}
		</>
	)
}
