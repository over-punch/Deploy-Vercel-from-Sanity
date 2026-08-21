// Dialog form for creating and editing vercel_deploy documents
import { useId, useState, useCallback } from 'react'
import { useClient } from 'sanity'
import { usePluginConfig } from '../config'
import { CheckmarkCircleIcon } from '../icons'
import type { DeployTarget } from '../types'
import { Box, Button, Card, Dialog, Flex, Label, Stack, Switch, Text, TextInput } from '../compat'

const VERCEL_HOOK_RE = /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//

interface DeployTargetFormProps {
	/** When provided, form is in edit mode; otherwise create mode */
	initial?: DeployTarget
	onSaved: () => void
	onClose: () => void
}

export function DeployTargetForm({ initial, onSaved, onClose }: DeployTargetFormProps) {
	const client = useClient({ apiVersion: '2025-01-01' })
	const isEdit = Boolean(initial)

	// Ids for label/description association. useId keeps them unique inside a published
	// plugin, where a hardcoded id can collide with anything the host Studio renders.
	const pluginConfig = usePluginConfig()
	const proxyKeyId  = useId()
	const dialogId    = useId()
	const nameId      = useId()
	const urlId       = useId()
	const urlErrorId  = useId()
	const urlHelpId   = useId()
	const teamId_     = useId()
	const teamHelpId  = useId()
	const disableId   = useId()

	const [name, setName]                       = useState(initial?.name ?? '')
	const [url, setUrl]                         = useState(initial?.url ?? '')
	const [teamId, setTeamId]                   = useState(initial?.teamId ?? '')
	const [proxyKey, setProxyKey] = useState(initial?.proxyKey ?? '')
	const [disableDelete, setDisableDelete]     = useState(initial?.disableDeleteAction ?? false)
	const [saving, setSaving]                   = useState(false)
	const [error, setError]                     = useState<string | null>(null)

	const urlValid = !url || VERCEL_HOOK_RE.test(url.trim())
	const isProxy  = pluginConfig.mode === 'proxy'
	const canSave  = Boolean(name.trim()) && urlValid && (isProxy ? Boolean(proxyKey.trim()) : Boolean(url.trim()))

	const save = useCallback(async () => {
		if (!canSave) return
		setSaving(true)
		setError(null)
		const fields: { name: string; url: string; teamId: string | null; proxyKey: string | null; disableDeleteAction: boolean } = {
			name:                name.trim(),
			url:                 url.trim(),
			teamId:              teamId.trim() || null,
			proxyKey:            proxyKey.trim() || null,
			disableDeleteAction: disableDelete,
		}
		try {
			if (isEdit && initial) {
				await client.patch(initial._id).set(fields).commit()
			} else {
				await client.create({ _type: 'vercel_deploy', ...fields })
			}
			onSaved()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Save failed')
		} finally {
			setSaving(false)
		}
	}, [canSave, isEdit, initial, client, name, url, teamId, proxyKey, disableDelete, onSaved])

	return (
		<Dialog
			header={isEdit ? `Edit "${initial?.name}"` : 'Add deploy target'}
			id={dialogId}
			onClose={onClose}
			width={1}
			footer={
				<Flex padding={3} gap={2} justify="flex-end">
					<Button text="Cancel" mode="ghost" onClick={onClose} style={{ cursor: 'pointer' }} />
					<Button
						text={isEdit ? 'Save changes' : 'Add target'}
						tone="primary"
						icon={CheckmarkCircleIcon}
						loading={saving}
						disabled={!canSave || saving}
						onClick={save}
						style={{ cursor: 'pointer' }}
					/>
				</Flex>
			}
		>
			<Box padding={4}>
				<Stack space={4}>

					{/* Name. Label carries `as="label"` — @sanity/ui's Label renders a div otherwise,
					    so the input would have no accessible name. */}
					<Stack space={2}>
						<Label as="label" size={1} htmlFor={nameId}>
							Name <span aria-hidden="true">*</span>
						</Label>
						<TextInput
							id={nameId}
							required
							aria-required="true"
							value={name}
							onChange={e => setName((e.target as HTMLInputElement).value)}
							placeholder="Production"
						/>
					</Stack>

					{/* Deploy hook URL — direct mode only. In proxy mode the hook URL lives on
					    the proxy, so that reading this dataset does not hand anyone a deploy. */}
					{isProxy ? (
						<Stack space={2}>
							<Label as="label" size={1} htmlFor={proxyKeyId}>
								Proxy Key <span aria-hidden="true">*</span>
							</Label>
							<TextInput
								id={proxyKeyId}
								required
								aria-required="true"
								value={proxyKey}
								onChange={e => setProxyKey((e.target as HTMLInputElement).value)}
								placeholder="production"
							/>
							<Text size={0} muted>
								Matches a key configured on your deploy proxy, which holds the real hook URL. Contains no secret.
							</Text>
						</Stack>
					) : (
					<Stack space={2}>
						<Label as="label" size={1} htmlFor={urlId}>
							Deploy hook URL <span aria-hidden="true">*</span>
						</Label>
						<TextInput
							id={urlId}
							required
							aria-required="true"
							aria-invalid={Boolean(url) && !urlValid}
							aria-describedby={`${urlHelpId}${url && !urlValid ? ` ${urlErrorId}` : ''}`}
							value={url}
							onChange={e => setUrl((e.target as HTMLInputElement).value)}
							placeholder="https://api.vercel.com/v1/integrations/deploy/…"
						/>
						{url && !urlValid && (
							<Card tone="critical" padding={2} radius={2} role="alert">
								<Text id={urlErrorId} size={1}>
									Must be a Vercel deploy hook URL (api.vercel.com/v1/integrations/deploy/…)
								</Text>
							</Card>
						)}
						<Text id={urlHelpId} size={0} muted>
							Vercel dashboard → Project → Settings → Git → Deploy Hooks
						</Text>
					</Stack>
					)}

					{/* Team ID */}
					<Stack space={2}>
						<Label as="label" size={1} htmlFor={teamId_}>
							Team ID <span style={{ opacity: 0.5, fontWeight: 'normal' }}>— optional</span>
						</Label>
						<TextInput
							id={teamId_}
							aria-describedby={teamHelpId}
							value={teamId}
							onChange={e => setTeamId((e.target as HTMLInputElement).value)}
							placeholder="team_xxxxxxxx"
						/>
						<Text id={teamHelpId} size={0} muted>
							{isProxy
								? 'Not used in proxy mode — the proxy supplies the team from its own configuration.'
								: 'Required for team-owned Vercel projects. Find it at Vercel → Settings → General → Team ID (starts with team_).'}
						</Text>
					</Stack>

					{/* Disable delete */}
					<Flex align="center" gap={3}>
						<Switch
							checked={disableDelete}
							onChange={e => setDisableDelete((e.target as HTMLInputElement).checked)}
							id={disableId}
						/>
						<Stack space={1}>
							<Label as="label" size={1} htmlFor={disableId}>Disable delete action</Label>
							<Text size={0} muted>Hides the delete button for this target in the studio.</Text>
						</Stack>
					</Flex>

					{error && (
						<Card tone="critical" padding={3} radius={2}>
							<Text size={1}>{error}</Text>
						</Card>
					)}

				</Stack>
			</Box>
		</Dialog>
	)
}
