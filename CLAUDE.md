# CLAUDE.md - AI Assistant Guide

This document provides essential context for AI assistants working on this codebase.

## Project Overview

A full-stack todo list application featuring:
- React 19 + TypeScript frontend with Material-UI
- S3 + CloudFront static hosting
- AWS Lambda + API Gateway serverless backend
- DynamoDB for persistent storage
- Clerk authentication
- Drag-and-drop todo reordering

## Architecture

```
CloudFront → S3 (static frontend)
     ↓
Frontend (React/Vite) → API Gateway → Lambda Functions → DynamoDB
                            ↑
                    Clerk JWT Authentication
```

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, Material-UI, @dnd-kit, Clerk
**Hosting:** S3, CloudFront
**Backend:** Node.js 22, AWS Lambda, DynamoDB, Clerk JWT verification
**Testing:** Vitest, React Testing Library, jsdom

## Project Structure

```
/
├── src/                    # Frontend source
│   ├── main.tsx           # Entry point with Clerk setup
│   ├── App.tsx            # Root component
│   ├── App.test.tsx       # Component tests (16 tests)
│   ├── components/        # React components
│   │   ├── TodoInput.tsx  # New todo input form
│   │   ├── TodoItem.tsx   # Individual item with drag handle
│   │   └── TodoList.tsx   # List container with DnD context
│   ├── hooks/
│   │   └── useTodos.ts    # State management hook
│   ├── types/
│   │   └── Todo.ts        # TypeScript interfaces
│   └── test/
│       └── setup.ts       # Test setup (localStorage mock)
├── backend/               # AWS Lambda backend
│   ├── handler.mjs        # All API endpoints
│   ├── template.yaml      # SAM CloudFormation template
│   ├── samconfig.toml     # SAM deployment configuration
│   └── package.json       # Backend dependencies
├── package.json           # Frontend dependencies
├── tsconfig.json          # TypeScript config (strict mode)
├── vite.config.ts         # Vite + Vitest config
└── eslint.config.js       # ESLint flat config
```

## Development Commands

```bash
# Frontend
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm test             # Run tests in watch mode
npm test -- --run    # Run tests once

# Backend
cd backend
npm install          # Install backend dependencies
sam build            # Build Lambda function
sam deploy              # All params in samconfig.toml (secret in AWS Secrets Manager)

# Deploy frontend to S3/CloudFront
npm run build
aws s3 sync dist/ s3://<bucket-name>/ --delete
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"  # Optional: clear cache
```

## Environment Variables

**Frontend (.env.local):**
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk public key (required)
- `VITE_API_URL` - API Gateway URL (required)

**Backend (SAM parameter):**
- `ClerkSecretKey` - Clerk secret for JWT verification

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useTodos.ts` | Todo CRUD operations, API calls, optimistic updates |
| `src/components/TodoItem.tsx` | Individual todo with drag-drop, toggle, delete |
| `backend/handler.mjs` | All Lambda endpoints, auth, DynamoDB operations |
| `backend/template.yaml` | AWS infrastructure (Lambda, API Gateway, DynamoDB, S3, CloudFront) |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/todos` | List user's todos |
| POST | `/todos` | Create new todo |
| PUT | `/todos/{todoId}` | Update todo |
| DELETE | `/todos/{todoId}` | Delete todo |
| PATCH | `/todos/reorder` | Reorder todos |

All endpoints require Bearer token authentication.

## DynamoDB Schema

**Table:** `todo-app-todos`
- **Partition Key:** `userId` (string)
- **Sort Key:** `todoId` (string)
- **Attributes:** `text`, `completed`, `order`, `createdAt`

## Code Conventions

### TypeScript
- Strict mode enabled - no implicit any
- No unused variables or parameters
- Use interfaces over types where possible

### React Components
- Functional components with hooks
- Material-UI for all UI elements
- Controlled inputs
- Props destructuring in function signature

### State Management
- Custom hooks for complex state (`useTodos`)
- Optimistic UI updates with rollback on error
- Authentication tokens via Clerk's `useAuth`

### Testing
- Tests located alongside components (`App.test.tsx`)
- Mock Clerk auth state in tests
- Mock fetch API with in-memory store
- Test accessibility attributes and keyboard navigation

### Error Handling
- Try-catch for async operations
- Console error logging for debugging
- Restore previous state on API failures

## Important Patterns

### Optimistic Updates (useTodos.ts)
```typescript
// Save state before mutation
const previousTodos = [...todos];
// Update UI immediately
setTodos(/* new state */);
// API call
try {
  await fetchWithAuth(/* ... */);
} catch {
  // Rollback on failure
  setTodos(previousTodos);
}
```

### Authenticated API Calls
```typescript
const fetchWithAuth = async (url, options = {}) => {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};
```

### Drag-Drop Setup (TodoList.tsx)
- Uses @dnd-kit with vertical list strategy
- PointerSensor + KeyboardSensor for accessibility
- Calls `onReorder` with new order array

## Common Tasks

### Adding a New Todo Field
1. Update `src/types/Todo.ts` interface
2. Modify `src/components/TodoItem.tsx` UI
3. Update `src/hooks/useTodos.ts` API calls
4. Add field to DynamoDB in `backend/handler.mjs`
5. Update tests in `src/App.test.tsx`

### Adding a New API Endpoint
1. Add route in `backend/template.yaml`
2. Add handler case in `backend/handler.mjs`
3. Add frontend function in `src/hooks/useTodos.ts`

### Running Tests
```bash
npm test -- --run    # Single run
npm test             # Watch mode
```
Tests mock both Clerk auth and fetch API.

## Security Notes

- All API calls require valid Clerk JWT
- User isolation: todos partitioned by userId
- Input validation on both frontend and backend
- CORS restricted to specific origins (production + localhost dev)
- API rate limited (10 req/s, 20 burst)
- See SECURITY_ANALYSIS.md for full security review

## Known TODOs in Code

None - all security items addressed.
