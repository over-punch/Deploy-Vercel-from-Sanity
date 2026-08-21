// Vercel API token form — rendered inside a Dialog by DeployTool
import { useId, useState, useCallback } from 'react'
import { useClient } from 'sanity'
import { CheckmarkCircleIcon } from '../icons'
import { Button, Card, Dialog, Flex, Label, Stack, Text, TextInput } from '../compat'

interface TokenSetupProps {
	/** Called after the token is successfully saved */
	onSaved: () => void
	/** Called when the user dismisses — only available when a token already exists */
	onCancel?: () => void
}

const TOKEN_DOC_ID = 'config.vercelDeploy'

export function TokenSetup({ onSaved, onCancel }: TokenSetupProps) {
	const tokenId = useId()
	const client = useClient({ apiVersion: '2025-01-01' })
	const [token, setToken] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const save = useCallback(async () => {
		if (!token.trim()) return
		setSaving(true)
		setError(null)
		try {
			await client.createOrReplace({
				_id: TOKEN_DOC_ID,
				_type: 'vercelDeploy.config',
				accessToken: token.trim(),
			})
			onSaved()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save token')
		} finally {
			setSaving(false)
		}
	}, [client, token, onSaved])

	return (
		<Dialog
			header="Connect Vercel API token"
			id="token-setup"
			onClose={onCancel}
			width={1}
			footer={
				<Flex padding={3} gap={2} justify="flex-end">
					{onCancel && (
						<Button text="Cancel" mode="ghost" onClick={onCancel} style={{ cursor: 'pointer' }} />
					)}
					<Button
						text="Save and connect"
						tone="primary"
						icon={CheckmarkCircleIcon}
						loading={saving}
						disabled={!token.trim() || saving}
						onClick={save}
						style={{ cursor: 'pointer' }}
					/>
				</Flex>
			}
		>
			<Stack space={4} padding={4}>
				<Stack space={3}>
					<Text size={1} muted>
						A Vercel API token lets this tool read deployment status, history, build logs,
						and branch metadata. Without it you can still trigger deploys — you just won't
						see any feedback.
					</Text>
					<Text size={1} muted>
						Create one at <strong>vercel.com → Settings → Tokens</strong> with{' '}
						<strong>Full Account</strong> scope. The token is stored in your Sanity dataset
						and shared across all authenticated studio users.
					</Text>
				</Stack>

				<Stack space={2}>
					{/* A plain Text is not a label — @sanity/ui's Label needs `as="label"` to render one. */}
					<Label as="label" size={1} htmlFor={tokenId}>Vercel API Token</Label>
					<TextInput
						id={tokenId}
						value={token}
						onChange={e => setToken((e.target as HTMLInputElement).value)}
						placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
						type="password"
					/>
				</Stack>

				{error && (
					<Card tone="critical" padding={3} radius={2} role="alert">
						<Text size={1}>{error}</Text>
					</Card>
				)}
			</Stack>
		</Dialog>
	)
}
