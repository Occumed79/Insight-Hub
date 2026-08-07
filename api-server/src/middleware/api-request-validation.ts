import { Router, type Request } from "express";

const router = Router();

type ValidationIssue = { path: string; message: string };
type ValidationResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; issues: ValidationIssue[] };

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      issues.push({ path: key, message: "Unknown field" });
    }
  }
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
  issues: ValidationIssue[],
  options: { required?: boolean; nullable?: boolean; pattern?: RegExp } = {},
): string | null | undefined {
  const raw = body[field];
  if (raw === undefined) {
    if (options.required) issues.push({ path: field, message: `${field} is required` });
    return undefined;
  }
  if (raw === null && options.nullable) return null;
  if (typeof raw !== "string") {
    issues.push({ path: field, message: `${field} must be a string` });
    return undefined;
  }
  const value = raw.trim();
  if (!value) {
    if (options.required) issues.push({ path: field, message: `${field} is required` });
    return undefined;
  }
  if (value.length > maxLength) {
    issues.push({ path: field, message: `${field} must be ${maxLength} characters or fewer` });
    return undefined;
  }
  if (options.pattern && !options.pattern.test(value)) {
    issues.push({ path: field, message: `${field} has an invalid format` });
    return undefined;
  }
  return value;
}

function invalidBody(): ValidationResult {
  return {
    ok: false,
    issues: [{ path: "", message: "Request body must be a JSON object" }],
  };
}

function validateFetch(bodyValue: unknown): ValidationResult {
  const body = objectBody(bodyValue);
  if (!body) return invalidBody();
  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(body, new Set(["keywords", "dateRange", "providers"]), issues);
  const data: Record<string, unknown> = {};

  const keywords = optionalString(body, "keywords", 300, issues);
  if (keywords !== undefined) data.keywords = keywords;

  if (body.dateRange !== undefined) {
    const parsed =
      typeof body.dateRange === "number"
        ? body.dateRange
        : typeof body.dateRange === "string" && body.dateRange.trim()
          ? Number(body.dateRange)
          : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3_650) {
      issues.push({
        path: "dateRange",
        message: "dateRange must be an integer from 1 to 3650",
      });
    } else {
      data.dateRange = parsed;
    }
  }

  if (body.providers !== undefined) {
    if (!Array.isArray(body.providers) || body.providers.length > 12) {
      issues.push({
        path: "providers",
        message: "providers must be an array with at most 12 entries",
      });
    } else {
      const providers: string[] = [];
      body.providers.forEach((entry, index) => {
        if (typeof entry !== "string") {
          issues.push({
            path: `providers.${index}`,
            message: "provider must be a string",
          });
          return;
        }
        const provider = entry.trim();
        if (!provider || provider.length > 80) {
          issues.push({
            path: `providers.${index}`,
            message: "provider must be 1 to 80 characters",
          });
          return;
        }
        providers.push(provider);
      });
      data.providers = providers;
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, data };
}

function validateGovConFeedback(bodyValue: unknown): ValidationResult {
  const body = objectBody(bodyValue);
  if (!body) return invalidBody();
  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(
    body,
    new Set(["mode", "action", "recordId", "title", "agency"]),
    issues,
  );
  const data: Record<string, unknown> = {};

  if (body.mode !== undefined) {
    if (body.mode !== "forecast" && body.mode !== "recompete") {
      issues.push({ path: "mode", message: "mode must be forecast or recompete" });
    } else {
      data.mode = body.mode;
    }
  }

  let action: "not_relevant" | "restore_all" = "not_relevant";
  if (body.action !== undefined) {
    if (body.action !== "not_relevant" && body.action !== "restore_all") {
      issues.push({
        path: "action",
        message: "action must be not_relevant or restore_all",
      });
    } else {
      action = body.action;
      data.action = body.action;
    }
  }

  const requireRecord = action !== "restore_all";
  const recordId = optionalString(body, "recordId", 500, issues, {
    required: requireRecord,
  });
  const title = optionalString(body, "title", 500, issues, {
    required: requireRecord,
  });
  const agency = optionalString(body, "agency", 300, issues, {
    required: requireRecord,
  });
  if (recordId !== undefined) data.recordId = recordId;
  if (title !== undefined) data.title = title;
  if (agency !== undefined) data.agency = agency;

  return issues.length > 0 ? { ok: false, issues } : { ok: true, data };
}

function validateRecompeteVerify(bodyValue: unknown): ValidationResult {
  const body = objectBody(bodyValue);
  if (!body) return invalidBody();
  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(
    body,
    new Set(["id", "title", "agency", "naics", "incumbentName"]),
    issues,
  );
  const data: Record<string, unknown> = {};

  const id = optionalString(body, "id", 500, issues, { required: true });
  const title = optionalString(body, "title", 500, issues, { required: true });
  const agency = optionalString(body, "agency", 300, issues, { required: true });
  const naics = optionalString(body, "naics", 6, issues, {
    nullable: true,
    pattern: /^\d{2,6}$/,
  });
  const incumbentName = optionalString(body, "incumbentName", 300, issues, {
    nullable: true,
  });

  if (id !== undefined) data.id = id;
  if (title !== undefined) data.title = title;
  if (agency !== undefined) data.agency = agency;
  if (naics !== undefined) data.naics = naics;
  if (incumbentName !== undefined) data.incumbentName = incumbentName;

  return issues.length > 0 ? { ok: false, issues } : { ok: true, data };
}

function validateSourceProtect(bodyValue: unknown): ValidationResult {
  const body = objectBody(bodyValue);
  if (!body) return invalidBody();
  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(body, new Set(["protectedFromCleanup"]), issues);
  const data: Record<string, unknown> = {};
  if (body.protectedFromCleanup !== undefined) {
    if (typeof body.protectedFromCleanup !== "boolean") {
      issues.push({
        path: "protectedFromCleanup",
        message: "protectedFromCleanup must be a boolean",
      });
    } else {
      data.protectedFromCleanup = body.protectedFromCleanup;
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, data };
}

export function validateMutationPayload(
  req: Pick<Request, "method" | "path" | "body">,
): ValidationResult {
  const method = req.method.toUpperCase();
  const path = req.path;
  if (method === "POST" && path === "/opportunities/fetch") {
    return validateFetch(req.body ?? {});
  }
  if (method === "POST" && path === "/govcon/feedback") {
    return validateGovConFeedback(req.body ?? {});
  }
  if (method === "POST" && path === "/govcon/recompete-verify") {
    return validateRecompeteVerify(req.body ?? {});
  }
  if (
    method === "POST" &&
    /^\/source-monitor\/items\/[^/]+\/protect\/?$/.test(path)
  ) {
    return validateSourceProtect(req.body ?? {});
  }
  return { ok: true };
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
