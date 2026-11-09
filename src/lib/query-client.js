import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Erros de unidade operacional (registro de outra unidade / unidade
			// somente leitura — src/lib/unitScope.js) não mudam ao repetir.
			retry: (failureCount, error) => !error?.isUnitScopeError && failureCount < 1,
		},
	},
});