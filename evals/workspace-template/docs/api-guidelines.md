# API guidelines

Conventions for every HTTP endpoint in `server/`.

- **Route naming:** plural resources, kebab-case, no verbs — `GET /orders/:id`,
  `POST /orders/:id/refunds`. Derived representations use a suffix path segment
  (`GET /orders/:id/export`), never a query flag.
- **Validation at the edge:** every request body / params / query is parsed ONCE with a Zod
  schema from `@acme/shared` via `fastify-type-provider-zod`. Handlers never type-cast
  (`req.body as X` is forbidden).
- **Thin handlers:** a route parses input, makes one service call, and maps the result to a
  response. Business logic lives in the module's service; queries live in its repository.
- **Error shape:** failures return `{ error: { code, message } }`; validation failures are
  `400` with the flattened Zod issues; unknown ids are `404`.
- **Responses are contracts:** every new response shape gets a Zod schema in `@acme/shared`
  before the route ships.
