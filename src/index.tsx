// deploy-vercel-from-sanity — Sanity Studio plugin for Vercel deployments (Studio v3.30 through v6)
import { definePlugin } from 'sanity'
import { RocketIcon } from './icons'
import { DeployTool } from './components/DeployTool'
import { ConfigProvider, resolveConfig } from './config'
import { vercelDeploySchema } from './schema/vercelDeploy'
import type { VercelDeployPluginConfig } from './types'

export { vercelDeploySchema } from './schema/vercelDeploy'
export type {
	VercelDeployPluginConfig,
	VercelDeployMode,
	DeployTarget,
	VercelDeployment,
	VercelDeployState,
} from './types'

/**
 * Sanity Studio plugin — trigger and monitor Vercel deployments.
 *
 * Supports Studio v3.30 through v6 from a single build; see the compatibility
 * table in the README for how @sanity/ui and @sanity/icons are resolved.
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
	const resolved = resolveConfig(options)
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
				// Wrapped so the tool tree can read the resolved config without prop drilling.
				component: () => (
					<ConfigProvider value={resolved}>
						<DeployTool />
					</ConfigProvider>
				),
			},
		],
	}
})
