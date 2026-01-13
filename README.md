# Todo

A todo list app built with React, TypeScript, and Vite. Features Clerk authentication and cloud persistence with AWS DynamoDB.

## Architecture

```
CloudFront → S3 (frontend)
     ↓
React App → API Gateway → Lambda → DynamoDB
                 ↑
           Clerk JWT auth
```

## Setup

### Frontend

```bash
npm install
```

Create `.env.local` with your Clerk and API credentials:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=https://your-api-id.execute-api.us-west-2.amazonaws.com
```

### Backend

Requires AWS CLI and SAM CLI installed and configured.

```bash
cd backend
npm install
sam build
sam deploy --stack-name todo-app --capabilities CAPABILITY_IAM \
  --resolve-s3 --parameter-overrides ClerkSecretKey=$CLERK_SECRET_KEY
```

This creates:
- DynamoDB table (`todo-app-todos`)
- Lambda function with API Gateway
- S3 bucket for frontend hosting
- CloudFront distribution

## Deployment

After deploying the backend, upload the frontend to S3:

```bash
npm run build
aws s3 sync dist/ s3://todo-app-frontend-<account-id>/ --delete
```

To invalidate CloudFront cache after updates:

```bash
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

Get the CloudFront URL and S3 bucket name from the stack outputs:

```bash
aws cloudformation describe-stacks --stack-name todo-app --query "Stacks[0].Outputs"
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test        # watch mode
npm test -- --run  # single run
```

## Build

```bash
npm run build
npm run preview  # preview production build
```

## Linting

```bash
npm run lint
```
