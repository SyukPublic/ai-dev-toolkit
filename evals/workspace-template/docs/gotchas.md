# Gotchas — unexpected behavior already explained

Check here FIRST when something "should work but doesn't".

- **Vector search returns zero rows silently** after changing the embedding model: the
  `embedding` column dimension no longer matches the model's output dimension. Postgres does
  not error — the similarity query just matches nothing. Re-create the column with the new
  dimension and re-embed.
- **`relation ... does not exist`** → migrations are MANUAL, not run on boot:
  `pnpm db:migrate` from `server/`.
- **Order totals look stale in the admin list**: the list endpoint reads the denormalized
  `orders.total` column, which is only recomputed by the checkout service — direct row edits
  in the DB bypass it.
