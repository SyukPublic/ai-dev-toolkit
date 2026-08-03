# jest-dom Matchers Reference

Registered by `import '@testing-library/jest-dom/vitest'` in the setup file.

| Matcher | Checks |
|---------|--------|
| `toBeInTheDocument()` | Element is in the DOM |
| `toBeVisible()` | Element is visible to the user |
| `toBeEnabled()` / `toBeDisabled()` | Enabled/disabled state |
| `toHaveTextContent(/text/i)` | Contains text |
| `toHaveValue('val')` | Input/select current value |
| `toHaveAttribute('href', '/path')` | HTML attribute |
| `toBeChecked()` | Checkbox/radio is checked |
| `toHaveFocus()` | Element has focus |
| `toBeRequired()` | Input is required |
| `toHaveClass('cls')` | Has CSS class (use sparingly) |
| `toHaveAccessibleDescription()` | `aria-describedby` text |
| `toBeEmptyDOMElement()` | No visible content |
