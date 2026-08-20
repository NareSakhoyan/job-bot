# Example data

A complete, entirely fictional data directory: two profiles and a set of mock
job postings. Nothing here describes a real person.

Use it to seed a demo, a fresh checkout, or a deployment that should not hold
anyone's real details:

```bash
DATA_DIR=$(pwd)/data/example pnpm db:seed
```

`DATA_DIR` overrides where the application looks for `profiles/` and `jobs/`,
so this seeds without touching `data/profiles/` — which is git-ignored and
holds the real CVs.

## The profiles

| Slug    | Who                                     | Exercises                                       |
| ------- | --------------------------------------- | ----------------------------------------------- |
| `ada`   | Ada Lovelace, full-stack engineer       | TypeScript/React/Node matching, seniority bands |
| `grace` | Grace Hopper, machine learning engineer | A second profile with a different stack         |

Both are based in Yerevan with Armenian citizenship and no relocation, because
that combination is what exercises the work-eligibility factor — the scorer's
most consequential rule. Change it and most postings stop being reachable,
which is the behaviour worth demonstrating.

Every company, date, achievement and contact detail is invented.
