Recall runs a small background process (the **Local Agent**) on your machine. Everything it captures lives under `~/.recall/`:

- **SQLite** for settings, the audit log, and sync bookkeeping.
- **LanceDB** for the searchable memory itself.

There's no cloud account, no sign-up, and no network call required to use Recall. A later update adds an opt-in encrypted backup, off by default and gated behind its own explicit consent — separate from this walkthrough.
