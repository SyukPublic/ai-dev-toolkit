---
name: react-testing-library
description: "General-purpose React Testing Library guide with Vitest. Use when writing, reviewing, or setting up React component and hook tests. Covers project setup from scratch, RTL query priority, userEvent, async patterns, mocking strategies, and common anti-patterns. Applicable to any Vite + React project."
---

# React Testing Library

General-purpose guide for testing React components and hooks with React Testing Library (RTL) and Vitest. Project-agnostic — works with any Vite + React setup.

## Supporting references

Load these with the Read tool only when the task calls for them:

| File | Read it when |
|------|--------------|
| `${CLAUDE_SKILL_DIR}/references/setup.md` | The project has no RTL/Vitest setup yet — install, config, setup file, scripts |
| `${CLAUDE_SKILL_DIR}/references/spec-templates.md` | You want a full worked test file — list-component and form specs end to end |
| `${CLAUDE_SKILL_DIR}/references/patterns.md` | Render helpers, `within` scoping, `renderHook`, React Router wrapping |
| `${CLAUDE_SKILL_DIR}/references/mocking.md` | Setting up MSW, `vi.mock`, context providers, or fake timers |
| `${CLAUDE_SKILL_DIR}/references/matchers.md` | Looking up a jest-dom matcher |

## Philosophy: Fewer Tests, Real Scenarios

> "Write tests. Not too many. Mostly integration." — Kent C. Dodds

1. **Use-case coverage > code coverage** — aim for 100% use-case coverage, not 100% line coverage. Think about what the user can DO, not what the code does internally.
2. **Write fewer, longer tests** — one test that walks through a full user flow beats six isolated assertions. Combine related steps (render → interact → verify) into a single test.
3. **Test behavior, not implementation** — assert on what the user sees and can do. Never assert on internal state, hook calls, or DOM structure.
4. **Mock at boundaries only** — mock API calls and external services. Never mock your own components, hooks, or context internals.
5. **Each test must justify its existence** — if removing a test wouldn't reduce your confidence that the app works, delete it.

### The Testing Trophy (what to invest in)

```
    E2E        ← Few: critical user journeys only (Playwright/Cypress)
  Integration  ← MOST tests: components with real providers, MSW for APIs
  Unit         ← Some: complex pure logic, utilities, formatters
Static Analysis ← Always: TypeScript, ESLint
```

---

## Test Scenarios by Component Type

Before writing tests, identify the component type and pick scenarios from this matrix. Write **1-3 tests per component** — each test covers a full user flow, not a single assertion.

### Form Component (e.g., BlogEditor, LoginForm, CommentForm)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Happy path: fill all fields → submit → success feedback** | Rendering, typing, validation passing, API call, success state |
| 2 | **Validation: submit empty/invalid → error messages appear** | Required fields, validation rules, error rendering |
| 3 | **API failure: fill valid → submit → server error shown** | Error handling, error UI, form stays filled |

### List/Table Component (e.g., BlogList, CommentList, Dashboard)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Happy path: data loads → items render → user interacts** | Loading state, data rendering, click/navigation |
| 2 | **Empty state: no data → empty message shown** | Zero-data handling |
| 3 | **Error state: API fails → error message shown** | Network failure handling |

### Detail/View Component (e.g., BlogDetail, UserProfile)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Happy path: data loads → full content renders → user actions work** | Data fetching, rendering, interactions (edit/delete/comment) |
| 2 | **Not found / error: invalid ID → appropriate message** | 404 handling, error boundaries |

### Auth-Gated Component (e.g., AdminPanel, ProtectedRoute)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Authenticated: user sees protected content and can interact** | Auth context, content rendering, user actions |
| 2 | **Unauthenticated: redirects or shows login prompt** | Guard behavior, redirect |

### Shared/Presentational Component (e.g., BlogCard, Button, Modal)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Renders with props and handles user interaction** | Props → UI mapping, click/hover callbacks |
| 2 | **Conditional rendering: different props → different output** | Only if the component has meaningful branching |

For a full worked example of these scenarios in one file, read `${CLAUDE_SKILL_DIR}/references/spec-templates.md`.

---

## Import Rules

```js
// Test runner — ALWAYS from vitest
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RTL — render, screen, waitFor
import { render, screen, waitFor, within } from '@testing-library/react';

// User interaction — ALWAYS userEvent, NEVER fireEvent
import userEvent from '@testing-library/user-event';

// Hook testing
import { renderHook, act } from '@testing-library/react';
```

NEVER import from `jest`. Use `vi.fn()`, `vi.spyOn()`, `vi.mock()`.

---

## Query Priority

Queries are ordered by how closely they reflect user experience.

### Tier 1 — Accessible (default choice)

| Query | Use For |
|-------|---------|
| `getByRole` | Buttons, links, headings, inputs, checkboxes, comboboxes — **always try first** |
| `getByLabelText` | Form fields with a `<label>` |
| `getByPlaceholderText` | Inputs without a label (prefer adding a label instead) |
| `getByText` | Static text content — paragraphs, spans, error messages |
| `getByDisplayValue` | Input with a current value |

### Tier 2 — Semantic

| Query | Use For |
|-------|---------|
| `getByAltText` | Images |
| `getByTitle` | Elements with `title` attribute |

### Tier 3 — Last resort

| Query | Use For |
|-------|---------|
| `getByTestId` | Only when no accessible query works; requires `data-testid` |

### Query Variants

| Variant | Returns | Use When |
|---------|---------|----------|
| `getBy` | Element or throws | Element **must** be present |
| `queryBy` | Element or `null` | Asserting element does **not** exist |
| `findBy` | Promise\<Element\> | Element appears **after** an async operation |
| `*AllBy` | Array variants | Multiple matching elements |

### Role Query Patterns

```
getByRole('button', { name: /submit/i })
getByRole('heading', { level: 2 })
getByRole('textbox', { name: /email/i })
getByRole('link', { name: /read more/i })
getByRole('checkbox', { name: /agree/i })
getByRole('combobox')              // <select>
getByRole('status')                // role="status"
getByRole('alert')                 // role="alert"
getByRole('dialog')                // <dialog> or role="dialog"
getByRole('navigation')            // <nav>
```

---

## userEvent

Always call `userEvent.setup()` before rendering. All methods are async.

| Method | Purpose |
|--------|---------|
| `user.click(el)` | Click |
| `user.dblClick(el)` | Double-click |
| `user.type(el, 'text')` | Type text (appends to existing value) |
| `user.clear(el)` | Clear input value |
| `user.selectOptions(el, 'value')` | Select dropdown option |
| `user.tab()` | Tab to next focusable element |
| `user.keyboard('{Enter}')` | Press a key |
| `user.hover(el)` / `user.unhover(el)` | Mouse hover |
| `user.upload(el, file)` | File upload |

Pattern:
```js
const user = userEvent.setup();
render(<Component />);
await user.click(screen.getByRole('button', { name: /save/i }));
```

---

## Async Testing

### `findBy` — element appears after async work

```js
render(<BlogList />);
expect(await screen.findByText('Blog Title')).toBeInTheDocument();
```

### `waitFor` — multiple assertions, complex conditions

```js
await waitFor(() => {
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});
```

### `waitForElementToBeRemoved` — element disappears

```js
render(<BlogList />);
await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));
```

### Rules

- **Never** use `setTimeout` or fixed delays
- **Never** use `act()` directly unless testing hooks outside components — RTL wraps it
- `findBy` is preferred over `waitFor` + `getBy` for single-element waits
- `waitFor` retries until the callback passes or times out (default 1000ms)

---

## Mocking: pick the boundary

Mock the network, never the subject. MSW is the default for any data-fetching component because it intercepts at the network layer and keeps tests decoupled from the HTTP client; `vi.mock` at the API/hook level is the fallback when MSW is overkill. Never mock your own components, hooks, or context internals — render with the real provider.

Full setup for MSW, `vi.mock`, context providers, and fake timers: `${CLAUDE_SKILL_DIR}/references/mocking.md`.

---

## What to Test / What to Skip

**Test (as user-visible flows):**
- User journeys: form fill → submit → feedback
- Data display: loading → loaded → interaction
- State transitions: empty → filled, logged out → logged in
- Error boundaries: API failure → error message
- Conditional UI: different user roles see different things

**Skip:**
- Internal state (`useState` values)
- Implementation details (hook calls, private functions)
- CSS classes or inline styles
- Third-party library internals
- Render counts or performance
- Snapshot tests (unless explicitly requested)
- Constants or static data
- Individual assertions that belong inside a longer flow test

---

## Test File Conventions

- Place tests next to source: `BlogCard.jsx` -> `BlogCard.test.jsx`
- Use `.test.jsx` extension (not `.spec.jsx`)
- One `describe` per component/hook
- Test names describe user-visible behavior: `"user fills form and sees success message"`
- Use `vi.fn()` for all mock functions
- Call `userEvent.setup()` before `render()`
- Always use `screen` — never destructure from `render()`
- **1-3 tests per component** (user flows), 1-2 per hook, 2-3 per utility

---

## Anti-Patterns

| Anti-Pattern | Fix |
|-------------|-----|
| Many tiny tests with one assertion each | Combine into fewer flow tests that walk through a user journey |
| `fireEvent.click()` | Use `await user.click()` from `userEvent.setup()` |
| Destructuring from `render()` | Use `screen.getByRole(...)` |
| `getByTestId` as first choice | Try `getByRole`, `getByLabelText`, `getByText` first |
| Testing `useState` / hook internals | Test the rendered output instead |
| `setTimeout` / fixed delays | Use `findBy` or `waitFor` |
| Snapshot tests replacing behavior tests | Write explicit assertions |
| `container.querySelector()` | Use RTL queries |
| Shared mutable state between tests | Reset in `beforeEach` |
| Importing from `jest` | Import from `vitest` (`vi.fn()`, `vi.mock()`) |
| Mocking what you're testing | Mock dependencies, not the subject |
| `act()` wrapping RTL calls | RTL handles `act()` internally |
| Mocking Axios/fetch directly | Use MSW for network-level mocking |
| Testing every prop combination | Test the meaningful user-facing differences only |
