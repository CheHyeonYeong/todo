# Server architecture

The server follows a layered DDD dependency direction:

`interfaces -> application -> domain`

Infrastructure implements the ports consumed by the application layer. The domain
contains entities and aggregate invariants and has no dependency on HTTP, files,
PostgreSQL, Supabase, or SMTP. `server.js` is the composition root and executable
entry point. Runtime configuration remains environment-based for compatibility.

- `domain/`: entities and business invariants.
- `application/`: transport-agnostic use-case facade and explicit gateway port.
- `infrastructure/`: file/PostgreSQL persistence, authentication, and SMTP archive adapters.
- `interfaces/http/`: API routing, JSON translation, CORS, static files, and Node HTTP lifecycle.
- `server.js`: composition root and process startup only.

`TodoWorkspace` is the aggregate root for ordering and routine materialization.
`ArchivePolicy` owns archive eligibility. Authentication and persistence implement
separate application ports and are injected in the composition root.

The public API and environment variables intentionally remain backward compatible.
