<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `bunx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# Project Context

## Development And Deployment

- Install: `bun install`
- Develop: `bun run dev` (port 3000)
- Test: `bun run test`

## Known Gotchas And Next Steps

- Do not use Next.js conventions such as `use server`, `getServerSideProps`, or `app/layout.tsx`; use TanStack Start APIs.
- Route loaders run during SSR and client navigation, so they are not a server-only security boundary.
