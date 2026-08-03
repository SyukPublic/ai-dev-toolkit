# Mocking Strategies

## MSW (Mock Service Worker) — preferred for all data-fetching components

Intercepts at the network layer. Tests don't couple to HTTP client internals. Most realistic approach.

```js
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  // Default happy-path handlers
  http.get('/api/blogs', () => HttpResponse.json({ success: true, blogs: [...] })),
  http.post('/api/blogs', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ success: true, blog: { _id: '1', ...body } }, { status: 201 });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Override for specific tests:
it('handles error', async () => {
  server.use(
    http.get('/api/blogs', () => HttpResponse.json({ success: false }, { status: 500 })),
  );
  // ...
});
```

## Module mock (`vi.mock`) — fallback when MSW is overkill

```js
vi.mock('../../api/blogApi', () => ({
  getBlogs: vi.fn(),
}));
```

- Mock at the API/hook level, not at Axios/fetch level
- Reset in `beforeEach`: `vi.clearAllMocks()`
- Use `vi.mocked(fn)` for type-safe access to mock methods

## Context mocking

Wrap component in a test provider with controlled values. Don't mock context internals — render with the real provider.

## Timers

```js
vi.useFakeTimers();
// ... render and trigger timer-dependent code
vi.advanceTimersByTime(3000);
vi.useRealTimers(); // restore in afterEach
```
