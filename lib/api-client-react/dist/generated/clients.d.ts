import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";
import type { ErrorType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export interface Client {
    id: string;
    name: string;
    website?: string | null;
    industry?: string | null;
    headquarters?: string | null;
    logoUrl?: string | null;
    overallHiringTrend?: string | null;
    branchCount?: number;
    createdAt?: string;
    updatedAt?: string;
}
export interface ClientBranch {
    id: string;
    clientId: string;
    name?: string | null;
    city?: string | null;
    country: string;
    state?: string | null;
    address?: string | null;
    branchType: string;
    lastResearched?: string | null;
    hiringTrendSummary?: string | null;
    hiringTrendDirection?: string | null;
    postingCount?: string | null;
    sourceUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
}
export interface BranchHiringPost {
    id: string;
    branchId: string;
    clientId: string;
    title: string;
    department?: string | null;
    url?: string | null;
    postedDate?: string | null;
    source?: string | null;
    rawJson?: string | null;
    createdAt?: string;
}
export interface ClientsResponse {
    clients: Client[];
}
export interface ClientDetailResponse {
    client: Client;
    branches: ClientBranch[];
}
export interface ResearchBranchesResponse {
    branches: ClientBranch[];
    added: number;
    total: number;
    errors: string[];
}
export interface BranchHiringResponse {
    branch: ClientBranch;
    posts: BranchHiringPost[];
}
export interface RefreshHiringResponse {
    branch: ClientBranch;
    posts: BranchHiringPost[];
    stats: {
        postsFound: number;
        trendDirection: string;
        overallClientTrend: string;
    };
    errors: string[];
}
export declare const getListClientsUrl: () => string;
export declare const listClients: (options?: RequestInit) => Promise<ClientsResponse>;
export declare const getListClientsQueryKey: () => readonly ["/api/clients"];
export declare const getListClientsQueryOptions: <TData = Awaited<ReturnType<typeof listClients>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare function useListClients<TData = Awaited<ReturnType<typeof listClients>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetClientUrl: (id: string) => string;
export declare const getClient: (id: string, options?: RequestInit) => Promise<ClientDetailResponse>;
export declare const getGetClientQueryKey: (id: string) => readonly [`/api/clients/${string}`];
export declare const getGetClientQueryOptions: <TData = Awaited<ReturnType<typeof getClient>>, TError = ErrorType<unknown>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare function useGetClient<TData = Awaited<ReturnType<typeof getClient>>, TError = ErrorType<unknown>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getResearchBranchesUrl: (id: string) => string;
export declare const researchBranches: (id: string, options?: RequestInit) => Promise<ResearchBranchesResponse>;
export declare const getResearchBranchesMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof researchBranches>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof researchBranches>>, TError, {
    id: string;
}, TContext>;
export declare function useResearchBranches<TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof researchBranches>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof researchBranches>>, TError, {
    id: string;
}, TContext>;
export declare const getGetBranchHiringUrl: (id: string, branchId: string) => string;
export declare const getBranchHiring: (id: string, branchId: string, options?: RequestInit) => Promise<BranchHiringResponse>;
export declare const getGetBranchHiringQueryKey: (id: string, branchId: string) => readonly [`/api/clients/${string}/branches/${string}/hiring`];
export declare const getGetBranchHiringQueryOptions: <TData = Awaited<ReturnType<typeof getBranchHiring>>, TError = ErrorType<unknown>>(id: string, branchId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBranchHiring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getBranchHiring>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare function useGetBranchHiring<TData = Awaited<ReturnType<typeof getBranchHiring>>, TError = ErrorType<unknown>>(id: string, branchId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBranchHiring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getRefreshBranchHiringUrl: (id: string, branchId: string) => string;
export declare const refreshBranchHiring: (id: string, branchId: string, options?: RequestInit) => Promise<RefreshHiringResponse>;
export declare const getRefreshBranchHiringMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof refreshBranchHiring>>, TError, {
        id: string;
        branchId: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof refreshBranchHiring>>, TError, {
    id: string;
    branchId: string;
}, TContext>;
export declare function useRefreshBranchHiring<TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof refreshBranchHiring>>, TError, {
        id: string;
        branchId: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof refreshBranchHiring>>, TError, {
    id: string;
    branchId: string;
}, TContext>;
export {};
//# sourceMappingURL=clients.d.ts.map