# Blake Scrapes

Starter landing page and booking form for Blake's snow and ice scraping service.

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and add the Supabase service-role key.
3. Run `supabase.sql` in the Supabase SQL editor.
4. `npm run dev`

Deploy by importing this repository into Vercel and adding the same environment variables.

## Staff portal

Staff Login connects the website to the owner and employee portal. See
[staff portal setup and workflow](docs/staff-portal.md), including the additional
Supabase migration required for employee accounts, routes, requests, and photos.
