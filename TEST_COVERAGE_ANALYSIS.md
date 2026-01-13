# Test Coverage Analysis

## Executive Summary

This document analyzes the current test coverage of the Todo application and identifies areas for improvement. The application has **good integration test coverage** for frontend happy-path scenarios, but has **significant gaps** in unit testing, error handling, and backend coverage.

**Current Test Status:** Tests are partially failing due to missing environment variable (`VITE_API_URL`) in the test setup.

---

## Current Test Infrastructure

### Test Stack
- **Framework:** Vitest v4.0.16
- **Testing Libraries:**
  - `@testing-library/react` v16.3.1
  - `@testing-library/jest-dom` v6.9.1
  - `@testing-library/user-event` v14.6.1
- **Environment:** jsdom

### Test Files
| File | Lines | Status |
|------|-------|--------|
| `src/App.test.tsx` | 355 | 17 test cases |
| `src/test/setup.ts` | 22 | Test configuration |

---

## Coverage Analysis by Area

### 1. Frontend Integration Tests (App.test.tsx)

**Status:** Comprehensive for happy-path scenarios

**What's Tested:**
- Authentication states (signed in/signed out)
- Todo CRUD operations (add, toggle, delete)
- Input validation (empty/whitespace rejection)
- Todo reordering (move up/down buttons)
- Drag-and-drop accessibility attributes
- Empty state rendering

**What's Missing:**
- [ ] API error handling scenarios
- [ ] Network timeout/failure scenarios
- [ ] Loading state verification
- [ ] Concurrent operation handling
- [ ] Input character limit validation (maxLength: 250)

---

### 2. Component Unit Tests

**Status:** NOT TESTED - Components only tested through integration

#### TodoInput.tsx (42 lines)
**Missing Tests:**
- [ ] Controlled input behavior
- [ ] Form submission with Enter key
- [ ] Character limit enforcement
- [ ] Button disabled state when empty
- [ ] Component isolation with mocked `onAdd`

#### TodoItem.tsx (85 lines)
**Missing Tests:**
- [ ] Checkbox toggle calls `onToggle`
- [ ] Delete button calls `onDelete`
- [ ] Move up/down button behaviors
- [ ] `isFirst`/`isLast` disabled states
- [ ] Completed todo styling (line-through)
- [ ] Drag handle attributes
- [ ] DnD Kit sortable integration

#### TodoList.tsx (75 lines)
**Missing Tests:**
- [ ] Empty list rendering
- [ ] DnD context setup
- [ ] `handleDragEnd` logic
- [ ] Correct props passed to TodoItem children
- [ ] Keyboard sensor configuration

---

### 3. Custom Hook Tests

**Status:** NOT TESTED - Critical gap

#### useTodos.ts (156 lines)
This hook contains all business logic and API interactions. **Zero test coverage.**

**Missing Tests:**
- [ ] Initial fetch on mount
- [ ] `addTodo()` - optimistic update + API call
- [ ] `addTodo()` - rollback on API failure
- [ ] `toggleTodo()` - state update + API call
- [ ] `toggleTodo()` - rollback on failure
- [ ] `deleteTodo()` - removal + API call
- [ ] `deleteTodo()` - rollback on failure
- [ ] `moveTodoUp()` / `moveTodoDown()` - index bounds
- [ ] `reorderTodos()` - splice logic
- [ ] `persistOrder()` - API call
- [ ] `fetchWithAuth()` - token attachment
- [ ] API response mapping (todoId -> id)
- [ ] Error handling for each operation

---

### 4. Backend Tests

**Status:** NO TEST INFRASTRUCTURE EXISTS - Critical gap

#### handler.mjs (195 lines)
**Missing Tests for Functions:**

| Function | Lines | Risk Level | Missing Tests |
|----------|-------|------------|---------------|
| `authenticateRequest()` | 20-34 | HIGH | JWT verification, missing token, invalid token, expired token |
| `listTodos()` | 37-46 | MEDIUM | DynamoDB query, sort logic, empty results |
| `createTodo()` | 50-68 | HIGH | Order calculation, duplicate handling, input validation |
| `updateTodo()` | 71-85 | MEDIUM | Conditional update, non-existent todo |
| `deleteTodo()` | 88-93 | MEDIUM | Non-existent todo, cascade effects |
| `reorderTodos()` | 96-121 | HIGH | Input validation, ownership verification, batch updates |
| `handler()` | 123-195 | HIGH | Routing, CORS, error responses |

---

## Priority Recommendations

### Priority 1: Fix Existing Test Environment (Immediate)

The tests are failing because `VITE_API_URL` is undefined. Two approaches:

**Option A:** Set environment variable in test setup
```typescript
// src/test/setup.ts
import.meta.env.VITE_API_URL = 'http://localhost:3000'
```

**Option B:** Mock at fetch level (current approach needs fixing)
```typescript
// App.test.tsx - update fetch mock to handle undefined URL
global.fetch = vi.fn((url: string, options?: RequestInit) => {
  const path = url.replace(/^.*\/todos/, '/todos') // Handle full URLs
  // ... rest of mock
})
```

### Priority 2: Add useTodos Hook Tests (High Value)

Create `src/hooks/useTodos.test.ts` with:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTodos } from './useTodos'
import { vi } from 'vitest'

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue('mock-token') }),
}))

describe('useTodos', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('fetches todos on mount', async () => {
    (global.fetch as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const { result } = renderHook(() => useTodos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/todos'),
      expect.any(Object)
    )
  })

  it('rolls back optimistic add on API failure', async () => {
    // ... test implementation
  })

  // ... more tests
})
```

### Priority 3: Add Backend Tests (High Risk Area)

Create `backend/handler.test.mjs`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler } from './handler.mjs'

// Mock AWS SDK
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({
      send: vi.fn(),
    }),
  },
  QueryCommand: vi.fn(),
  PutCommand: vi.fn(),
  UpdateCommand: vi.fn(),
  DeleteCommand: vi.fn(),
}))

// Mock Clerk
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}))

describe('handler', () => {
  describe('authentication', () => {
    it('returns 401 when no auth header', async () => {
      const event = {
        headers: {},
        requestContext: { http: { method: 'GET' } },
        rawPath: '/todos'
      }
      const response = await handler(event)
      expect(response.statusCode).toBe(401)
    })

    it('returns 401 for invalid token', async () => {
      // ... test implementation
    })
  })

  describe('GET /todos', () => {
    it('returns sorted todos for authenticated user', async () => {
      // ... test implementation
    })
  })

  // ... more tests
})
```

### Priority 4: Add Component Unit Tests (Medium Value)

Create isolated tests for each component:

- `src/components/TodoInput.test.tsx`
- `src/components/TodoItem.test.tsx`
- `src/components/TodoList.test.tsx`

### Priority 5: Add Error Handling Tests

Expand `App.test.tsx` to include:

```typescript
describe('error handling', () => {
  it('shows error message when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<App />)
    // ... assert error state
  })

  it('rolls back optimistic update on save failure', async () => {
    // ... test implementation
  })

  it('handles concurrent operations gracefully', async () => {
    // ... test implementation
  })
})
```

---

## Test Coverage Goals

| Area | Current | Target |
|------|---------|--------|
| Frontend Integration | ~70% | 90% |
| Component Unit Tests | 0% | 80% |
| Hook Unit Tests | 0% | 90% |
| Backend Unit Tests | 0% | 85% |
| Error Handling | ~10% | 80% |

---

## Recommended Test File Structure

```
src/
├── App.test.tsx                    # Integration tests (exists)
├── test/
│   └── setup.ts                    # Test setup (exists)
├── components/
│   ├── TodoInput.test.tsx          # NEW
│   ├── TodoItem.test.tsx           # NEW
│   └── TodoList.test.tsx           # NEW
└── hooks/
    └── useTodos.test.ts            # NEW

backend/
├── handler.mjs                     # Lambda handler
├── handler.test.mjs                # NEW - Unit tests
└── package.json                    # Add test script
```

---

## Immediate Action Items

1. **Fix test environment** - Add `VITE_API_URL` to test setup
2. **Add `useTodos.test.ts`** - Highest value, covers core business logic
3. **Add backend test infrastructure** - Install Vitest in backend, create handler tests
4. **Add API failure tests** - Ensure UI handles errors gracefully
5. **Add component tests** - Improve maintainability with isolated unit tests

---

## Security Testing Gaps

The following security-related tests should be added:

- [ ] XSS prevention in todo text rendering
- [ ] Input sanitization (special characters, HTML)
- [ ] Token expiration handling
- [ ] Rate limiting behavior
- [ ] CORS configuration validation

---

## Conclusion

The codebase has a solid foundation for integration testing but lacks:
1. Unit tests for isolated components and hooks
2. Any backend test coverage
3. Error/edge case handling tests

Addressing these gaps will significantly improve code reliability and maintainability.
