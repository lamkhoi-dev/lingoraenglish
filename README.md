# Lingora English

AI-powered English speaking coach — speaking practice, pronunciation, shadowing, listening, and IELTS/TOEFL/PTE test prep.

## Tech Stack
- React 19 + TanStack Start (SSR) + TanStack Router, Vite 8, Nitro
- Tailwind CSS 4
- Supabase (Postgres + Auth)
- AI (LLM/STT/TTS)

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```

2. Setup environment variables:
   Copy `.env.docker.example` to `.env` and fill in your values.

3. Run the development server:
   ```bash
   bun run dev
   ```

## Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run lint` - Run ESLint
- `bun run format` - Format code with Prettier

## Deployment

Deployed as a Docker container. See `docker-compose.yml` and `Dockerfile` for details.
