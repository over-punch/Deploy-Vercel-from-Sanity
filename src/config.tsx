// Resolved plugin configuration, shared with the tool's component tree
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { VercelDeployMode, VercelDeployPluginConfig } from './types'

/** Plugin config with defaults applied, as the components consume it. */
export interface ResolvedConfig {
	mode: VercelDeployMode
	proxyUrl?: string
	statusKey?: string
}

const DEFAULTS: ResolvedConfig = { mode: 'direct' }

const ConfigContext = createContext<ResolvedConfig>(DEFAULTS)

/**
 * Apply defaults and normalise the proxy URL.
 *
 * @param options Raw options passed to `vercelDeploy()`.
 */
export function resolveConfig(options: VercelDeployPluginConfig | void): ResolvedConfig {
	const config = options ?? {}
	return {
		mode: config.mode ?? 'direct',
		// Trailing slashes would double up when request paths are appended.
		proxyUrl: config.proxyUrl?.replace(/\/+$/, ''),
		statusKey: config.statusKey,
	}
}

/** Provides the resolved config to the tool's component tree. */
export function ConfigProvider({ value, children }: { value: ResolvedConfig; children: ReactNode }): React.JSX.Element {
	return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

/** Read the resolved plugin config. Defaults to direct mode outside a provider. */
export function usePluginConfig(): ResolvedConfig {
	return useContext(ConfigContext)
}
