import { useQuery } from "@tanstack/react-query";

/**
 * The canonical relevance thresholds, served from the Neon relevance profile. The UI never defines its own
 * score bands: until the profile has loaded no band is applied (`ready` is false).
 */
export interface RelevanceThresholds {
  acceptMin: number;
  reviewMin: number;
  ready: boolean;
}

export function useRelevanceThresholds(): RelevanceThresholds {
  const { data } = useQuery<{ acceptMin: number; reviewMin: number }>({
    queryKey: ["relevance-profile", "thresholds"],
    queryFn: () =>
      fetch(`${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api/relevance-profile/thresholds`).then((r) => {
        if (!r.ok) throw new Error("Relevance thresholds unavailable");
        return r.json();
      }),
    staleTime: 10 * 60 * 1000,
  });
  return data
    ? { acceptMin: data.acceptMin, reviewMin: data.reviewMin, ready: true }
    : { acceptMin: Number.POSITIVE_INFINITY, reviewMin: Number.POSITIVE_INFINITY, ready: false };
}
