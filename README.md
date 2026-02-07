# Millennium Admin

A Wikipedia-style admin interface built with Next.js and React.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, copy the environment sample file and fill in your values:

```bash
cp .env.sample .env
```

Edit `.env` with your actual credentials (see `.env.sample` for required variables).

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `src/` - Application source code
  - `app/` - Next.js App Router directory
    - `layout.tsx` - Root layout component
    - `page.tsx` - Home page (character overview)
    - `globals.css` - Global styles
    - `pages/` - Pages management
    - `users/` - Users management
    - `settings/` - Settings page
  - `components/` - Reusable React components
    - `CategorySection.tsx`, `Footer.tsx`, `Header.tsx`, `TableOfContents.tsx`
  - `lib/` - Utility libraries
    - `characters.ts`, `connections.ts`, `schema.ts`, `supabase.ts`
  - `types/` - TypeScript type definitions
    - `character.ts`, `connection.ts`, `database.ts`
  - `__tests__/` - Application tests
- `adws/` - AI Developer Workflow Scripts (TypeScript)
  - `agents/` - Agent implementations (build, plan, test, claude)
  - `core/` - Core utilities (state, config, data types)
  - `github/` - Git/GitHub operations (git, worktree, PR, comments)
  - `triggers/` - Workflow triggers (webhook, cron, issue classifier)
  - `__tests__/` - ADWS unit tests
- `e2e-tests/` - End-to-end test specifications
- `e2e-screenshots/` - E2E test screenshots
- `guidelines/` - Coding guidelines
- `specs/` - Issue implementation plans
- `.claude/` - Claude Code configuration (commands, hooks, settings)
- `.github/workflows/` - CI/CD pipeline

## Features

- Wikipedia-style clean and minimal design
- Responsive layout
- TypeScript support
- Next.js App Router
- Ready for admin functionality expansion

## Build

To create a production build:

```bash
npm run build
npm start
```

## Deployment Pipeline

This project uses a Vercel-based deployment pipeline with automatic staging deployments and manual approval for production.

### Pipeline Overview

The deployment pipeline follows this workflow:

1. **Preview/Staging Deployment** (Automatic)
   - Triggered on pushes to `develop` branch or feature branches
   - Automatically deploys to Vercel Preview environment
   - Provides preview URLs for testing and verification
   - No approval required

2. **Production Deployment** (Manual Approval)
   - Triggered on pushes to `main` branch
   - Requires manual approval via GitHub Actions
   - Deploys to Vercel Production environment
   - Only after verification of staging deployment

### Setup Instructions

#### 1. Vercel Project Setup

1. Connect your GitHub repository to Vercel:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import your GitHub repository
   - Configure the project settings:
     - **Framework Preset:** Next.js
     - **Root Directory:** `./`
     - **Build Command:** `npm run build`
     - **Output Directory:** `.next`
     - **Install Command:** `npm install`

2. Configure Environment Variables:
   - Go to **Project Settings > Environment Variables**
   - Add variables for **Preview** environment (staging)
   - Add variables for **Production** environment
   - See `ENV_VARIABLES.md` for required variables

3. Get Vercel Credentials:
   - Go to **Settings > Tokens**
   - Create a new token (name it "GitHub Actions")
   - Copy the token (you'll need it for GitHub Secrets)

#### 2. GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

1. Go to **Repository Settings > Secrets and variables > Actions**
2. Add the following secrets:

   - `VERCEL_TOKEN`: Your Vercel API token
   - `VERCEL_ORG_ID`: Your Vercel organization ID
     - Find this in Vercel Dashboard > Settings > General
   - `VERCEL_PROJECT_ID`: Your Vercel project ID
     - Find this in Vercel Dashboard > Project Settings > General

#### 3. GitHub Environment Protection Rules

Set up environment protection for production:

1. Go to **Repository Settings > Environments**
2. Create/configure the `production` environment:
   - Enable **Required reviewers** (add yourself or team members)
   - This ensures manual approval before production deployment

### Deployment Workflow

#### Automatic Staging Deployment

When you push to `develop` or create a feature branch:

```bash
git checkout develop
git push origin develop
```

- GitHub Actions automatically triggers
- Builds and deploys to Vercel Preview environment
- Preview URL is available in GitHub Actions logs
- No approval required

#### Production Deployment with Approval

1. **Merge to main branch:**
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

2. **GitHub Actions triggers:**
   - Build starts automatically
   - Deployment waits for approval

3. **Approve deployment:**
   - Go to GitHub Actions tab
   - Click on the running workflow
   - Review the "Deploy to Production" job
   - Click "Review deployments"
   - Approve the production deployment

4. **Deployment completes:**
   - Application is live on production
   - Production URL is updated

### Manual Deployment

You can also trigger deployments manually:

1. Go to **Actions** tab in GitHub
2. Select **Deploy to Vercel** workflow
3. Click **Run workflow**
4. Choose environment (staging or production)
5. Click **Run workflow**

### Environment Variables

- **Local Development:** Use `.env.local` (see `ENV_VARIABLES.md`)
- **Staging:** Configure in Vercel Dashboard for Preview environment
- **Production:** Configure in Vercel Dashboard for Production environment

See `ENV_VARIABLES.md` for detailed environment variable documentation.

### Monitoring Deployments

- **Vercel Dashboard:** View all deployments, logs, and analytics
- **GitHub Actions:** Monitor build and deployment status
- **Preview URLs:** Test staging deployments before production

### Rollback

If you need to rollback a production deployment:

1. Go to Vercel Dashboard
2. Navigate to your project
3. Go to **Deployments** tab
4. Find the previous working deployment
5. Click **...** menu > **Promote to Production**

### Troubleshooting

**Deployment fails:**
- Check GitHub Actions logs for build errors
- Verify environment variables are set correctly in Vercel
- Ensure `vercel.json` configuration is correct

**Approval not working:**
- Verify environment protection rules are set in GitHub
- Check that required reviewers are configured
- Ensure you have the correct permissions

**Environment variables not working:**
- Verify variables are set for the correct environment (Preview/Production)
- Check variable names match exactly (case-sensitive)
- Ensure `NEXT_PUBLIC_` prefix is used for client-side variables


