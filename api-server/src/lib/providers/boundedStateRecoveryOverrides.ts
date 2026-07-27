import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

/**
 * Manual-access and disabled source retention has been removed. Sources that
 * cannot support a reliable public adapter are deleted from the catalogue and
 * runtime inventory instead of receiving no-op providers.
 */
export const BOUNDED_STATE_RECOVERY_SOURCES: PublicPortalSource[] = [];

export const boundedStateRecoveryProviders: Record<
  string,
  DataSourceProvider
> = {};
