# Backlog workflow

## Reading

Start at ../BACKLOG.md. Read only the chosen ticket, its explicit dependencies,
and relevant source files. Search ticket titles before opening extra tickets.
Do not load every ticket or the archive for routine session context.

## Maintaining tickets

- Use one file per actionable task: GAR-NNN-short-title.md. Never reuse an ID.
- Copy [TEMPLATE.md](TEMPLATE.md); keep context concise and link supporting evidence.
- Use statuses: idea, ready, in-progress, blocked, done, cancelled.
- Leave priority unassigned until triaged; use high, medium, or low when assigned.
- Keep the root index to ID/link, title, status, and priority. Update it with the ticket.
- Link dependencies by ID and path. Split independently deliverable work into tickets.
- When done or cancelled, move the ticket to archive/ and remove its root index row.
  Update any links to the moved file; preserve its ID and record validation in it.
- Keep detailed session history in the configured journal; link relevant records.

## GitHub migration

If adopting GitHub Issues later, map each GAR ID to its issue URL once and use
GitHub as the ticket source. Keep local workflow instructions and links; avoid
maintaining duplicate ticket bodies or statuses in both systems.
