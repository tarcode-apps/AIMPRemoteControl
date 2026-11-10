import { useMutation, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';

// A query's data as it was and as a mutation predicted it to become.
export type Prediction<T = unknown> = { queryKey: QueryKey; previous: T; predicted: T };

// What was put in the cache here, as opposed to what the server said.
const predictions = new WeakSet<object>();

export function predict<T extends object>(client: QueryClient, queryKey: QueryKey, previous: T, predicted: T) {
    predictions.add(predicted);
    client.setQueryData(queryKey, predicted);
    return { queryKey, previous, predicted };
}

export function isPrediction(data: unknown): boolean {
    return typeof data === 'object' && data !== null && predictions.has(data);
}

// Takes back the predictions the cache still shows: the server's own events may
// have brought newer state meanwhile, which a stale copy must not undo.
export function revert(client: QueryClient, predictions: Prediction[]) {
    for (const { queryKey, previous, predicted } of predictions)
        if (client.getQueryData(queryKey) === predicted) client.setQueryData(queryKey, previous);
}

// A mutation whose outcome is shown at once and taken back if the request fails;
// the server's own version arrives through its event either way. A prediction
// that returns nothing leaves the cache alone.
export function useOptimisticMutation<TData extends object, TVariables>(
    queryKey: QueryKey,
    mutationFn: (variables: TVariables) => Promise<unknown>,
    predictData: (data: TData, variables: TVariables) => TData | undefined,
) {
    const client = useQueryClient();
    return useMutation({
        mutationFn,
        onMutate: async variables => {
            await client.cancelQueries({ queryKey });
            const previous = client.getQueryData<TData>(queryKey);
            const predicted = previous && predictData(previous, variables);
            return predicted ? [predict(client, queryKey, previous, predicted)] : [];
        },
        onError: (_error, _variables, predictions) => revert(client, predictions ?? []),
    });
}
