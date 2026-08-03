# Setup from Scratch

Bootstrapping RTL + Vitest in a Vite + React project. Read this only when the project has no test setup yet — an existing suite needs none of it.

## 1. Install Dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Optional but recommended:
```bash
npm install -D msw                     # Network-level API mocking
npm install -D @vitest/coverage-v8     # Code coverage
```

## 2. Vitest Config

Create `vitest.config.js` at the client root (or extend `vite.config.js`):

```js
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: true,
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
}));
```

## 3. Setup File

Create `src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest';
```

This registers matchers like `toBeInTheDocument()`, `toBeVisible()`, `toHaveTextContent()`.

## 4. Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```
