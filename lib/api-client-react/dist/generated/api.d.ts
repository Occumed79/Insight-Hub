import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { ApiError, DeleteOpportunity200, FetchOpportunitiesBody, FetchResult, HealthStatus, ImportOpportunitiesFromCsvBody, ImportResult, ListOpportunitiesParams, OpportunitiesResponse, Opportunity, ProvidersResponse, Settings, SettingsUpdate, UpdateProvider200, UpdateProviderBody } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * Returns server health status
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List opportunities
 */
export declare const getListOpportunitiesUrl: (params?: ListOpportunitiesParams) => string;
export declare const listOpportunities: (params?: ListOpportunitiesParams, options?: RequestInit) => Promise<OpportunitiesResponse>;
export declare const getListOpportunitiesQueryKey: (params?: ListOpportunitiesParams) => readonly ["/api/opportunities", ...ListOpportunitiesParams[]];
export declare const getListOpportunitiesQueryOptions: <TData = Awaited<ReturnType<typeof listOpportunities>>, TError = ErrorType<unknown>>(params?: ListOpportunitiesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOpportunities>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listOpportunities>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListOpportunitiesQueryResult = NonNullable<Awaited<ReturnType<typeof listOpportunities>>>;
export type ListOpportunitiesQueryError = ErrorType<unknown>;
/**
 * @summary List opportunities
 */
export declare function useListOpportunities<TData = Awaited<ReturnType<typeof listOpportunities>>, TError = ErrorType<unknown>>(params?: ListOpportunitiesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOpportunities>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Fetch from one or more configured sources
 */
export declare const getFetchOpportunitiesUrl: () => string;
export declare const fetchOpportunities: (fetchOpportunitiesBody: FetchOpportunitiesBody, options?: RequestInit) => Promise<FetchResult>;
export declare const getFetchOpportunitiesMutationOptions: <TError = ErrorType<ApiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof fetchOpportunities>>, TError, {
        data: BodyType<FetchOpportunitiesBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof fetchOpportunities>>, TError, {
    data: BodyType<FetchOpportunitiesBody>;
}, TContext>;
export type FetchOpportunitiesMutationResult = NonNullable<Awaited<ReturnType<typeof fetchOpportunities>>>;
export type FetchOpportunitiesMutationBody = BodyType<FetchOpportunitiesBody>;
export type FetchOpportunitiesMutationError = ErrorType<ApiError>;
/**
 * @summary Fetch from one or more configured sources
 */
export declare const useFetchOpportunities: <TError = ErrorType<ApiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof fetchOpportunities>>, TError, {
        data: BodyType<FetchOpportunitiesBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof fetchOpportunities>>, TError, {
    data: BodyType<FetchOpportunitiesBody>;
}, TContext>;
/**
 * @summary Import from CSV
 */
export declare const getImportOpportunitiesFromCsvUrl: () => string;
export declare const importOpportunitiesFromCsv: (importOpportunitiesFromCsvBody: ImportOpportunitiesFromCsvBody, options?: RequestInit) => Promise<ImportResult>;
export declare const getImportOpportunitiesFromCsvMutationOptions: <TError = ErrorType<ApiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof importOpportunitiesFromCsv>>, TError, {
        data: BodyType<ImportOpportunitiesFromCsvBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof importOpportunitiesFromCsv>>, TError, {
    data: BodyType<ImportOpportunitiesFromCsvBody>;
}, TContext>;
export type ImportOpportunitiesFromCsvMutationResult = NonNullable<Awaited<ReturnType<typeof importOpportunitiesFromCsv>>>;
export type ImportOpportunitiesFromCsvMutationBody = BodyType<ImportOpportunitiesFromCsvBody>;
export type ImportOpportunitiesFromCsvMutationError = ErrorType<ApiError>;
/**
 * @summary Import from CSV
 */
export declare const useImportOpportunitiesFromCsv: <TError = ErrorType<ApiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof importOpportunitiesFromCsv>>, TError, {
        data: BodyType<ImportOpportunitiesFromCsvBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof importOpportunitiesFromCsv>>, TError, {
    data: BodyType<ImportOpportunitiesFromCsvBody>;
}, TContext>;
/**
 * @summary Get opportunity by ID
 */
export declare const getGetOpportunityUrl: (id: string) => string;
export declare const getOpportunity: (id: string, options?: RequestInit) => Promise<Opportunity>;
export declare const getGetOpportunityQueryKey: (id: string) => readonly [`/api/opportunities/${string}`];
export declare const getGetOpportunityQueryOptions: <TData = Awaited<ReturnType<typeof getOpportunity>>, TError = ErrorType<ApiError>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOpportunity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getOpportunity>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetOpportunityQueryResult = NonNullable<Awaited<ReturnType<typeof getOpportunity>>>;
export type GetOpportunityQueryError = ErrorType<ApiError>;
/**
 * @summary Get opportunity by ID
 */
export declare function useGetOpportunity<TData = Awaited<ReturnType<typeof getOpportunity>>, TError = ErrorType<ApiError>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOpportunity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Delete an opportunity
 */
export declare const getDeleteOpportunityUrl: (id: string) => string;
export declare const deleteOpportunity: (id: string, options?: RequestInit) => Promise<DeleteOpportunity200>;
export declare const getDeleteOpportunityMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteOpportunity>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteOpportunity>>, TError, {
    id: string;
}, TContext>;
export type DeleteOpportunityMutationResult = NonNullable<Awaited<ReturnType<typeof deleteOpportunity>>>;
export type DeleteOpportunityMutationError = ErrorType<unknown>;
/**
 * @summary Delete an opportunity
 */
export declare const useDeleteOpportunity: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteOpportunity>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteOpportunity>>, TError, {
    id: string;
}, TContext>;
/**
 * @summary Get all provider statuses
 */
export declare const getListProvidersUrl: () => string;
export declare const listProviders: (options?: RequestInit) => Promise<ProvidersResponse>;
export declare const getListProvidersQueryKey: () => readonly ["/api/providers"];
export declare const getListProvidersQueryOptions: <TData = Awaited<ReturnType<typeof listProviders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProvidersQueryResult = NonNullable<Awaited<ReturnType<typeof listProviders>>>;
export type ListProvidersQueryError = ErrorType<unknown>;
/**
 * @summary Get all provider statuses
 */
export declare function useListProviders<TData = Awaited<ReturnType<typeof listProviders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Save credentials for a provider
 */
export declare const getUpdateProviderUrl: (name: string) => string;
export declare const updateProvider: (name: string, updateProviderBody: UpdateProviderBody, options?: RequestInit) => Promise<UpdateProvider200>;
export declare const getUpdateProviderMutationOptions: <TError = ErrorType<ApiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
        name: string;
        data: BodyType<UpdateProviderBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
    name: string;
    data: BodyType<UpdateProviderBody>;
}, TContext>;
export type UpdateProviderMutationResult = NonNullable<Awaited<ReturnType<typeof updateProvider>>>;
export type UpdateProviderMutationBody = BodyType<UpdateProviderBody>;
export type UpdateProviderMutationError = ErrorType<ApiError>;
/**
 * @summary Save credentials for a provider
 */
export declare const useUpdateProvider: <TError = ErrorType<ApiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
        name: string;
        data: BodyType<UpdateProviderBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProvider>>, TError, {
    name: string;
    data: BodyType<UpdateProviderBody>;
}, TContext>;
/**
 * @summary Get settings
 */
export declare const getGetSettingsUrl: () => string;
export declare const getSettings: (options?: RequestInit) => Promise<Settings>;
export declare const getGetSettingsQueryKey: () => readonly ["/api/settings"];
export declare const getGetSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
export type GetSettingsQueryError = ErrorType<unknown>;
/**
 * @summary Get settings
 */
export declare function useGetSettings<TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update settings
 */
export declare const getUpdateSettingsUrl: () => string;
export declare const updateSettings: (settingsUpdate: SettingsUpdate, options?: RequestInit) => Promise<Settings>;
export declare const getUpdateSettingsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<SettingsUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<SettingsUpdate>;
}, TContext>;
export type UpdateSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateSettings>>>;
export type UpdateSettingsMutationBody = BodyType<SettingsUpdate>;
export type UpdateSettingsMutationError = ErrorType<unknown>;
/**
 * @summary Update settings
 */
export declare const useUpdateSettings: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<SettingsUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<SettingsUpdate>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map