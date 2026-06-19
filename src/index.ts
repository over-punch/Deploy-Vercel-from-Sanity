// deploy-vercel-from-sanity — Sanity Studio v5 plugin for Vercel deployments
import { definePlugin } from 'sanity'
import { RocketIcon } from '@sanity/icons'
import { DeployTool } from './components/DeployTool'
import { vercelDeploySchema } from './schema/vercelDeploy'
import type { VercelDeployPluginConfig } from './types'

export { vercelDeploySchema } from './schema/vercelDeploy'
export type { VercelDeployPluginConfig, DeployTarget, VercelDeployment, VercelDeployState } from './types'

/**
 * Sanity Studio v5 plugin — trigger and monitor Vercel deployments.
 *
 * @example
 * // sanity.config.ts
 * import { vercelDeploy } from '@liiift-studio/deploy-vercel-from-sanity'
 *
 * export default defineConfig({
 *   plugins: [
 *     vercelDeploy(),
 *     // or with options:
 *     vercelDeploy({ title: 'Deploy', name: 'vercel-deploy' }),
 *   ],
 * })
 */
export const vercelDeploy = definePlugin<VercelDeployPluginConfig | void>(options => {
	const config = options ?? {}
	return {
		name: 'deploy-vercel-from-sanity',
		schema: {
			types: [vercelDeploySchema],
		},
		tools: [
			{
				name: config.name ?? 'vercel-deploy',
				title: config.title ?? 'Deploy',
				icon: config.icon ?? RocketIcon,
				component: DeployTool,
			},
		],
	}
})
