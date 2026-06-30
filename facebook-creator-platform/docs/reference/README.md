# Reference — source of truth

These are the CR-01 design deliverables and DB artifacts. Code must stay
consistent with them. When code and these disagree, stop and ask.

- `*_CR-01.docx` — Proposal, Estimations & Constraints (incl. API Design),
  Estimation & Roadmap, Database Design (7-phase). The "_CR-01" versions
  include MikroORM, PII, soft delete, Result pattern, MongoDB audit, billing
  state machine, FK indexing, Artillery.
- `CR-01-Change-Request-Addendum.docx` — what changed and why.
- `fcp-ddl.sql` — base DDL. `fcp-ddl-CR01.sql` — the delta (audit removed,
  app-gen ids, timestamps, FK index). Apply both, or fold the delta in.
- `views.sql`, `verify-seed.sql`, `query-collection.sql` — views, post-seed
  checks, sample queries.
- `fcp-database.d2` / `.svg` — ERD (15 tables, audit in MongoDB).
- `architecture.png`, `high-level-design.png`, `billing-state-machine.svg` — diagrams.

Tip for Claude: read the docx via the file-reading tools only when a task needs
the detail; for day-to-day schema work, `fcp-ddl.sql` + `fcp-ddl-CR01.sql` are
the fastest source.
