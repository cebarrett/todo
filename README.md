# Todo

A todo list app built with React, TypeScript, and Vite. Features Clerk authentication and cloud persistence with AWS DynamoDB.

## Architecture

```
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

The DynamoDB table `todo-app-todos` must exist with `userId` (partition key) and `todoId` (sort key).

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
