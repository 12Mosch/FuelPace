<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `bunx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Task Completion Requirements

- `bun run check` and `bun run test` must pass before considering tasks completed.

## Project Context

FuelPace is an intelligent nutrition platform that analyze your training data from Intervals.icu and automatically calculates personalized daily targets for calories, carbohydrates, protein, fat, fiber, hydration, and workout fueling.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures.

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted into a reusable module. Duplicate logic is a code smell and should be avoided. Do not be afraid to change existing code. Do not take shortcuts by just adding local logic to solve a problem.

## Known Gotchas And Next Steps

- Do not use Next.js conventions such as `use server`, `getServerSideProps`, or `app/layout.tsx`; use TanStack Start APIs.
- Route loaders run during SSR and client navigation, so they are not a server-only security boundary.
