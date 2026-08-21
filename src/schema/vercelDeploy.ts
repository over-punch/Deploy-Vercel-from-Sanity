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
			description: 'From Vercel → Project Settings → Git → Deploy Hooks',
			validation: Rule =>
				Rule.required().uri({ scheme: ['https'] }).custom(url => {
					if (typeof url !== 'string') return true
					if (!url.includes('api.vercel.com/v1/integrations/deploy/')) {
						return 'Must be a Vercel deploy hook URL (api.vercel.com/v1/integrations/deploy/…)'
					}
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
