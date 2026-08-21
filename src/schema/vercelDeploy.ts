// Sanity schema for vercel_deploy documents — stores deploy hook targets
import { defineField, defineType } from 'sanity'
import { SchemaRocketIcon } from './schemaIcon'

export const vercelDeploySchema = defineType({
	name: 'vercel_deploy',
	title: 'Deploy Target',
	type: 'document',
	icon: SchemaRocketIcon,
	fields: [
		defineField({
			name: 'name',
			title: 'Name',
			type: 'string',
			description: 'Display label shown in the Deploy tool (e.g. "Production", "Staging")',
			validation: Rule => Rule.required(),
		}),
		defineField({
			name: 'url',
			title: 'Deploy Hook URL',
			type: 'url',
			description:
				'From Vercel → Project Settings → Git → Deploy Hooks. Leave empty in proxy mode and set Proxy Key instead — a hook URL is itself a deploy credential, so anyone who can read this dataset can trigger a build with it.',
			validation: Rule =>
				Rule.uri({ scheme: ['https'] }).custom((url, context) => {
					const doc = context.document as { proxyKey?: string } | undefined
					// One of the two is required: a hook URL for direct mode, a key for proxy mode.
					if (!url && !doc?.proxyKey) return 'Set either a Deploy Hook URL or a Proxy Key'
					if (!url) return true
					if (typeof url !== 'string') return true
					if (!url.includes('api.vercel.com/v1/integrations/deploy/')) {
						return 'Must be a Vercel deploy hook URL (api.vercel.com/v1/integrations/deploy/…)'
					}
					return true
				}),
		}),
		defineField({
			name: 'proxyKey',
			title: 'Proxy Key',
			type: 'string',
			description:
				'Used in proxy mode. Matches a key configured on the deploy proxy, which holds the real hook URL. Contains no secret.',
			validation: Rule =>
				Rule.custom((key, context) => {
					const doc = context.document as { url?: string } | undefined
					if (!key && !doc?.url) return 'Set either a Deploy Hook URL or a Proxy Key'
					return true
				}),
		}),
		defineField({
			name: 'teamId',
			title: 'Vercel Team ID',
			type: 'string',
			description: 'Required for team-owned projects — find it in Vercel Team Settings',
		}),
		defineField({
			name: 'disableDeleteAction',
			title: 'Prevent deletion',
			type: 'boolean',
			description: 'Lock this target so it cannot be deleted from the Studio',
			initialValue: false,
		}),
	],
	preview: {
		select: { title: 'name', subtitle: 'url' },
	},
})
