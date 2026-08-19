# Job sources

Configuration for real job sources. Each file lists what a source should read;
adding a company is editing a list, not writing code.

## `greenhouse-boards.json`

Greenhouse publishes every customer's board as public, unauthenticated JSON at
`boards-api.greenhouse.io/v1/boards/<board>/jobs`. It is a documented endpoint
meant for this purpose — no HTML scraping and no evasion — but it is
**per-company**, so this is a watchlist rather than a search engine.

```json
[{ "board": "duolingo", "company": "Duolingo" }]
```

`board` is the token in the company's board URL (`job-boards.greenhouse.io/<board>`).
`company` is how the employer should be recorded.

Boards that cannot be read are logged and skipped; one bad entry never fails a
discovery run.
