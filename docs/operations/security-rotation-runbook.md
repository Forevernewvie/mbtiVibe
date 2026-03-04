# MBTIVibe Security Rotation Runbook

## Trigger conditions
- Secret value exposed in chat, issue tracker, logs, screenshots, or CI output.
- Team member offboarding.
- Scheduled credential rotation window.

## Mandatory rotation scope
- `VERCEL_TOKEN`
- `DATABASE_URL` password (Neon user/password pair)
- `ADMIN_API_TOKEN`

## Rotation procedure
1. Revoke old Vercel token immediately in Vercel dashboard.
2. Create new Vercel token with least privilege scope.
3. Rotate Neon DB password (or create new DB user), update connection URL.
4. Generate new `ADMIN_API_TOKEN`.
5. Update local `.env` and Vercel environment variables (`development`, `preview`, `production`).
6. Re-run:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
7. Execute security checklist:
   - `VERCEL_TOKEN=<new> DATABASE_URL=<new> ADMIN_API_TOKEN=<new> VERCEL_TOKEN_ROTATED=true DB_PASSWORD_ROTATED=true SECURITY_ROTATION_COMPLETED_AT=<ISO8601> npm run ops:verify:security-rotation`
8. Deploy and verify runtime.

## Required evidence
- Rotation timestamp (`SECURITY_ROTATION_COMPLETED_AT`)
- Incident/change reference ID
- Checklist command output JSON

## Failure handling
- If checklist fails, block deployment promotion.
- If DB credentials fail, rollback to last known-good rotated credential set.
- If access token fails, regenerate token and repeat checklist.
