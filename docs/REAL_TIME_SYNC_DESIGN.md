# Real-Time Sync Design Document

## Problem Statement

When a user has the todo app open on multiple devices simultaneously (e.g., phone and tablet), changes made on one device are not reflected on the other until a manual page refresh. This creates a disjointed user experience and potential for conflicts.

## Current Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│ API Gateway │────▶│   Lambda    │────▶ DynamoDB
│  Frontend   │◀────│   (HTTP)    │◀────│  Functions  │◀────
└─────────────┘     └─────────────┘     └─────────────┘
```

The current architecture is request-response only. Clients have no way to receive server-initiated updates.

## Requirements

### Functional
- Changes made on one device appear on other devices within ~1-2 seconds
- Support for all CRUD operations: add, edit, toggle, delete, reorder
- Graceful degradation if real-time connection fails (fall back to refresh)
- Handle reconnection after network interruption

### Non-Functional
- Minimal latency (<500ms for propagation)
- Scale to reasonable user count (thousands of concurrent connections)
- Cost-effective for low-traffic periods
- Maintain serverless architecture benefits (no always-on servers)

## Options Analysis

### Option 1: Polling (Short/Long)

**How it works:** Client periodically requests updates from the server.

```
Client A ──POST /todos──▶ Server ──▶ DynamoDB
Client B ──GET /todos───▶ Server ──▶ DynamoDB (every N seconds)
```

**Pros:**
- Simplest to implement
- Works with existing HTTP API
- No new infrastructure

**Cons:**
- Not truly real-time (delay = polling interval)
- Wasteful - most requests return no changes
- Trade-off between latency and server load
- Poor battery life on mobile devices

**Cost:** Low base, but scales poorly with users and frequency.

**Verdict:** Acceptable for MVP but not recommended for production.

---

### Option 2: WebSockets via API Gateway

**How it works:** Persistent bidirectional connection. Server pushes updates to connected clients.

```
┌──────────┐      ┌─────────────────┐      ┌────────┐
│ Client A │◀────▶│ API Gateway     │◀────▶│ Lambda │
│ Client B │◀────▶│ (WebSocket API) │      │        │
└──────────┘      └─────────────────┘      └────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │  DynamoDB     │
                  │ (connections) │
                  └───────────────┘
```

**Architecture:**
1. Clients connect via WebSocket on app load
2. Connection IDs stored in DynamoDB (or ElastiCache)
3. On any mutation, Lambda broadcasts to all user's connections
4. Clients update local state on receiving message

**Pros:**
- True real-time updates
- Efficient - only sends data when changes occur
- Native AWS service, integrates well with existing stack
- Pay-per-message pricing

**Cons:**
- More complex than HTTP API
- Need to manage connection lifecycle
- Requires connection tracking infrastructure
- Two APIs to maintain (HTTP + WebSocket)

**Cost:**
- $0.25 per million connection minutes
- $1.00 per million messages
- Estimated: $1-5/month for typical usage

**Verdict:** Recommended approach - good balance of capability and complexity.

---

### Option 3: Server-Sent Events (SSE)

**How it works:** Unidirectional stream from server to client over HTTP.

**Pros:**
- Simpler than WebSockets
- Works over standard HTTP
- Built-in reconnection in browsers

**Cons:**
- Lambda has 29-second timeout for API Gateway
- Would need ALB + Fargate/ECS (breaks serverless model)
- One-way only - still need HTTP for mutations

**Verdict:** Not recommended for serverless architecture.

---

### Option 4: AWS AppSync

**How it works:** Managed GraphQL service with built-in subscriptions.

```
┌──────────┐      ┌─────────┐      ┌──────────┐
│ Clients  │◀────▶│ AppSync │◀────▶│ DynamoDB │
└──────────┘      └─────────┘      └──────────┘
```

**Pros:**
- Fully managed real-time subscriptions
- Built-in conflict resolution
- Offline support with Amplify client
- Single API for queries, mutations, and subscriptions

**Cons:**
- Requires migrating from REST to GraphQL
- Significant frontend rewrite (Apollo/Amplify client)
- Learning curve for GraphQL
- Vendor lock-in to AWS

**Cost:**
- $4.00 per million queries/mutations
- $2.00 per million real-time updates
- $0.08 per million connection-minutes

**Verdict:** Best option if starting fresh or willing to rewrite. Overkill for this use case.

---

### Option 5: Third-Party Services (Pusher, Ably, Firebase)

**How it works:** Dedicated real-time messaging service handles connections.

```
┌──────────┐      ┌─────────┐
│ Clients  │◀────▶│ Pusher  │
└──────────┘      └─────────┘
                       ▲
                       │ trigger
┌──────────┐      ┌────┴────┐
│ Lambda   │─────▶│   API   │
└──────────┘      └─────────┘
```

**Pros:**
- Very easy to integrate
- Handles all connection management
- Great SDKs and documentation
- Presence channels (see who's online)

**Cons:**
- Additional vendor dependency
- Data leaves AWS (latency, compliance)
- Monthly costs can add up

**Cost (Pusher):**
- Free tier: 200k messages/day, 100 connections
- Starter: $49/month for 2M messages, 500 connections

**Verdict:** Good for rapid development, but adds dependency.

---

## Recommendation: WebSockets via API Gateway

For this project, **API Gateway WebSocket API** is the recommended approach because:

1. **Stays within AWS ecosystem** - no new vendors
2. **Serverless** - maintains pay-per-use model
3. **Sufficient for use case** - simple broadcast to user's devices
4. **Reasonable complexity** - more work than polling, but manageable

## Implementation Design

### New Infrastructure

```yaml
# Addition to template.yaml
TodoWebSocketApi:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    Name: todo-app-websocket
    ProtocolType: WEBSOCKET
    RouteSelectionExpression: "$request.body.action"

ConnectionsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: todo-app-connections
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: connectionId
        AttributeType: S
      - AttributeName: userId
        AttributeType: S
    KeySchema:
      - AttributeName: connectionId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: userId-index
        KeySchema:
          - AttributeName: userId
            KeyType: HASH
        Projection:
          ProjectionType: ALL
```

### WebSocket Routes

| Route | Handler | Purpose |
|-------|---------|---------|
| `$connect` | `onConnect` | Authenticate and store connection |
| `$disconnect` | `onDisconnect` | Remove connection from table |
| `$default` | `onMessage` | Handle ping/pong, errors |

### Connection Flow

```
1. Client connects: wss://xxx.execute-api.region.amazonaws.com/prod?token=JWT

2. $connect Lambda:
   - Validate JWT token
   - Extract userId from token
   - Store { connectionId, userId, connectedAt } in ConnectionsTable

3. $disconnect Lambda:
   - Remove connection from ConnectionsTable
```

### Broadcast Flow

```
1. Client A makes HTTP request: PUT /todos/123

2. TodoFunction Lambda:
   - Update todo in DynamoDB
   - Query ConnectionsTable for all userId's connections
   - For each connection:
     - POST to API Gateway Management API
     - Send { action: "TODO_UPDATED", todo: {...} }

3. Client B receives WebSocket message:
   - Update local state with new todo data
```

### Frontend Changes

```typescript
// hooks/useWebSocket.ts
export function useWebSocket(onMessage: (data: TodoEvent) => void) {
  const { getToken } = useAuth()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const connect = async () => {
      const token = await getToken()
      const ws = new WebSocket(`${WS_URL}?token=${token}`)

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        onMessage(data)
      }

      ws.onclose = () => {
        // Reconnect with exponential backoff
        setTimeout(connect, 1000)
      }

      wsRef.current = ws
    }

    connect()
    return () => wsRef.current?.close()
  }, [getToken, onMessage])
}

// hooks/useTodos.ts - add handler for incoming events
const handleWebSocketMessage = useCallback((event: TodoEvent) => {
  switch (event.action) {
    case 'TODO_CREATED':
      setTodos(prev => [...prev, event.todo])
      break
    case 'TODO_UPDATED':
      setTodos(prev => prev.map(t => t.id === event.todo.id ? event.todo : t))
      break
    case 'TODO_DELETED':
      setTodos(prev => prev.filter(t => t.id !== event.todoId))
      break
    case 'TODOS_REORDERED':
      setTodos(event.todos)
      break
  }
}, [])

useWebSocket(handleWebSocketMessage)
```

### Message Format

```typescript
// Server -> Client messages
type TodoEvent =
  | { action: 'TODO_CREATED'; todo: Todo }
  | { action: 'TODO_UPDATED'; todo: Todo }
  | { action: 'TODO_DELETED'; todoId: string }
  | { action: 'TODOS_REORDERED'; todos: Todo[] }
  | { action: 'CONNECTED'; connectionId: string }
```

### Optimistic Updates with Reconciliation

To avoid duplicate updates (optimistic + WebSocket), tag local changes:

```typescript
const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

const addTodo = async (text: string) => {
  const tempId = crypto.randomUUID()
  setPendingIds(prev => new Set(prev).add(tempId))
  // ... optimistic update ...

  const response = await fetchWithAuth('/todos', { ... })
  const created = await response.json()

  // Replace temp ID, mark as synced
  setPendingIds(prev => {
    const next = new Set(prev)
    next.delete(tempId)
    return next
  })
}

const handleWebSocketMessage = (event: TodoEvent) => {
  if (event.action === 'TODO_CREATED' && !pendingIds.has(event.todo.id)) {
    // Only apply if not our own optimistic update
    setTodos(prev => [...prev, event.todo])
  }
}
```

## Cost Estimate

| Component | Monthly Cost (low traffic) |
|-----------|---------------------------|
| WebSocket connection minutes | ~$0.50 |
| WebSocket messages | ~$0.10 |
| Lambda invocations (connect/disconnect) | ~$0.10 |
| DynamoDB (connections table) | ~$0.25 |
| **Total** | **~$1-2/month** |

## Migration Path

### Phase 1: Infrastructure
1. Add WebSocket API and connections table to SAM template
2. Deploy Lambda handlers for connect/disconnect
3. Add broadcast utility function

### Phase 2: Backend Integration
1. Modify existing CRUD handlers to broadcast after mutations
2. Add error handling for failed broadcasts (don't fail the request)
3. Test with multiple browser tabs

### Phase 3: Frontend Integration
1. Add useWebSocket hook
2. Integrate with useTodos for state reconciliation
3. Add connection status indicator (optional)
4. Handle reconnection gracefully

### Phase 4: Polish
1. Add heartbeat/ping-pong to detect stale connections
2. Implement connection cleanup (scheduled Lambda)
3. Add metrics/logging for debugging

## Alternatives Considered but Rejected

| Alternative | Reason for Rejection |
|-------------|---------------------|
| DynamoDB Streams + Lambda | Still need delivery mechanism to clients |
| AWS IoT Core | Overkill, designed for IoT devices |
| EventBridge | Event routing, not client delivery |
| SNS/SQS | Server-to-server, not server-to-browser |

## Open Questions

1. **Should we show "someone else is editing" indicators?** (Presence)
2. **How to handle conflicts if two users edit the same todo?** (Last-write-wins vs. merge)
3. **Should offline changes queue and sync when reconnected?** (Offline-first)

## References

- [API Gateway WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)
- [Building Real-Time Applications with WebSocket APIs](https://aws.amazon.com/blogs/compute/announcing-websocket-apis-in-amazon-api-gateway/)
- [DynamoDB Streams for Change Data Capture](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
