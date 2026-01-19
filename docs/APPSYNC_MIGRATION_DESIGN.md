# AppSync Migration Design Document

## Overview

This document outlines the migration from the current REST API (Lambda + API Gateway) to AWS AppSync (managed GraphQL). This migration enables future real-time sync via GraphQL subscriptions while simplifying the API layer.

## Current Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│ API Gateway │────▶│   Lambda    │────▶ DynamoDB
│  Frontend   │◀────│   (HTTP)    │◀────│  handler.mjs│◀────
└─────────────┘     └─────────────┘     └─────────────┘
```

**Current REST Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/todos` | List todos |
| POST | `/todos` | Create todo |
| PUT | `/todos/{todoId}` | Update todo |
| DELETE | `/todos/{todoId}` | Delete todo |
| PATCH | `/todos/reorder` | Reorder todos |

## Target Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│   AppSync   │────▶│  DynamoDB   │
│  Frontend   │◀────│  (GraphQL)  │◀────│   Direct    │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Lambda    │ (complex operations only)
                    └─────────────┘
```

**Key Changes:**
- AppSync handles most CRUD via direct DynamoDB resolvers
- Lambda only needed for complex operations (reorder)
- Single GraphQL endpoint replaces 5 REST endpoints
- Built-in subscription support for future real-time sync

## GraphQL Schema

```graphql
type Todo {
  id: ID!
  text: String!
  completed: Boolean!
  order: Int!
  createdAt: AWSDateTime!
}

input CreateTodoInput {
  text: String!
}

input UpdateTodoInput {
  id: ID!
  text: String
  completed: Boolean
}

input ReorderTodosInput {
  todoIds: [ID!]!
}

type Query {
  getTodo(id: ID!): Todo
  listTodos: [Todo!]!
}

type Mutation {
  createTodo(input: CreateTodoInput!): Todo!
  updateTodo(input: UpdateTodoInput!): Todo!
  deleteTodo(id: ID!): ID!
  reorderTodos(input: ReorderTodosInput!): [Todo!]!
}

type Subscription {
  onTodoCreated: Todo
    @aws_subscribe(mutations: ["createTodo"])
  onTodoUpdated: Todo
    @aws_subscribe(mutations: ["updateTodo"])
  onTodoDeleted: ID
    @aws_subscribe(mutations: ["deleteTodo"])
  onTodosReordered: [Todo]
    @aws_subscribe(mutations: ["reorderTodos"])
}
```

## Authentication

**Current:** Clerk JWT verified in Lambda handler

**Target:** AppSync with Lambda authorizer (to continue using Clerk)

```yaml
TodoApi:
  Type: AWS::AppSync::GraphQLApi
  Properties:
    Name: todo-app-api
    AuthenticationType: AWS_LAMBDA
    LambdaAuthorizerConfig:
      AuthorizerUri: !GetAtt AuthFunction.Arn
      AuthorizerResultTtlInSeconds: 300
```

**Auth Lambda:**
```javascript
// Validates Clerk JWT and returns AppSync auth response
export const handler = async (event) => {
  const token = event.authorizationToken.replace('Bearer ', '')

  try {
    const decoded = await verifyClerkToken(token)
    return {
      isAuthorized: true,
      resolverContext: {
        userId: decoded.sub
      }
    }
  } catch (error) {
    return { isAuthorized: false }
  }
}
```

The `userId` is then available in resolvers via `$ctx.identity.resolverContext.userId`.

## Resolver Mapping

### listTodos (DynamoDB Direct)

**Request Mapping (VTL):**
```velocity
{
  "version": "2018-05-29",
  "operation": "Query",
  "query": {
    "expression": "userId = :userId",
    "expressionValues": {
      ":userId": $util.dynamodb.toDynamoDBJson($ctx.identity.resolverContext.userId)
    }
  }
}
```

**Response Mapping:**
```velocity
#set($todos = [])
#foreach($item in $ctx.result.items)
  #set($todo = {
    "id": $item.todoId,
    "text": $item.text,
    "completed": $item.completed,
    "order": $item.order,
    "createdAt": $item.createdAt
  })
  $util.qr($todos.add($todo))
#end
## Sort by order field
#set($sorted = $util.list.sortList($todos, false, "order"))
$util.toJson($sorted)
```

### createTodo (DynamoDB Direct)

**Request Mapping:**
```velocity
#set($todoId = $util.autoId())
#set($now = $util.time.nowISO8601())
{
  "version": "2018-05-29",
  "operation": "PutItem",
  "key": {
    "userId": $util.dynamodb.toDynamoDBJson($ctx.identity.resolverContext.userId),
    "todoId": $util.dynamodb.toDynamoDBJson($todoId)
  },
  "attributeValues": {
    "text": $util.dynamodb.toDynamoDBJson($ctx.args.input.text),
    "completed": $util.dynamodb.toDynamoDBJson(false),
    "order": $util.dynamodb.toDynamoDBJson($util.time.nowEpochMilliSeconds()),
    "createdAt": $util.dynamodb.toDynamoDBJson($now)
  }
}
```

**Response Mapping:**
```velocity
{
  "id": "$ctx.result.todoId",
  "text": "$ctx.result.text",
  "completed": $ctx.result.completed,
  "order": $ctx.result.order,
  "createdAt": "$ctx.result.createdAt"
}
```

### updateTodo (DynamoDB Direct)

**Request Mapping:**
```velocity
#set($expression = "SET ")
#set($expValues = {})
#set($expNames = {})

#if($ctx.args.input.text)
  #set($expression = "${expression}#text = :text, ")
  $util.qr($expValues.put(":text", $util.dynamodb.toDynamoDB($ctx.args.input.text)))
  $util.qr($expNames.put("#text", "text"))
#end

#if($util.isBoolean($ctx.args.input.completed))
  #set($expression = "${expression}completed = :completed, ")
  $util.qr($expValues.put(":completed", $util.dynamodb.toDynamoDB($ctx.args.input.completed)))
#end

#set($expression = $expression.substring(0, $expression.length() - 2))

{
  "version": "2018-05-29",
  "operation": "UpdateItem",
  "key": {
    "userId": $util.dynamodb.toDynamoDBJson($ctx.identity.resolverContext.userId),
    "todoId": $util.dynamodb.toDynamoDBJson($ctx.args.input.id)
  },
  "update": {
    "expression": "$expression",
    "expressionNames": $util.toJson($expNames),
    "expressionValues": $util.toJson($expValues)
  },
  "condition": {
    "expression": "attribute_exists(userId)"
  }
}
```

### deleteTodo (DynamoDB Direct)

**Request Mapping:**
```velocity
{
  "version": "2018-05-29",
  "operation": "DeleteItem",
  "key": {
    "userId": $util.dynamodb.toDynamoDBJson($ctx.identity.resolverContext.userId),
    "todoId": $util.dynamodb.toDynamoDBJson($ctx.args.id)
  },
  "condition": {
    "expression": "attribute_exists(userId)"
  }
}
```

**Response Mapping:**
```velocity
"$ctx.args.id"
```

### reorderTodos (Lambda Resolver)

Reordering requires updating multiple items atomically - use Lambda for this:

```javascript
export const handler = async (event) => {
  const { userId } = event.identity.resolverContext
  const { todoIds } = event.arguments.input

  // Validate all todos belong to user
  const todos = await getTodosByUser(userId)
  const validIds = new Set(todos.map(t => t.todoId))

  for (const id of todoIds) {
    if (!validIds.has(id)) {
      throw new Error(`Todo ${id} not found`)
    }
  }

  // Update order for each todo
  const updates = todoIds.map((todoId, index) => ({
    Update: {
      TableName: TABLE_NAME,
      Key: { userId, todoId },
      UpdateExpression: 'SET #order = :order',
      ExpressionAttributeNames: { '#order': 'order' },
      ExpressionAttributeValues: { ':order': index }
    }
  }))

  await dynamodb.transactWrite({ TransactItems: updates })

  // Return updated todos in new order
  return todoIds.map((id, index) => {
    const todo = todos.find(t => t.todoId === id)
    return { ...todo, id: todo.todoId, order: index }
  })
}
```

## Frontend Changes

### Dependencies

```bash
npm uninstall  # nothing to remove, fetch is built-in
npm install @aws-amplify/api graphql
```

### GraphQL Client Setup

```typescript
// src/graphql/client.ts
import { Amplify } from 'aws-amplify'
import { generateClient } from 'aws-amplify/api'

Amplify.configure({
  API: {
    GraphQL: {
      endpoint: import.meta.env.VITE_APPSYNC_URL,
      defaultAuthMode: 'lambda',
    }
  }
})

export const client = generateClient()
```

### Custom Auth Header

```typescript
// src/graphql/client.ts
import { useAuth } from '@clerk/clerk-react'

// Create a hook that provides authenticated client
export function useGraphQLClient() {
  const { getToken } = useAuth()

  return {
    async query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
      const token = await getToken()
      const response = await client.graphql({
        query: document,
        variables,
        authToken: token
      })
      return response.data
    },
    async mutate<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
      const token = await getToken()
      const response = await client.graphql({
        query: document,
        variables,
        authToken: token
      })
      return response.data
    }
  }
}
```

### GraphQL Operations

```typescript
// src/graphql/operations.ts
export const LIST_TODOS = /* GraphQL */ `
  query ListTodos {
    listTodos {
      id
      text
      completed
      order
      createdAt
    }
  }
`

export const CREATE_TODO = /* GraphQL */ `
  mutation CreateTodo($input: CreateTodoInput!) {
    createTodo(input: $input) {
      id
      text
      completed
      order
      createdAt
    }
  }
`

export const UPDATE_TODO = /* GraphQL */ `
  mutation UpdateTodo($input: UpdateTodoInput!) {
    updateTodo(input: $input) {
      id
      text
      completed
      order
      createdAt
    }
  }
`

export const DELETE_TODO = /* GraphQL */ `
  mutation DeleteTodo($id: ID!) {
    deleteTodo(id: $id)
  }
`

export const REORDER_TODOS = /* GraphQL */ `
  mutation ReorderTodos($input: ReorderTodosInput!) {
    reorderTodos(input: $input) {
      id
      text
      completed
      order
      createdAt
    }
  }
`
```

### Updated useTodos Hook

```typescript
// src/hooks/useTodos.ts
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useGraphQLClient } from '../graphql/client'
import { LIST_TODOS, CREATE_TODO, UPDATE_TODO, DELETE_TODO, REORDER_TODOS } from '../graphql/operations'
import type { Todo } from '../types/Todo'

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isSignedIn } = useAuth()
  const client = useGraphQLClient()

  // Fetch todos
  useEffect(() => {
    if (!isSignedIn) {
      setTodos([])
      setIsLoading(false)
      return
    }

    const fetchTodos = async () => {
      try {
        const data = await client.query<{ listTodos: Todo[] }>(LIST_TODOS)
        setTodos(data.listTodos)
      } catch (error) {
        console.error('Failed to fetch todos:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTodos()
  }, [isSignedIn, client])

  // Add todo (with optimistic update)
  const addTodo = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const tempId = crypto.randomUUID()
    const tempTodo: Todo = {
      id: tempId,
      text: trimmed,
      completed: false,
      order: Date.now(),
      createdAt: new Date().toISOString()
    }

    const previousTodos = [...todos]
    setTodos(prev => [...prev, tempTodo])

    try {
      const data = await client.mutate<{ createTodo: Todo }>(CREATE_TODO, {
        input: { text: trimmed }
      })
      setTodos(prev => prev.map(t => t.id === tempId ? data.createTodo : t))
    } catch (error) {
      console.error('Failed to create todo:', error)
      setTodos(previousTodos)
    }
  }, [todos, client])

  // Toggle todo
  const toggleTodo = useCallback(async (id: string) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return

    const previousTodos = [...todos]
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ))

    try {
      await client.mutate(UPDATE_TODO, {
        input: { id, completed: !todo.completed }
      })
    } catch (error) {
      console.error('Failed to toggle todo:', error)
      setTodos(previousTodos)
    }
  }, [todos, client])

  // Edit todo
  const editTodo = useCallback(async (id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const previousTodos = [...todos]
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, text: trimmed } : t
    ))

    try {
      await client.mutate(UPDATE_TODO, {
        input: { id, text: trimmed }
      })
    } catch (error) {
      console.error('Failed to edit todo:', error)
      setTodos(previousTodos)
    }
  }, [todos, client])

  // Delete todo
  const deleteTodo = useCallback(async (id: string) => {
    const previousTodos = [...todos]
    setTodos(prev => prev.filter(t => t.id !== id))

    try {
      await client.mutate(DELETE_TODO, { id })
    } catch (error) {
      console.error('Failed to delete todo:', error)
      setTodos(previousTodos)
    }
  }, [todos, client])

  // Reorder todos
  const reorderTodos = useCallback(async (todoIds: string[]) => {
    const previousTodos = [...todos]
    const reordered = todoIds.map((id, index) => {
      const todo = todos.find(t => t.id === id)!
      return { ...todo, order: index }
    })
    setTodos(reordered)

    try {
      await client.mutate(REORDER_TODOS, {
        input: { todoIds }
      })
    } catch (error) {
      console.error('Failed to reorder todos:', error)
      setTodos(previousTodos)
    }
  }, [todos, client])

  // Move helpers remain the same
  const moveTodoUp = useCallback((id: string) => {
    const index = todos.findIndex(t => t.id === id)
    if (index <= 0) return
    const newOrder = todos.map(t => t.id)
    ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
    reorderTodos(newOrder)
  }, [todos, reorderTodos])

  const moveTodoDown = useCallback((id: string) => {
    const index = todos.findIndex(t => t.id === id)
    if (index < 0 || index >= todos.length - 1) return
    const newOrder = todos.map(t => t.id)
    ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    reorderTodos(newOrder)
  }, [todos, reorderTodos])

  return {
    todos,
    isLoading,
    addTodo,
    toggleTodo,
    editTodo,
    deleteTodo,
    moveTodoUp,
    moveTodoDown,
    reorderTodos
  }
}
```

## Infrastructure (SAM Template)

```yaml
# backend/template.yaml additions

TodoGraphQLApi:
  Type: AWS::AppSync::GraphQLApi
  Properties:
    Name: todo-app-graphql
    AuthenticationType: AWS_LAMBDA
    LambdaAuthorizerConfig:
      AuthorizerUri: !GetAtt AuthFunction.Arn
      AuthorizerResultTtlInSeconds: 300
      IdentityValidationExpression: "^Bearer .+$"

TodoGraphQLSchema:
  Type: AWS::AppSync::GraphQLSchema
  Properties:
    ApiId: !GetAtt TodoGraphQLApi.ApiId
    DefinitionS3Location: ./schema.graphql

TodosDataSource:
  Type: AWS::AppSync::DataSource
  Properties:
    ApiId: !GetAtt TodoGraphQLApi.ApiId
    Name: TodosTable
    Type: AMAZON_DYNAMODB
    DynamoDBConfig:
      AwsRegion: !Ref AWS::Region
      TableName: !Ref TodosTable
    ServiceRoleArn: !GetAtt AppSyncDynamoDBRole.Arn

ReorderLambdaDataSource:
  Type: AWS::AppSync::DataSource
  Properties:
    ApiId: !GetAtt TodoGraphQLApi.ApiId
    Name: ReorderLambda
    Type: AWS_LAMBDA
    LambdaConfig:
      LambdaFunctionArn: !GetAtt ReorderFunction.Arn
    ServiceRoleArn: !GetAtt AppSyncLambdaRole.Arn

# Resolvers
ListTodosResolver:
  Type: AWS::AppSync::Resolver
  Properties:
    ApiId: !GetAtt TodoGraphQLApi.ApiId
    TypeName: Query
    FieldName: listTodos
    DataSourceName: !GetAtt TodosDataSource.Name
    RequestMappingTemplateS3Location: ./resolvers/listTodos.request.vtl
    ResponseMappingTemplateS3Location: ./resolvers/listTodos.response.vtl

CreateTodoResolver:
  Type: AWS::AppSync::Resolver
  Properties:
    ApiId: !GetAtt TodoGraphQLApi.ApiId
    TypeName: Mutation
    FieldName: createTodo
    DataSourceName: !GetAtt TodosDataSource.Name
    RequestMappingTemplateS3Location: ./resolvers/createTodo.request.vtl
    ResponseMappingTemplateS3Location: ./resolvers/createTodo.response.vtl

# ... additional resolvers for updateTodo, deleteTodo, reorderTodos

AuthFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: todo-app-auth
    Handler: auth.handler
    Runtime: nodejs22.x
    CodeUri: ./
    Environment:
      Variables:
        CLERK_SECRET_KEY: !Sub '{{resolve:secretsmanager:todo-app/clerk:SecretString:secret_key}}'

ReorderFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: todo-app-reorder
    Handler: reorder.handler
    Runtime: nodejs22.x
    CodeUri: ./
    Environment:
      Variables:
        TABLE_NAME: !Ref TodosTable
    Policies:
      - DynamoDBCrudPolicy:
          TableName: !Ref TodosTable

AppSyncDynamoDBRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: appsync.amazonaws.com
          Action: sts:AssumeRole
    Policies:
      - PolicyName: DynamoDBAccess
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - dynamodb:GetItem
                - dynamodb:PutItem
                - dynamodb:UpdateItem
                - dynamodb:DeleteItem
                - dynamodb:Query
              Resource: !GetAtt TodosTable.Arn

Outputs:
  GraphQLApiEndpoint:
    Value: !GetAtt TodoGraphQLApi.GraphQLUrl
  GraphQLApiId:
    Value: !GetAtt TodoGraphQLApi.ApiId
```

## Migration Plan

### Phase 1: Infrastructure Setup
1. Add AppSync resources to SAM template
2. Create GraphQL schema file
3. Write VTL resolver templates
4. Create auth Lambda function
5. Deploy and test via AppSync console

### Phase 2: Backend Validation
1. Test all queries/mutations via AppSync console
2. Verify auth works with Clerk tokens
3. Confirm user isolation (can't access other users' todos)
4. Test error handling

### Phase 3: Frontend Migration
1. Install Amplify dependencies
2. Create GraphQL client with Clerk auth
3. Update useTodos hook to use GraphQL
4. Update environment variables
5. Test all CRUD operations

### Phase 4: Cleanup
1. Remove old REST API from template.yaml
2. Delete old Lambda handler
3. Update CORS settings (if needed)
4. Update documentation

### Phase 5: Enable Subscriptions (Future)
1. Add subscription resolvers
2. Create useSubscription hook
3. Integrate real-time updates with useTodos
4. Remove REAL_TIME_SYNC_DESIGN.md (superseded)

## Environment Variables

**New:**
- `VITE_APPSYNC_URL` - AppSync GraphQL endpoint

**Removed:**
- `VITE_API_URL` - Old REST API URL

## Cost Comparison

| Component | REST (Current) | AppSync |
|-----------|---------------|---------|
| API requests (100k/month) | ~$0.10 | ~$0.40 |
| Lambda invocations | ~$0.20 | ~$0.05 (auth + reorder only) |
| Data transfer | ~$0.10 | ~$0.10 |
| **Total** | **~$0.40/month** | **~$0.55/month** |

Slightly higher cost, but subscriptions included at no additional base cost.

## Rollback Plan

If issues arise:
1. Keep REST API deployed during migration
2. Frontend can switch between `VITE_API_URL` and `VITE_APPSYNC_URL`
3. Feature flag to toggle between REST and GraphQL hooks
4. Full rollback: revert frontend, delete AppSync resources

## Testing Checklist

- [ ] List todos returns user's todos only
- [ ] Create todo adds to list
- [ ] Update todo changes text
- [ ] Toggle todo changes completed status
- [ ] Delete todo removes from list
- [ ] Reorder todos persists new order
- [ ] Auth rejects invalid/missing tokens
- [ ] Auth rejects requests for other users' todos
- [ ] Optimistic updates work correctly
- [ ] Error handling rolls back optimistic updates
- [ ] Works on multiple browsers/devices

## Open Questions

1. **Caching strategy?** AppSync has built-in caching - worth enabling?
2. **Offline support?** Amplify DataStore provides this - needed for MVP?
3. **Schema versioning?** How to handle breaking schema changes?

## References

- [AWS AppSync Developer Guide](https://docs.aws.amazon.com/appsync/latest/devguide/)
- [AppSync with Lambda Authorizers](https://docs.aws.amazon.com/appsync/latest/devguide/security-authz.html#aws-lambda-authorization)
- [VTL Resolver Reference](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference.html)
- [Amplify GraphQL Client](https://docs.amplify.aws/gen2/build-a-backend/data/)
