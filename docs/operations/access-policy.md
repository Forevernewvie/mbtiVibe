# MBTIVibe Vercel Access Policy

## Current policy mode
- Mode: `protected`
- Reason: project-level SSO protection is enabled (`all_except_custom_domains`).
- Validation command:
  - `VERCEL_ACCESS_POLICY=protected VERCEL_TOKEN=<token> VERCEL_ALIAS_URL=https://mbti-vibe.vercel.app npm run ops:verify:vercel-protection`

## Policy semantics
- `public`
  - Alias routes (`/`, `/assessment`, `/terms`, `/privacy`, `/robots.txt`) must return success status.
  - Use this mode only after public-domain exposure and access control review are complete.
- `protected`
  - Direct access to Vercel alias/deployment URLs must be blocked (`401/403/404`).
  - Intended for private/internal validation windows.

## Switching policy mode
1. Choose target mode (`public` or `protected`) by release milestone.
2. Update CI/runtime variable `VERCEL_ACCESS_POLICY`.
3. Run `npm run ops:verify:vercel-protection`.
4. Block production promotion if command exits non-zero.

## Known behavior
- Under SSO protection, bypass checks may still fail depending on team protection settings.
- In `protected` mode, blocked direct access is expected and counted as PASS.
