// Resolved plugin configuration, shared with the tool's component tree
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { UnblockConfig, VercelDeployMode, VercelDeployPluginConfig } from './types'

/** Plugin config with defaults applied, as the components consume it. */
export interface ResolvedConfig {
	mode: VercelDeployMode
	proxyUrl?: string
	statusKey?: string
	/** Present only when deploy recovery is both configured and given a token. */
	unblock?: UnblockConfig
}

const DEFAULTS: ResolvedConfig = { mode: 'direct' }

const ConfigContext = createContext<ResolvedConfig>(DEFAULTS)

/**
 * True when an unblock config names a route to call, or everything needed to
 * dispatch a workflow. Anything less cannot produce a working button.
 */
function isUsableUnblock(unblock: UnblockConfig | undefined): boolean {
	if (!unblock) return false
	if (unblock.endpoint) return true
	return Boolean(unblock.token && unblock.owner && unblock.repo)
}

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
		// Dropped unless it can actually be used, so an incomplete configuration renders
		// no button rather than one whose only outcome is an error. Either mode will do:
		// an `endpoint` needs nothing else, while workflow dispatch needs all three of
		// token, owner and repo to build an authenticated request.
		unblock: isUsableUnblock(config.unblock) ? config.unblock : undefined,
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
