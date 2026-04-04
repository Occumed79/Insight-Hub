import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";

import { customFetch } from "../custom-fetch";
import type { ErrorType } from "../custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

// ── Types ──────────────────────────────────────────────────────────────────────

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
  stats: { postsFound: number; trendDirection: string; overallClientTrend: string };
  errors: string[];
}

// ── List Clients ───────────────────────────────────────────────────────────────

export const getListClientsUrl = () => `/api/clients`;

export const listClients = async (options?: RequestInit): Promise<ClientsResponse> =>
  customFetch<ClientsResponse>(getListClientsUrl(), { ...options, method: "GET" });

export const getListClientsQueryKey = () => [`/api/clients`] as const;

export const getListClientsQueryOptions = <
  TData = Awaited<ReturnType<typeof listClients>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListClientsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listClients>>> = ({ signal }) =>
    listClients({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listClients>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useListClients<
  TData = Awaited<ReturnType<typeof listClients>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listClients>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListClientsQueryOptions(options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

// ── Get Client Detail ──────────────────────────────────────────────────────────

export const getGetClientUrl = (id: string) => `/api/clients/${id}`;

export const getClient = async (id: string, options?: RequestInit): Promise<ClientDetailResponse> =>
  customFetch<ClientDetailResponse>(getGetClientUrl(id), { ...options, method: "GET" });

export const getGetClientQueryKey = (id: string) => [`/api/clients/${id}`] as const;

export const getGetClientQueryOptions = <
  TData = Awaited<ReturnType<typeof getClient>>,
  TError = ErrorType<unknown>,
>(
  id: string,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetClientQueryKey(id);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getClient>>> = ({ signal }) =>
    getClient(id, { signal, ...requestOptions });
  return { queryKey, queryFn, enabled: !!id, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getClient>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useGetClient<
  TData = Awaited<ReturnType<typeof getClient>>,
  TError = ErrorType<unknown>,
>(
  id: string,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getClient>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetClientQueryOptions(id, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

// ── Research Branches ──────────────────────────────────────────────────────────

export const getResearchBranchesUrl = (id: string) => `/api/clients/${id}/research-branches`;

export const researchBranches = async (id: string, options?: RequestInit): Promise<ResearchBranchesResponse> =>
  customFetch<ResearchBranchesResponse>(getResearchBranchesUrl(id), { ...options, method: "POST" });

export const getResearchBranchesMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof researchBranches>>,
    TError,
    { id: string },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof researchBranches>>,
  TError,
  { id: string },
  TContext
> => {
  const mutationKey = ["researchBranches"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof researchBranches>>,
    { id: string }
  > = (props) => researchBranches(props.id, requestOptions);

  return { mutationFn, ...mutationOptions };
};

export function useResearchBranches<TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof researchBranches>>,
    TError,
    { id: string },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof researchBranches>>,
  TError,
  { id: string },
  TContext
> {
  return useMutation(getResearchBranchesMutationOptions(options));
}

// ── Get Branch Hiring ──────────────────────────────────────────────────────────

export const getGetBranchHiringUrl = (id: string, branchId: string) =>
  `/api/clients/${id}/branches/${branchId}/hiring`;

export const getBranchHiring = async (
  id: string,
  branchId: string,
  options?: RequestInit,
): Promise<BranchHiringResponse> =>
  customFetch<BranchHiringResponse>(getGetBranchHiringUrl(id, branchId), { ...options, method: "GET" });

export const getGetBranchHiringQueryKey = (id: string, branchId: string) =>
  [`/api/clients/${id}/branches/${branchId}/hiring`] as const;

export const getGetBranchHiringQueryOptions = <
  TData = Awaited<ReturnType<typeof getBranchHiring>>,
  TError = ErrorType<unknown>,
>(
  id: string,
  branchId: string,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBranchHiring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetBranchHiringQueryKey(id, branchId);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getBranchHiring>>> = ({ signal }) =>
    getBranchHiring(id, branchId, { signal, ...requestOptions });
  return { queryKey, queryFn, enabled: !!(id && branchId), ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getBranchHiring>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useGetBranchHiring<
  TData = Awaited<ReturnType<typeof getBranchHiring>>,
  TError = ErrorType<unknown>,
>(
  id: string,
  branchId: string,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBranchHiring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetBranchHiringQueryOptions(id, branchId, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

// ── Refresh Branch Hiring ──────────────────────────────────────────────────────

export const getRefreshBranchHiringUrl = (id: string, branchId: string) =>
  `/api/clients/${id}/branches/${branchId}/refresh-hiring`;

export const refreshBranchHiring = async (
  id: string,
  branchId: string,
  options?: RequestInit,
): Promise<RefreshHiringResponse> =>
  customFetch<RefreshHiringResponse>(getRefreshBranchHiringUrl(id, branchId), { ...options, method: "POST" });

export const getRefreshBranchHiringMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof refreshBranchHiring>>,
    TError,
    { id: string; branchId: string },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof refreshBranchHiring>>,
  TError,
  { id: string; branchId: string },
  TContext
> => {
  const mutationKey = ["refreshBranchHiring"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof refreshBranchHiring>>,
    { id: string; branchId: string }
  > = (props) => refreshBranchHiring(props.id, props.branchId, requestOptions);

  return { mutationFn, ...mutationOptions };
};

export function useRefreshBranchHiring<TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof refreshBranchHiring>>,
    TError,
    { id: string; branchId: string },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof refreshBranchHiring>>,
  TError,
  { id: string; branchId: string },
  TContext
> {
  return useMutation(getRefreshBranchHiringMutationOptions(options));
}
