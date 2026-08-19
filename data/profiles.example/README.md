# Example profiles

The same structure the application expects, with placeholder identities.

`data/profiles/` is deliberately not in version control: it holds real names,
email addresses, phone numbers and complete employment histories. Committing it
would put that in every clone and every backup of the repository forever.

To set up:

```bash
cp -r data/profiles.example data/profiles
# edit data/profiles/<slug>/profile.json and the rest with real details
pnpm db:seed
```

Each profile is a directory named for its slug, containing:

| File                | What it holds                                        |
| ------------------- | ---------------------------------------------------- |
| `profile.json`      | Identity, contact details, preferences, work authorisation |
| `experience.json`   | Recorded roles — the only facts generation may draw on |
| `education.json`    | Degrees, courses, certifications                     |
| `master-resume.md`  | The full CV in prose                                 |

`pnpm export` writes the database back out to these files, so edits made in the
dashboard survive a reseed.
