# HealingMuse engineering rules

HealingMuse is an AI-free Vietnamese-first music and emotional wellbeing PWA for adult patients.
Use human-curated music and recordings, with no AI generation, models, or AI APIs.
Treat mood records as private personal data and never make diagnostic or treatment claims.

## Strict working rules

- Never use the em dash; use a plain dash instead.
- Never add an agent name as a commit co-author.
- Never manually modify CHANGELOG.md or files marked as generated.
- Put each complete sentence on its own physical line when writing or substantially editing long Markdown.
- Prefer quality, simplicity, robustness, scalability, and long-term maintainability over development cost.
- Begin bug fixes by reproducing the end-user journey in E2E testing before changing the implementation.
- Inspect the rendered UI carefully and fix visible defects found during testing.
- Fix lint failures, test failures, and test flakiness discovered during the work.
- Preserve unrelated user changes.

## Architecture and validation

Use Node.js 22, npm, Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, next-intl, and Supabase.
Read installed Next.js documentation before framework changes.
Keep server secrets in server-only modules and authorize every privileged operation.
Explicitly revoke direct API-role privileges when adding database objects, since Supabase defaults can grant more access than PUBLIC revocation removes.
Use owner RLS and private Realtime channels for personal information.
Content administrators must not receive access to patients' private mood records.
Never cache private pages, API responses, or signed URLs in the service worker.
Only explicitly downloaded recordings with compatible rights may persist locally.
Do not store offline mood records or queue offline personal mutations.
Apply the AAS Accessibility & Inclusive UX fixing-accessibility and screen-reader-testing skills to interface work.
Use native semantics, accessible names, visible focus, reduced-motion support, and at least 44 CSS pixel touch controls.
Run lint, type checking, unit tests, a production build, and meaningful browser journeys before reporting completion.
Report physical-device, actual screen-reader, live cloud, and performance checks separately from automated checks.
Do not declare those checks passed without evidence.
