# Traqly — Full Codebase Audit & Bug Fix

You are auditing **Traqly**, a production SaaS link tracking & analytics platform built with Next.js 14+ (App Router), Prisma, PostgreSQL, Redis, Tailwind CSS, and shadcn/ui. The app is deployed on Vercel at traqly.vercel.app.

## YOUR MISSION

1. **Audit** the entire codebase for bugs, broken features, and launch blockers
2. **Report** every issue you find in a structured list BEFORE fixing anything
3. **Fix** each issue one by one, explaining what you changed and why
4. **Verify** with `npm run build` after every batch of fixes to ensure nothing regressed

## RULES

- You are in YOLO mode. Run every command yourself — do not ask for permission.
- After finding all bugs, print a numbered **BUG REPORT** before fixing anything. Wait 2 seconds, then start fixing.
- After each fix, print: `✅ FIXED #[number]: [short description of what was wrong and what you did]`
- At the very end, run `npm run build` one final time and print a **FINAL SUMMARY** with: total bugs found, total fixed, any remaining issues, and whether the build passes clean.
- If you encounter an issue that requires environment variables, credentials, or external service access (Paystack keys, Resend API key, database URL changes), do NOT attempt to fix it. Instead, flag it as `⚠️ MANUAL ACTION REQUIRED` and explain what the developer needs to do.
- Do NOT refactor working code for style preferences. Only fix actual bugs, errors, and broken functionality.
- Do NOT delete features or remove functionality. Fix — don't remove.

---

## PHASE 1 — BUILD CHECK

Run these commands and analyze the output:

```bash
npm run build 2>&1
```

Log every error and warning. Categorize them:
- **Build errors** (app won't compile)
- **TypeScript errors** (type mismatches, missing types)
- **ESLint warnings** (non-blocking but should be addressed)
- **Deprecation warnings** (packages or APIs)

---

## PHASE 2 — PRISMA & DATABASE HEALTH

```bash
npx prisma validate
npx prisma db pull --print 2>&1 | head -50
```

Check for:
- Schema mismatches between `schema.prisma` and the actual database
- Missing indexes on high-query columns (linkId, timestamp, userId, workspaceId)
- Relations that reference non-existent models
- Enum values used in code but not defined in schema
- Any `@db.Text` annotations missing on fields that store long content

---

## PHASE 3 — ROUTE & API AUDIT

Scan every file in `app/api/` and check:

1. **Auth protection**: Every non-public route must verify the session. Flag any API route that doesn't check authentication.
2. **Error handling**: Every route must have try/catch. Flag bare awaits without error handling.
3. **Input validation**: Check if Zod or manual validation exists on POST/PATCH/DELETE routes. Flag routes accepting user input without validation.
4. **HTTP methods**: Check that routes export the correct method handlers (GET, POST, etc.) and don't accidentally expose unused methods.
5. **Admin routes**: Every route under `app/api/admin/` must call `requireAdmin()` as its first operation. Flag any that don't.
6. **Response consistency**: All routes should return proper JSON responses with appropriate status codes. Flag any that return plain text or missing status codes.

```bash
# Find all API routes
find app/api -name "route.ts" -o -name "route.js" | sort

# Check for routes missing auth
grep -rL "auth\|getServerSession\|requireAdmin\|getSession" app/api/ --include="route.ts" | grep -v "webhook\|public\|auth/\|feedback"
```

---

## PHASE 4 — PAGE & COMPONENT AUDIT

Scan every page and component for:

1. **Broken imports**: Modules imported but file doesn't exist
2. **Missing 'use client' directives**: Components using hooks (useState, useEffect, useRouter, useSession) without 'use client' at the top
3. **Unused imports**: Imported but never referenced in the file
4. **Hydration mismatches**: Server/client rendering inconsistencies (e.g., using `window`, `document`, `localStorage` without checking `typeof window !== 'undefined'`)
5. **Missing error boundaries**: Pages that fetch data but have no error/loading states
6. **Missing loading.tsx or error.tsx**: Check if key route groups have these files
7. **Broken links/navigation**: `<Link href>` pointing to routes that don't exist
8. **Console.log statements**: Find and remove all `console.log` in production code (keep `console.error` and `console.warn`)

```bash
# Find potential hydration issues
grep -rn "window\.\|document\.\|localStorage\|sessionStorage" app/ components/ --include="*.tsx" --include="*.ts" | grep -v "node_modules" | grep -v "'use client'" | head -30

# Find console.logs
grep -rn "console\.log" app/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "// debug"

# Find TODO/FIXME/HACK
grep -rn "TODO\|FIXME\|HACK\|XXX\|TEMP\|PLACEHOLDER" app/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

---

## PHASE 5 — REDIRECT ENGINE CHECK

The redirect engine at `/r/[slug]` is the most critical path. Audit it thoroughly:

1. Open the redirect route handler and verify:
   - It resolves the slug from Redis first, then falls back to DB
   - It handles expired links (redirect to `/expired`)
   - It handles paused links (still redirects but marks appropriately)
   - It handles password-protected links (redirect to `/r/[slug]/auth`)
   - Smart routing rules are evaluated before redirect
   - The response is a 302 redirect (not 301 — mutable links need 302)
   - Click processing is async (BullMQ or background task) — NOT blocking the redirect
   - Error handling: if DB and Redis both fail, it should still attempt to redirect gracefully

2. Check the click processing worker/function:
   - Geo IP lookup has error handling (doesn't crash if MaxMind fails)
   - User-Agent parsing handles null/undefined UA strings
   - Referrer classification handles empty referrer
   - Bot detection doesn't flag legitimate mobile browsers
   - Rate limiting keys are correctly scoped (per IP per link, not global)

---

## PHASE 6 — AUTH FLOW CHECK

Test the authentication flow code:

1. Check `auth.ts` / NextAuth config:
   - Session callback includes all required fields (id, email, name, isAdmin)
   - JWT callback properly sets user data
   - Providers are correctly configured (Google OAuth + credentials)
   - Session strategy is set (JWT vs database)
   
2. Check middleware.ts:
   - Protected routes are correctly listed
   - Public routes (landing, auth, /r/[slug], /bio/[slug]) are excluded
   - Redirect logic doesn't create infinite loops

3. Check auth pages:
   - Login page handles errors (wrong password, account not found)
   - Register page validates inputs before submission
   - OAuth callback handles errors gracefully

---

## PHASE 7 — FRONTEND FUNCTIONALITY CHECK

Check these interactive features:

1. **Link creation form**: Required fields validated, slug uniqueness checked, URL validation works
2. **Dashboard real-time updates**: WebSocket/SSE connection doesn't leak or reconnect infinitely
3. **Charts**: Recharts components handle empty data arrays without crashing
4. **Sidebar navigation**: Active state highlights correctly, collapse/expand works, mobile nav works
5. **Modals/Dialogs**: Open and close correctly, escape key works, backdrop click closes
6. **Toast notifications**: Appear and auto-dismiss, don't stack infinitely
7. **Search/filter**: Debounced correctly, doesn't fire on every keystroke
8. **Pagination**: Handles edge cases (page 0, beyond last page, empty results)
9. **Copy to clipboard**: Works and shows confirmation feedback
10. **Theme toggle**: Dark/light mode persists and doesn't flash on reload

```bash
# Check for potential memory leaks — useEffect without cleanup
grep -rn "useEffect" app/ components/ --include="*.tsx" -A 5 | grep -B 1 "setInterval\|addEventListener\|subscribe" | grep -v "return\|cleanup\|clearInterval\|removeEventListener\|unsubscribe"
```

---

## PHASE 8 — SECURITY CHECK

1. **Exposed secrets**: Scan for hardcoded API keys, passwords, or tokens
2. **SQL injection**: Check for raw SQL queries without parameterization
3. **XSS vectors**: Check for `dangerouslySetInnerHTML` usage without sanitization
4. **CSRF**: Verify mutating API routes have protection
5. **Rate limiting**: Check if auth endpoints and public API routes have rate limits
6. **Data exposure**: Check if API responses leak sensitive fields (passwords, API keys, raw IPs)

```bash
# Check for hardcoded secrets
grep -rn "sk-\|sk_live\|sk_test\|password.*=.*['\"]" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".env" | grep -v "schema.prisma"

# Check for dangerouslySetInnerHTML
grep -rn "dangerouslySetInnerHTML" app/ components/ --include="*.tsx"

# Check for raw SQL
grep -rn "\\$queryRaw\|\\$executeRaw" app/ lib/ --include="*.ts"
```

---

## PHASE 9 — DEPENDENCY CHECK

```bash
# Check for outdated packages
npm outdated 2>&1 | head -30

# Check for known vulnerabilities
npm audit --production 2>&1 | tail -20

# Check for unused dependencies
npx depcheck 2>&1 | head -40
```

Flag:
- Critical security vulnerabilities that need immediate update
- Packages imported in package.json but never used in code
- Duplicate packages (e.g., both `axios` and `fetch` wrappers)

---

## PHASE 10 — ENV & CONFIG CHECK

```bash
# Check what env vars the code expects
grep -rhn "process\.env\." app/ lib/ --include="*.ts" --include="*.tsx" | sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort -u

# Check .env.example or .env.local exists
ls -la .env* 2>/dev/null
```

- Verify every `process.env.X` reference has a fallback or is properly checked
- Flag any env var used in client-side code that isn't prefixed with `NEXT_PUBLIC_`
- Check that `.env.example` documents all required variables

---

## OUTPUT FORMAT

After all phases, print:

```
═══════════════════════════════════════════
  TRAQLY AUDIT REPORT — [date]
═══════════════════════════════════════════

CRITICAL (must fix before launch):
  #1  [description]
  #2  [description]

HIGH (should fix before launch):
  #3  [description]
  #4  [description]

MEDIUM (fix soon after launch):
  #5  [description]

LOW (nice to have):
  #6  [description]

⚠️ MANUAL ACTION REQUIRED:
  - [thing developer must do themselves]

═══════════════════════════════════════════
```

Then fix everything marked CRITICAL and HIGH automatically.
After fixing, print the final summary.

---

**START NOW. Begin with Phase 1.**
