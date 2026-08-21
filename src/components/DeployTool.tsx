// Main deploy tool — fetches targets + token, renders per-project cards
import { useState, useEffect, useCallback } from 'react'
import { useClient } from 'sanity'
import { TokenIcon, TrashIcon, WarningOutlineIcon, AddIcon } from '../icons'
import { DeployItem } from './DeployItem'
import { TokenSetup } from './TokenSetup'
import { DeployTargetForm } from './DeployTargetForm'
import { VERSION } from '../version'
import type { DeployTarget } from '../types'
import { Box, Button, Card, Dialog, Flex, Heading, Spinner, Stack, Text, ToastViewport, useToast } from '../compat'

const TOKEN_QUERY   = `*[_id == "config.vercelDeploy"][0].accessToken`
// `useClient` hands back a raw-perspective client, so drafts are returned alongside published
// documents. `vercel_deploy` is a registered type and therefore editable from Structure, which
// would otherwise render two cards for the same target.
const TARGETS_QUERY = `*[_type == "vercel_deploy" && !(_id in path("drafts.**"))] | order(_createdAt asc)`

export function DeployTool() {
	const client = useClient({ apiVersion: '2025-01-01' })
	const toast  = useToast()

	const [token, setToken]                   = useState<string | null>(null)
	const [targets, setTargets]               = useState<DeployTarget[]>([])
	const [loading, setLoading]               = useState(true)
	const [showTokenSetup, setShowTokenSetup] = useState(false)
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [pendingEdit, setPendingEdit]       = useState<DeployTarget | null>(null)
	const [pendingDelete, setPendingDelete]   = useState<DeployTarget | null>(null)
	const [deleting, setDeleting]             = useState(false)

	// ── Fetch token + targets ─────────────────────────────────────────────────
	const load = useCallback(async () => {
		setLoading(true)
		try {
			const [fetchedToken, fetchedTargets] = await Promise.all([
				client.fetch<string | null>(TOKEN_QUERY),
				client.fetch<DeployTarget[]>(TARGETS_QUERY),
			])
			setToken(fetchedToken ?? null)
			setTargets(fetchedTargets)
		} catch (err) {
			console.error('deploy-vercel-from-sanity: load error', err)
		} finally {
			setLoading(false)
		}
	}, [client])

	useEffect(() => { load() }, [load])

	// Inject responsive styles once on mount
	useEffect(() => {
		// Reference-counted: with two tools mounted, the one that skipped creation must not
		// remove the stylesheet the other is still using.
		const existing = document.getElementById('dvfs-styles')
		if (existing) {
			const n = Number(existing.dataset.refs ?? '1') + 1
			existing.dataset.refs = String(n)
			return () => {
				const left = Number(existing.dataset.refs ?? '1') - 1
				existing.dataset.refs = String(left)
				if (left <= 0) existing.remove()
			}
		}
		const style = document.createElement('style')
		style.id = 'dvfs-styles'
		style.textContent = `
			@media (max-width: 768px) {
				.dvfs-header { flex-wrap: wrap !important; row-gap: 8px !important; }
				.dvfs-header-actions { width: 100% !important; flex-wrap: wrap !important; justify-content: flex-start !important; }
				.dvfs-grid { grid-template-columns: 1fr !important; }
				.dvfs-card-flex { flex-direction: column !important; }
				.dvfs-deploy-col { width: 100% !important; align-self: auto !important; }
				.dvfs-deploy-col button { border-radius: 3px !important; }
			}
			@keyframes dvfs-open {
				from { opacity: 0; transform: translateY(-4px); }
				to   { opacity: 1; transform: translateY(0); }
			}
			.dvfs-accordion-content {
				animation: dvfs-open 0.15s ease-out;
			}
		`
		document.head.appendChild(style)
		style.dataset.refs = '1'
		return () => {
			const left = Number(style.dataset.refs ?? '1') - 1
			style.dataset.refs = String(left)
			if (left <= 0) style.remove()
		}
	}, [])

	// Live subscription — update targets when documents change
	useEffect(() => {
		const sub = client
			.listen<DeployTarget>(TARGETS_QUERY)
			.subscribe(() => {
				client.fetch<DeployTarget[]>(TARGETS_QUERY).then(setTargets).catch(err => {
					console.error('deploy-vercel-from-sanity: subscription refresh error', err)
				})
			})
		return () => sub.unsubscribe()
	}, [client])

	// ── Delete target ─────────────────────────────────────────────────────────
	const confirmDelete = useCallback(async () => {
		if (!pendingDelete) return
		setDeleting(true)
		try {
			// Remove the draft counterpart as well; deleting only the published id leaves the
			// target behind and it reappears on the next load.
			await client.delete(pendingDelete._id)
			await client.delete(`drafts.${pendingDelete._id}`).catch(() => {})
			setTargets(prev => prev.filter(t => t._id !== pendingDelete._id))
			toast.push({ status: 'success', title: `Deleted "${pendingDelete.name}"` })
		} catch (err) {
			toast.push({ status: 'error', title: 'Delete failed', description: String(err) })
		} finally {
			setDeleting(false)
			setPendingDelete(null)
		}
	}, [client, pendingDelete, toast])

	// ── Render ────────────────────────────────────────────────────────────────
	if (loading) {
		return (
			<Card height="fill" tone="transparent">
				<Flex align="center" justify="center" height="fill">
					<Spinner muted />
				</Flex>
			</Card>
		)
	}

	return (
		<Card height="fill" tone="transparent">
			<Box padding={5}>
				<Stack space={5}>

					{/* ── Header ──────────────────────────────────────────────── */}
					<Flex align="center" justify="space-between" className="dvfs-header">
						<Heading size={2}>Deploy with Vercel</Heading>
						<Flex align="center" gap={3} className="dvfs-header-actions">
							<Button
								text={token ? 'Token connected' : 'Connect API token'}
								mode="ghost"
								icon={TokenIcon}
								fontSize={1}
								tone={token ? 'positive' : 'caution'}
								onClick={() => setShowTokenSetup(true)}
								style={{ cursor: 'pointer' }}
							/>
							<Button
								text="Add target"
								mode="ghost"
								icon={AddIcon}
								fontSize={1}
								onClick={() => setShowCreateForm(true)}
								style={{ cursor: 'pointer' }}
							/>
						</Flex>
					</Flex>

					{/* ── No-token upgrade banner ──────────────────────────────── */}
					{!token && (
						<Card padding={4} radius={2} tone="caution" shadow={1}>
							<Flex align="center" justify="space-between" gap={4}>
								<Stack space={2}>
									<Text size={1} weight="semibold">Deploy status is not connected</Text>
									<Text size={1} muted>
										You can trigger deploys now. Connect a Vercel API token to also see
										deployment status, build logs, history, and commit metadata.
									</Text>
								</Stack>
								<Button
									text="Connect"
									tone="caution"
									fontSize={1}
									onClick={() => setShowTokenSetup(true)}
									style={{ cursor: 'pointer', flexShrink: 0 }}
								/>
							</Flex>
						</Card>
					)}

					{/* ── No targets ──────────────────────────────────────────── */}
					{targets.length === 0 && (
						<Card padding={5} radius={2} tone="transparent" shadow={1}>
							<Stack space={4} style={{ textAlign: 'center' }}>
								<Text size={2} weight="semibold">No deploy targets configured</Text>
								<Text size={1} muted>
									Add a deploy target using the button above, or create a{' '}
									<code>vercel_deploy</code> document directly in the dataset.
								</Text>
								<Flex justify="center">
									<Button
										text="Add deploy target"
										tone="primary"
										icon={AddIcon}
										onClick={() => setShowCreateForm(true)}
										style={{ cursor: 'pointer' }}
									/>
								</Flex>
							</Stack>
						</Card>
					)}

					{/* ── Deploy targets — responsive 2-col grid ──────────────── */}
					{targets.length > 0 && (
						<div className="dvfs-grid" style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill, minmax(min(540px, 100%), 1fr))',
							gap: '16px',
							alignItems: 'start',
						}}>
							{targets.map(target => (
								<DeployItem
									key={target._id}
									target={target}
									token={token ?? ''}
									onDelete={setPendingDelete}
									onEdit={setPendingEdit}
								/>
							))}
						</div>
					)}

				</Stack>
			</Box>

			{/* ── Version watermark ──────────────────────────────────────────── */}
			<Box
				style={{
					position: 'fixed',
					bottom: 12,
					right: 16,
					opacity: 0.25,
					pointerEvents: 'none',
					userSelect: 'none',
				}}
			>
				<Text size={0} muted>v{VERSION}</Text>
			</Box>

			{/* ── Token setup dialog ──────────────────────────────────────────── */}
			{/* The token dialog is always dismissable. Withholding Cancel on first run —
			    exactly when the user may not have a token to hand — made it a keyboard trap,
			    since Sanity's Dialog holds focus and Escape was wired to the absent handler. */}
			{showTokenSetup && (
				<TokenSetup
					onSaved={() => { setShowTokenSetup(false); load() }}
					onCancel={() => setShowTokenSetup(false)}
					hasToken={Boolean(token)}
				/>
			)}

			{/* ── Create form ─────────────────────────────────────────────────── */}
			{showCreateForm && (
				<DeployTargetForm
					onSaved={() => { setShowCreateForm(false); toast.push({ status: 'success', title: 'Deploy target added' }) }}
					onClose={() => setShowCreateForm(false)}
				/>
			)}

			{/* ── Edit form ───────────────────────────────────────────────────── */}
			{pendingEdit && (
				<DeployTargetForm
					initial={pendingEdit}
					onSaved={() => { setPendingEdit(null); toast.push({ status: 'success', title: 'Deploy target updated' }) }}
					onClose={() => setPendingEdit(null)}
				/>
			)}

			{/* ── Delete confirmation ─────────────────────────────────────────── */}
			{pendingDelete && (
				<Dialog
					header="Delete deploy target?"
					id="confirm-delete"
					onClose={() => setPendingDelete(null)}
					width={1}
					footer={
						<Flex padding={3} gap={2} justify="flex-end">
							<Button
								text="Cancel"
								mode="ghost"
								onClick={() => setPendingDelete(null)}
								style={{ cursor: 'pointer' }}
							/>
							<Button
								text="Delete"
								tone="critical"
								icon={TrashIcon}
								loading={deleting}
								disabled={deleting}
								onClick={confirmDelete}
								style={{ cursor: 'pointer' }}
							/>
						</Flex>
					}
				>
					<Box padding={4}>
						<Stack space={3}>
							<Flex align="center" gap={2}>
								<WarningOutlineIcon />
								<Text size={2} weight="semibold">{pendingDelete.name}</Text>
							</Flex>
							<Text size={1} muted>
								This removes the deploy target from the dataset. The Vercel deploy hook
								itself is not affected.
							</Text>
						</Stack>
					</Box>
				</Dialog>
			)}

			{/* Fallback toast surface — renders nothing when @sanity/ui exports its own useToast */}
			<ToastViewport />
		</Card>
	)
}
