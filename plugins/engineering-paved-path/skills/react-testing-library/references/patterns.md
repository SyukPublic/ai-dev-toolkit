# Component, Hook, and Router Patterns

## Component Testing Patterns

### Basic render + interaction

```
1. Arrange — render the component with props/providers
2. Act — simulate user interaction via userEvent
3. Assert — check what the user would see
```

Combine all three into a single test when they form one user flow. Don't split Arrange/Act/Assert into separate `it()` blocks.

### Render helper

Create a local `renderComponent` function when the component needs providers:

```js
const renderComponent = (props = {}) =>
  render(
    <MemoryRouter>
      <MyComponent defaultProp="value" {...props} />
    </MemoryRouter>
  );
```

### Asserting absence

```js
// queryBy returns null — safe with .not
expect(screen.queryByText('Error')).not.toBeInTheDocument();
```

### Scoping queries with `within`

```js
const card = screen.getByRole('article');
expect(within(card).getByText('Title')).toBeInTheDocument();
```

## Hook Testing

Use `renderHook` for hooks with **complex pure logic** only. If a hook just fetches data or manages simple state, test it through the component that uses it instead.

```js
import { renderHook, act } from '@testing-library/react';

const { result } = renderHook(() => useCounter());
act(() => result.current.increment());
expect(result.current.count).toBe(1);
```

For hooks needing providers, pass a `wrapper`:

```js
renderHook(() => useAuth(), {
  wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
});
```

## React Router Wrapping

Components using `<Link>`, `useNavigate`, `useParams`, or `useLocation` must be wrapped:

```js
// Simple
render(<MemoryRouter><MyComponent /></MemoryRouter>);

// With route params
render(
  <MemoryRouter initialEntries={['/blogs/123']}>
    <Routes>
      <Route path="/blogs/:id" element={<BlogDetail />} />
    </Routes>
  </MemoryRouter>
);
```
