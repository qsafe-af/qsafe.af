# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automated deployment to Cloudflare Pages.

## Required Secrets

Before using these workflows, ensure the following secrets are configured in your repository settings:

- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token with Pages deployment permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

## Workflows

### 1. Deploy to Cloudflare Pages (`deploy.yml`)

**Simple deployment workflow**

- **Triggers**: Push to `main`, PR to `main`, manual dispatch
- **Purpose**: Basic deployment to Cloudflare Pages
- **Features**:
  - Builds the project
  - Deploys to production (main branch) or preview (PRs)
  - Adds preview URL comments on PRs

### 2. Deploy to Production (`deploy-production.yml`)

**Advanced production deployment workflow**

- **Triggers**: Push to `main`, manual dispatch
- **Purpose**: Production deployment with enhanced features
- **Features**:
  - Build caching for faster deployments
  - Build size reporting
  - Deployment status tracking
  - Error notifications
  - Build artifact uploads
  - GitHub deployment environment integration
  - Detailed deployment summaries

### 3. Preview Deployment (`preview.yml`)

**Pull request preview deployments**

- **Triggers**: PR opened, synchronized, or reopened
- **Purpose**: Automatic preview deployments for PRs
- **Features**:
  - Deploys to `pr-{number}.qsafe.pages.dev`
  - Updates PR comments with preview URLs
  - Cancels in-progress deployments for the same PR
  - Only runs when explorer files are changed

## Usage

### Manual Deployment

You can manually trigger a deployment from the Actions tab:

1. Go to the "Actions" tab in your repository
2. Select "Deploy to Production" workflow
3. Click "Run workflow"
4. Optionally check "Skip build cache" for a fresh build

### Preview URLs

For pull requests, preview deployments are available at:
```
https://pr-{PR_NUMBER}.qsafe.pages.dev
```

### Production URL

The production site is deployed to:
```
https://qsafe.pages.dev
```

## Customization

To use these workflows in another project:

1. Update the `project-name` in all workflows from `qsafe` to your project name
2. Adjust Node.js version if needed
3. Modify build commands if different from `yarn build`
4. Update cache paths if your build outputs are different

## Troubleshooting

### Deployment Failures

1. Check that secrets are properly configured
2. Verify Cloudflare API token has Pages deployment permissions
3. Ensure the project exists in Cloudflare Pages
4. Check workflow logs for specific error messages

### Cache Issues

If you experience build issues, you can:
- Manually trigger with "Skip build cache" option
- Clear GitHub Actions cache from repository settings

### Preview URL Not Working

- Ensure your Cloudflare Pages project supports branch deployments
- Check that the PR branch name is valid (no special characters)
- Verify the preview URL format matches your Pages configuration