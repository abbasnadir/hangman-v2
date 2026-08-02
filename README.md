# Hangman V2 🎮

Welcome to the ultimate remake of the classic Hangman game! Built from the ground up to support real-time multiplayer, custom wordlists, robust error handling, and a strict, beautifully decoupled architecture.

## 🚀 Live Demo
- **Frontend:** [hangman.abbasnadir.tech](https://hangman.abbasnadir.tech) (Hosted on Vercel)
- **Backend API & WebSockets:** [api.hangman.abbasnadir.tech](https://api.hangman.abbasnadir.tech) (Hosted on Heroku)

## 🏗 Project Architecture

This monorepo is strictly divided into Client and Server, with a heavy emphasis on separation of concerns.

### 🖥 Client Architecture (Next.js)
The frontend utilizes a modular component architecture to ensure maintainability and high reusability:

- **`client/app/game/`**: The core game engine.
  - **`page.tsx`**: Acts as a lightweight router, redirecting players to the correct game mode.
  - **`modes/`**: Strictly decoupled game logic controllers (`ClassicMode` vs `MultiplayerMode`).
  - **`screens/`**: Pure UI presentation layers (WaitingScreen, EndedScreen).
- **`client/components/ui/`**: A library of reusable, heavily-typed UI components (Buttons, Inputs, Textareas, Badges, and Cards) that power the entire visual identity of the app.

### ⚙️ Server Architecture (Node.js & Socket.io)
The backend is explicitly separated into independent domains to ensure API logic never bleeds into WebSocket logic.

- **`server/src/api/`**: 
  - Express REST routes (`/me`, `/profile`, `/logs`, etc.)
  - HTTP-specific middlewares, rate limiters, and API types.
- **`server/src/socket/`**:
  - **`routes/`**: The WebSocket router and game actions (join, start, move).
  - **`game/modes/`**: Independent game logic controllers (`Classic` and `Multiplayer`).
  - **`game/core/`**: Shared base classes (`GameMode`), registries, and helpers (`onMoveSubmitted`).
  - **`types/`**: Socket-specific interfaces like the robust `IGameMode`.
- **`server/src/shared/`**:
  - Centralized utilities like `tryCatch` wrappers and `dbQueries.ts`.
  - Global `lib/` for env config and shared data types (`GameInfo`).

## 🛠 Tech Stack
- **Frontend:** Next.js, React, Tailwind CSS v4, Framer Motion
- **Backend:** Node.js, Express, Socket.io
- **Database:** Supabase (PostgreSQL)

## 💻 Local Setup

1. Clone the repository and install dependencies using `pnpm install` in both the `client/` and `server/` directories.
2. Set up your environment variables! Please copy the provided `.mockenv` file to `.env` and fill in your Supabase credentials and local ports.
3. Start the development servers:
   - Client: `cd client && pnpm dev`
   - Server: `cd server && pnpm dev`
