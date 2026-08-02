# Design Architecture & Documentation

This folder documents the core design decisions, database schemas, and API endpoints for Hangman v2.

## 🗂 Documentation Files

- **`userflow.md`**: Diagrams mapping the player's journey from landing to match completion.
- **`features.md`**: Outlines the core multiplayer and singleplayer features.
- **`dbDesign.md`**: Documents the Supabase PostgreSQL schemas, relationships, and RLS policies.
- **`api-design/`**: Specific endpoint documentation for the REST API.
- **`constraints.md`**: Project limitations and technical constraints.
- **`databaseFeatures.md`**: Notes on specific database implementations.

## 🏗 Codebase Architecture Paradigm

Hangman v2 follows a strict Domain-Driven folder structure to prevent logic bleeding:
- **`client/`**: Built with Next.js (App Router), relying on highly reusable components (`client/components/ui/`) and decoupled game modes (`client/app/game/modes/`).
- **`server/src/api/`**: Contains ONLY Express REST code (routes, middlewares, HTTP schemas).
- **`server/src/socket/`**: Contains ONLY Socket.io code (WebSockets, real-time game engine, and `IGameMode` types).
- **`server/src/shared/`**: Contains ONLY code used by both domains (Database queries, Global errors, Supabase client).

> **Note**: Some files use the [Mermaid](https://mermaid.js.org) extension to render previews. It is recommended to install Mermaid to view these files locally.
> ```bash
> pnpm install mermaid --save-dev
> ```