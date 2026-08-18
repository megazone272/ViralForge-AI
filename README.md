# ViralForge AI — A-to-Z MVP

A production-oriented starter for an AI short-form video automation SaaS.

## What is included
- React + Vite dashboard
- Express + TypeScript API
- PostgreSQL + Prisma data model
- AI pipeline: idea → structured script/scenes → AI images → AI voice → FFmpeg render
- Projects, scenes, publishing jobs, social accounts, analytics schema
- Platform adapter layer for YouTube, TikTok and Meta
- Docker Compose for PostgreSQL
- Environment variable template
- Safe publishing behavior: adapters do not post until OAuth credentials and current platform API implementation are configured

## What requires your credentials / external setup
1. OpenAI API key.
2. FFmpeg installed on the API host.
3. PostgreSQL.
4. OAuth app credentials for Google/YouTube, TikTok and Meta.
5. Platform review/audit where required.

## Run
```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Web: http://localhost:5173
API: http://localhost:4000/api/health

## Important
This repo deliberately does NOT contain real OAuth secrets or automatically publish to social accounts. Add credentials to `.env` and implement/test each current platform adapter against the platform's official API requirements before enabling production publishing.
