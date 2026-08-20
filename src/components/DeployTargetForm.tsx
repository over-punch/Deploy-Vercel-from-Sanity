// Dialog form for creating and editing vercel_deploy documents
import { useState, useCallback } from 'react'
import { useClient } from 'sanity'
import {
	Dialog, Box, Flex, Text, TextInput, Button, Switch, Label, Card,
} from '@sanity/ui'
import { Stack } from '../ui'
import { CheckmarkCircleIcon } from '../icons'
import type { DeployTarget } from '../types'

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

	const [name, setName]                       = useState(initial?.name ?? '')
	const [url, setUrl]                         = useState(initial?.url ?? '')
	const [teamId, setTeamId]                   = useState(initial?.teamId ?? '')
	const [disableDelete, setDisableDelete]     = useState(initial?.disableDeleteAction ?? false)
	const [saving, setSaving]                   = useState(false)
	const [error, setError]                     = useState<string | null>(null)

	const urlValid = !url || VERCEL_HOOK_RE.test(url.trim())
	const canSave  = name.trim() && url.trim() && urlValid

	const save = useCallback(async () => {
		if (!canSave) return
		setSaving(true)
		setError(null)
		const fields: { name: string; url: string; teamId: string | null; disableDeleteAction: boolean } = {
			name:                name.trim(),
			url:                 url.trim(),
			teamId:              teamId.trim() || null,
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
	}, [canSave, isEdit, initial, client, name, url, teamId, disableDelete, onSaved])

	return (
		<Dialog
			header={isEdit ? `Edit "${initial?.name}"` : 'Add deploy target'}
			id="deploy-target-form"
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

					{/* Name */}
					<Stack space={2}>
						<Label size={1}>Name <span style={{ color: 'var(--card-fg-color)' }}>*</span></Label>
						<TextInput
							value={name}
							onChange={e => setName((e.target as HTMLInputElement).value)}
							placeholder="Production"
						/>
					</Stack>

					{/* Deploy hook URL */}
					<Stack space={2}>
						<Label size={1}>Deploy hook URL <span style={{ color: 'var(--card-fg-color)' }}>*</span></Label>
						<TextInput
							value={url}
							onChange={e => setUrl((e.target as HTMLInputElement).value)}
							placeholder="https://api.vercel.com/v1/integrations/deploy/…"
						/>
						{url && !urlValid && (
							<Text size={1} style={{ color: 'var(--card-critical-fg-color, red)' }}>
								Must be a Vercel deploy hook URL (api.vercel.com/v1/integrations/deploy/…)
							</Text>
						)}
						<Text size={0} muted>
							Vercel dashboard → Project → Settings → Git → Deploy Hooks
						</Text>
					</Stack>

					{/* Team ID */}
					<Stack space={2}>
						<Label size={1}>Team ID <span style={{ opacity: 0.5, fontWeight: 'normal' }}>— optional</span></Label>
						<TextInput
							value={teamId}
							onChange={e => setTeamId((e.target as HTMLInputElement).value)}
							placeholder="team_xxxxxxxx"
						/>
						<Text size={0} muted>
							Required for team-owned Vercel projects. Find it at Vercel → Settings → General → Team ID (starts with <code>team_</code>).
						</Text>
					</Stack>

					{/* Disable delete */}
					<Flex align="center" gap={3}>
						<Switch
							checked={disableDelete}
							onChange={e => setDisableDelete((e.target as HTMLInputElement).checked)}
							id="disable-delete"
						/>
						<Stack space={1}>
							<Label as="label" size={1} htmlFor="disable-delete">Disable delete action</Label>
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
