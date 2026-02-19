# Supabase Type Generation

To generate TypeScript types from your Supabase schema, run:

```bash
npx supabase gen types typescript --project-id <YOUR_PROJECT_ID> > frontend/src/types/supabase.ts
```

Or if using a local Supabase instance:

```bash
npx supabase gen types typescript --local > frontend/src/types/supabase.ts
```

Then import and use the types in your frontend code:

```typescript
import { Database } from '@/types/supabase'

const supabase = createClient<Database>(url, key)
```

This ensures end-to-end type safety between your database schema and frontend queries.
