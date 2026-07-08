# Wave 3 branch scope

This branch intentionally does not modify `api-server/src/routes/opportunities.ts`.

The Texas ESBD provider is available through the existing provider-name flow using:

```json
{
  "providers": ["texasEsbd"]
}
```

Keeping the route file untouched avoids unrelated churn and keeps this PR focused on provider implementation, registry wiring, normalization, and documentation.
