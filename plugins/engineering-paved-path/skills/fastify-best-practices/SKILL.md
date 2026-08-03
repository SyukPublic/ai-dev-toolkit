---
name: fastify-best-practices
description: "Guides development of Fastify Node.js backend servers and REST APIs using TypeScript or JavaScript. Use when building, configuring, or debugging a Fastify application — including defining routes, implementing plugins, setting up JSON Schema validation, handling errors, optimising performance, managing authentication, configuring CORS and security headers, integrating databases, working with WebSockets, and deploying to production. Covers the full Fastify request lifecycle (hooks, serialization, logging with Pino) and TypeScript integration via strip types. Trigger terms: Fastify, Node.js server, REST API, API routes, backend framework, fastify.config, server.ts, app.ts."
metadata:
  tags: fastify, nodejs, typescript, backend, api, server, http
---

## When to use

Use this skill when you need to:
- Develop backend applications using Fastify
- Implement Fastify plugins and route handlers
- Get guidance on Fastify architecture and patterns
- Use TypeScript with Fastify (strip types)
- Implement testing with Fastify's inject method
- Configure validation, serialization, and error handling

## Quick Start

A minimal, runnable Fastify server to get started immediately:

```ts
import Fastify from 'fastify'

const app = Fastify({ logger: true })

app.get('/health', async (request, reply) => {
  return { status: 'ok' }
})

const start = async () => {
  await app.listen({ port: 3000, host: '0.0.0.0' })
}
start()
```

## Recommended Reading Order for Common Scenarios

- **New to Fastify?** Start with `references/plugins.md` → `references/routes.md` → `references/schemas.md`
- **Adding authentication:** `references/plugins.md` → `references/hooks.md` → `references/authentication.md`
- **Improving performance:** `references/schemas.md` → `references/serialization.md` → `references/performance.md`
- **Setting up testing:** `references/routes.md` → `references/testing.md`
- **Going to production:** `references/logging.md` → `references/configuration.md` → `references/deployment.md`

## How to use

Read individual rule files for detailed explanations and code examples:

- [references/plugins.md](${CLAUDE_SKILL_DIR}/references/plugins.md) - Plugin development and encapsulation
- [references/routes.md](${CLAUDE_SKILL_DIR}/references/routes.md) - Route organization and handlers
- [references/schemas.md](${CLAUDE_SKILL_DIR}/references/schemas.md) - JSON Schema validation
- [references/error-handling.md](${CLAUDE_SKILL_DIR}/references/error-handling.md) - Error handling patterns
- [references/hooks.md](${CLAUDE_SKILL_DIR}/references/hooks.md) - Hooks and request lifecycle
- [references/authentication.md](${CLAUDE_SKILL_DIR}/references/authentication.md) - Authentication and authorization
- [references/testing.md](${CLAUDE_SKILL_DIR}/references/testing.md) - Testing with inject()
- [references/performance.md](${CLAUDE_SKILL_DIR}/references/performance.md) - Performance optimization
- [references/logging.md](${CLAUDE_SKILL_DIR}/references/logging.md) - Logging with Pino
- [references/typescript.md](${CLAUDE_SKILL_DIR}/references/typescript.md) - TypeScript integration
- [references/decorators.md](${CLAUDE_SKILL_DIR}/references/decorators.md) - Decorators and extensions
- [references/content-type.md](${CLAUDE_SKILL_DIR}/references/content-type.md) - Content type parsing
- [references/serialization.md](${CLAUDE_SKILL_DIR}/references/serialization.md) - Response serialization
- [references/cors-security.md](${CLAUDE_SKILL_DIR}/references/cors-security.md) - CORS and security headers
- [references/websockets.md](${CLAUDE_SKILL_DIR}/references/websockets.md) - WebSocket support
- [references/database.md](${CLAUDE_SKILL_DIR}/references/database.md) - Database integration patterns
- [references/configuration.md](${CLAUDE_SKILL_DIR}/references/configuration.md) - Application configuration
- [references/deployment.md](${CLAUDE_SKILL_DIR}/references/deployment.md) - Production deployment
- [references/http-proxy.md](${CLAUDE_SKILL_DIR}/references/http-proxy.md) - HTTP proxying and reply.from()

## Core Principles

- **Encapsulation**: Fastify's plugin system provides automatic encapsulation
- **Schema-first**: Define schemas for validation and serialization
- **Performance**: Fastify is optimized for speed; use its features correctly
- **Async/await**: All handlers and hooks support async functions
- **Minimal dependencies**: Prefer Fastify's built-in features and official plugins
