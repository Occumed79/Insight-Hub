import type { Request, RequestHandler, Router } from "express";

type RouterModule = { default: Router };
type RouteMatcher = (req: Request) => boolean;

/**
 * Load a heavy route module only when a matching request actually arrives.
 * Failed imports are not cached so a transient deployment/filesystem failure can
 * recover on the next request.
 */
export function lazyRouter(
  matches: RouteMatcher,
  loader: () => Promise<RouterModule>,
): RequestHandler {
  let modulePromise: Promise<RouterModule> | undefined;

  return async (req, res, next) => {
    if (!matches(req)) return next();

    try {
      modulePromise ??= loader();
      const module = await modulePromise;
      return module.default(req, res, next);
    } catch (error) {
      modulePromise = undefined;
      return next(error);
    }
  };
}
