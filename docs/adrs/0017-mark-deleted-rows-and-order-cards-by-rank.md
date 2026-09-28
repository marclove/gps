# 17. Mark deleted rows with `deleted_at` and order cards by rank

Date: 2026-09-28

## Status

Accepted

Supersedes the names in [ADR 0008](0008-archive-meetings-with-a-timestamp.md) and [ADR 0013](0013-store-initiatives-on-a-roadmap.md), and the part "The order of the cards" of ADR 0013.

## Context

Feature ticket 0007 asks the existing tables to follow the conventions of the target data model (`docs/target-data-model.md`) before new tables are added. Two conventions differ today.

**The name of a deleted row.** When the user removes a meeting or an initiative, the row stays in the database, so that an "Undo" button can bring it back and so that links to it stay valid. ADR 0008 recorded the time of this action in a column named `archived_at`, and the backend commands say "archive" and "unarchive". ADR 0013 kept the same names for initiatives, although the user interface for initiatives says "Delete". The target data model names the column `deleted_at` in every table. The ticket also asks the user interface to say "Delete" for meetings, so that the application uses one word for one action.

**The order of the cards on the roadmap.** In each of the columns Now, Next, and Later, the user sets the order of the initiatives by dragging the cards. ADR 0013 stores this order as a number, `position`, that goes 0, 1, 2, and so on without gaps. Every change renumbers the rows after the place of the change. Because a change writes many rows in one statement, the database cannot have a unique index on the column and the position: SQLite checks such an index row by row, and a shift by one would collide with itself halfway. The backend code alone keeps two cards from having the same position.

The target data model replaces the positions with a **rank**: a text key that sorts in the order of the cards. For any two keys, there is always a key that sorts between them, so a card that is dropped between two others gets a new key between their keys, and no other row changes. This scheme is also called fractional indexing. Because a move writes one row, a unique index can guard the order.

The Rust backend owns the SQLite database (ADR 0003). The database enforces foreign keys (ADR 0010): `meetings.initiative_id` and `tasks.meeting_id` must refer to rows that exist.

We had to decide:

- which names the columns, the backend commands, and the frontend use,
- how rank keys are generated, and where,
- how each change on the roadmap computes a rank,
- how the migration turns the positions of existing initiatives into ranks,
- how the migration can rebuild a table that other tables refer to while foreign keys are enforced.

## Decision

### Names

- The column `archived_at` of `meetings` and of `initiatives` is renamed to `deleted_at`. Its meaning does not change: it is `NULL` until the user deletes the row, and then it holds the time of the delete, as an RFC 3339 timestamp in UTC.
- The backend commands are renamed:

  | Before                 | After                |
  | ---------------------- | -------------------- |
  | `archive_meeting`      | `delete_meeting`     |
  | `unarchive_meeting`    | `restore_meeting`    |
  | `archive_initiative`   | `delete_initiative`  |
  | `unarchive_initiative` | `restore_initiative` |

  The argument `includeArchived` of `list_initiatives` becomes `includeDeleted`, and the field `archivedAt` of an initiative becomes `deletedAt`.
- The Rust functions, the frontend functions, the types, and the components follow the same words. For example, `meetings::archive` becomes `meetings::delete`, `archiveMeeting` becomes `deleteMeeting`, and the shared component `ArchiveProvider` becomes `DeleteProvider`. Its hook `useDelete` gives an action named `deleteItem`, because `delete` alone is a reserved word in JavaScript.
- "Restore" is the word for undoing a delete, in the code and in the user interface. The backend already returns a `RestoreOutcome` for initiatives.
- The user interface says "Delete" for meetings, as it does for initiatives. The icon of the button is the trash can that the sheet of an initiative uses.

Deleting a row still does not remove it. The word describes what the user sees: the row is gone from every list. A later page can show deleted rows, and a restore after the toast has closed can be added then.

### Rank keys

- The column `position INTEGER NOT NULL` of `initiatives` is replaced by `rank TEXT NOT NULL`.
- The backend generates keys with the Rust crate `fractional_index` (license MIT). Its type `FractionalIndex` can make a key before a key, after a key, or between two keys, and writes a key as lowercase hexadecimal text, such as `80` or `817f80`. The text of two keys sorts in the same order as the keys, byte by byte. SQLite compares `TEXT` with its default collation byte by byte, and JavaScript compares strings of these characters in the same order, so all three layers agree.
- A small module, `src-tauri/src/rank.rs`, is the only code that calls the crate. It gives the rest of the backend one function that takes the key before a place and the key after it, either of which may be missing, and returns a key between them.
- Only the backend makes keys. The frontend still sends the column and the index where a card was dropped, and it never computes a key. It receives `rank` as part of each initiative and sorts the cards of a column by comparing the ranks as text, with `<` and `>`, and not with `localeCompare`, which would use the rules of a language.

### Order of the cards

An initiative is **on the board** when it is neither completed nor deleted. The rule is: in each of Now, Next, and Later, no two initiatives on the board have the same rank. A partial unique index enforces it:

```sql
CREATE UNIQUE INDEX initiatives_horizon_rank ON initiatives(horizon, rank)
    WHERE completed_at IS NULL AND deleted_at IS NULL;
```

Each change works as follows, inside one transaction:

- **Create**: the new initiative gets a key before the rank of the first initiative on the board in Later, or the first key of all if Later is empty. New work is at the top of Later, as before.
- **Move** to Now, Next, or Later at an index: the backend reads the initiatives on the board in the destination column, without the moved one, in the order of their ranks. The neighbors of the drop are the initiatives at `index - 1` and at `index`. The moved initiative gets a key between their ranks. An index below 0 means the top, and an index larger than the column means the end. Only the moved row is written.
- **Complete** (a move to Done): `completed_at` is set. The initiative keeps its horizon and rank. No other row changes.
- **Reopen** (a move from Done to Now, Next, or Later): `completed_at` is cleared, and the initiative gets a key at the index of the drop, as for any move. The user chose the place by dropping the card, so the old rank does not count.
- **Delete**: `deleted_at` is set. The initiative keeps its horizon and rank. No other row changes.
- **Restore**: `deleted_at` is cleared. A completed initiative goes back to Done, and its rank does not matter. An initiative that is not completed goes back to its column with its old rank, so it appears among the cards that were around it when it was deleted. If an initiative on the board in that column now has the same rank, the restored initiative gets a key between that rank and the next rank in the column, so it appears directly after that card. Name conflicts are handled as before (ADR 0013).

Keys get longer only when the user drops cards into the same gap again and again. With a few dozen initiatives, this does not matter. If it matters one day, the backend can give a whole column new short keys in one transaction, as a maintenance step that is not part of a move.

### Migration

Two new migrations, at the end of `MIGRATIONS` in `src-tauri/src/db.rs`, make the change. They are released together.

1. The first migration has an SQL part and a Rust part (`M::up_with_hook` of `rusqlite_migration`, which runs the Rust code after the SQL, in the same transaction):
   - The SQL renames `meetings.archived_at` to `deleted_at` with `ALTER TABLE ... RENAME COLUMN`, and adds a column `rank TEXT` to `initiatives`, which is `NULL` at first.
   - The Rust code computes the ranks with the same `rank.rs` module that the backend uses later. In each horizon, the rows are taken in the order of `(position, id)`, and each row gets the key after the key of the row before it. This keeps the order of every column. Completed and deleted rows get keys in the same sequence, so they keep the place they had last, as ADR 0013 intended for a restore.
2. The second migration rebuilds the `initiatives` table. A new table with `rank TEXT NOT NULL` and `deleted_at`, and without `position`, receives the rows of the old table. The old table is dropped, and the new one takes its name. The indexes are created again: the unique index on the name, now with `WHERE deleted_at IS NULL AND name <> ''`, and the new unique index on the horizon and the rank.

SQLite cannot add a column that is `NOT NULL` and has no default value to a table that already has rows, and it cannot drop a column that an index uses. A rebuild is the way that the SQLite documentation gives for such changes. A rebuild drops a table that `meetings.initiative_id` refers to, which fails while foreign keys are enforced. We tested this: deferring the check with `PRAGMA defer_foreign_keys` is not enough, because the drop counts as a delete of the rows that meetings refer to, and the commit fails.

So `db::open` and `db::open_in_memory` apply the migrations with foreign keys turned off, as the SQLite documentation describes for changes of structure:

1. `PRAGMA foreign_keys = OFF`. This setting cannot change inside a transaction, so it is set before the migrations start.
2. The migrations run. Each migration that rebuilds a table ends with `PRAGMA foreign_key_check` (the option `.foreign_key_check()` of `rusqlite_migration`), which fails the migration and rolls it back if any reference points to a row that does not exist.
3. `PRAGMA foreign_keys = ON`, as before. From this point, the connection enforces foreign keys for every change that the application makes.

This keeps the rule of ADR 0010: every change that the application makes to the data is checked. Only the migrations, which change the structure, run without the check, and they check the references themselves before they commit.

## Consequences

- A move, a complete, a delete, and a restore each write one row. The database, and not only the backend code, keeps two cards from having the same place in a column.
- The ranks in the database cannot be read as places. To see the order of a column, sort it by `rank`. Tests check the order of the names, not the values of the keys.
- A restore can put a card in a slightly different place than the renumbering of ADR 0013 did. Before, a restored card went back to its old index, counted from the top. Now it goes back among the cards that were around it. When cards were moved while it was deleted, the two rules can give different places. The new rule keeps it next to its old neighbors, which is closer to what the user saw.
- The frontend depends on `rank` being text that sorts correctly with `<`. A key format that is not plain ASCII would break this, so `rank.rs` is the one place to check if the crate is replaced.
- The target data model uses ranks for key results and tasks too. They can use `rank.rs` and the same kind of partial unique index.
- The next migration that rebuilds a table, such as the one that removes `meetings.initiative_id` in the target data model, can use the same procedure without another decision.
- The executable specs and their fake backends use the new command names and fields. Specs 0004 and 0006 still describe the old names; Spec 0007 records the changes.

## Alternatives considered

- **Keep the name `archived_at`.** It needs no change, but the target data model uses `deleted_at` for every table, and the user interface already says "Delete" for initiatives. Two words for one action would stay in the code forever.
- **Rename the column only, and keep the command names.** The frontend and the backend would then use different words for the same thing, and each new table would have to choose between them.
- **Keep dense positions and add a unique index.** Each renumbering would need to move rows through temporary values, such as negative numbers, to avoid colliding with itself. It would work, but every move would still write the whole column, and the code would be harder to follow.
- **Positions with gaps**, such as 1000, 2000, 3000. Most moves write one row, but the gaps run out, and then a second path must renumber the column. Text keys never run out.
- **Write our own key generator.** The algorithm is short, but it has edge cases, such as keys at the start and the end and keys that differ only in length. The crate is small, has one optional dependency (`serde`), and is tested. `rank.rs` keeps it replaceable.
- **Send the cards already sorted, without a rank.** The frontend would not see the keys, but it would depend on the order of a list, which Spec 0006 says it must not do, and the fake backends of the specs would have to copy the order exactly. Sending `rank` keeps the rule "the frontend sorts".
- **Keep `rank` as the column that the first migration adds**, with a default value such as an empty text so that it can be `NOT NULL`, to avoid a rebuild. The default would be a key that means nothing, and `position` would stay in the table unless its index is dropped first.
- **Rebuild with `PRAGMA defer_foreign_keys = ON`.** We tested it. The commit fails, because dropping the old table counts as deleting rows that meetings refer to.
