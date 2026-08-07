import { Router, type Request } from "express";
import { z } from "zod/v4";

const router = Router();

type Schema = z.ZodTypeAny;

const fetchSchema = z
  .object({
    keywords: z.string().trim().max(300).optional(),
    dateRange: z.coerce.number().int().min(1).max(3_650).optional(),
    providers: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  })
  .strict();

const govconFeedbackSchema = z
  .object({
    mode: z.enum(["forecast", "recompete"]).optional(),
    action: z.enum(["not_relevant", "restore_all"]).optional(),
    recordId: z.string().trim().min(1).max(500).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    agency: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "restore_all") return;
    for (const field of ["recordId", "title", "agency"] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required for not_relevant feedback`,
        });
      }
    }
  });

const recompeteVerifySchema = z
  .object({
    id: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(500),
    agency: z.string().trim().min(1).max(300),
    naics: z.string().trim().regex(/^\d{2,6}$/).optional().nullable(),
    incumbentName: z.string().trim().max(300).optional().nullable(),
  })
  .strict();

const sourceProtectSchema = z
  .object({ protectedFromCleanup: z.boolean().optional() })
  .strict();

function schemaFor(req: Pick<Request, "method" | "path">): Schema | null {
  const method = req.method.toUpperCase();
  const path = req.path;
  if (method === "POST" && path === "/opportunities/fetch") return fetchSchema;
  if (method === "POST" && path === "/govcon/feedback") return govconFeedbackSchema;
  if (method === "POST" && path === "/govcon/recompete-verify") {
    return recompeteVerifySchema;
  }
  if (method === "POST" && /^\/source-monitor\/items\/[^/]+\/protect\/?$/.test(path)) {
    return sourceProtectSchema;
  }
  return null;
}

export function validateMutationPayload(
  req: Pick<Request, "method" | "path" | "body">,
): { ok: true; data?: unknown } | { ok: false; issues: Array<{ path: string; message: string }> } {
  const schema = schemaFor(req as Pick<Request, "method" | "path">);
  if (!schema) return { ok: true };
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

router.use((req, res, next) => {
  const validation = validateMutationPayload(req);
  if (!validation.ok) {
    return res.status(400).json({
      error: "Invalid request payload.",
      issues: validation.issues,
    });
  }
  if (validation.data !== undefined) req.body = validation.data;
  return next();
});

export default router;
