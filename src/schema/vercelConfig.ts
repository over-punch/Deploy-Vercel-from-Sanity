// Sanity schema for the vercelDeploy.config singleton that holds the Vercel API token
import { defineField, defineType } from 'sanity'

/**
 * Registers the document the plugin stores its Vercel token in.
 *
 * The document was previously written without a registered type, which made it
 * invisible to Structure, absent from schema extraction, and impossible to
 * inspect or revoke from inside the Studio. Registering it does not change where
 * the token lives — see the security note in the README about dataset read
 * access — but it does make the credential visible and removable.
 */
export const vercelConfigSchema = defineType({
	name: 'vercelDeploy.config',
	title: 'Vercel Deploy Configuration',
	type: 'document',
	fields: [
		defineField({
			name: 'accessToken',
			title: 'Vercel API Token',
			type: 'string',
			description:
				'Readable by anyone who can read this dataset. Delete this document to revoke the stored token.',
		}),
	],
	preview: {
		select: { token: 'accessToken' },
		prepare: ({ token }: { token?: string }) => ({
			title: 'Vercel API Token',
			// Never render the secret itself in a preview.
			subtitle: token ? 'Connected' : 'Not set',
		}),
	},
})
