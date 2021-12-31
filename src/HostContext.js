import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const HostContext = createContext({
	host: null,
	shadowRoot: null,
	isParsed: false,
	defaultContext: true,
});
export function useHost() {
	const context = useContext(HostContext);
	if (context.defaultContext) {
		throw new Error('useHost must be used within a HostContext provider');
	}
	return context;
}
