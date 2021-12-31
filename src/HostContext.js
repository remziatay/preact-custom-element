import { createContext } from 'preact';

export const HostContext = createContext({
	host: null,
	shadowRoot: null,
	isParsed: false,
	defaultContext: true,
});
