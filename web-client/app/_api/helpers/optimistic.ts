import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

// A mutation whose outcome is shown at once and taken back if the request fails;
// the server's own version arrives through its event either way. A prediction
// that returns nothing leaves the cache alone.
export function useOptimisticMutation<TData, TVariables>(
    queryKey: QueryKey,
    mutationFn: (variables: TVariables) => Promise<unknown>,
    predict: (data: TData, variables: TVariables) => TData | undefined,
) {
    const client = useQueryClient();
    return useMutation({
        mutationFn,
        onMutate: async variables => {
            await client.cancelQueries({ queryKey });
            const previous = client.getQueryData<TData>(queryKey);
            const predicted = previous && predict(previous, variables);
            if (predicted) client.setQueryData(queryKey, predicted);
            return { previous, predicted };
        },
        onError: (_error, _variables, context) => {
            if (context?.predicted && client.getQueryData(queryKey) === context.predicted)
                client.setQueryData(queryKey, context.previous);
        },
    });
}
