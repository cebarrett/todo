import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { verifyToken } from '@clerk/backend';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// CORS configuration
const ALLOWED_ORIGINS = [
  'https://app.cebarrett.me',
  'http://localhost:5173',
  'http://localhost:4173',
];

function getCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

// Verify Clerk JWT and extract userId
async function authenticateRequest(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const { sub: userId } = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    return userId;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// GET /todos - List all todos for user, sorted by order
async function listTodos(userId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
  }));
  const items = result.Items || [];
  // Sort by order field (items without order go to end)
  return items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

// POST /todos - Create a new todo
// TODO: Generate todoId server-side instead of accepting client-provided ID
async function createTodo(userId, todo) {
  // Get current todos to determine next order value
  const existing = await listTodos(userId);
  const maxOrder = existing.reduce((max, t) => Math.max(max, t.order ?? 0), 0);

  const item = {
    userId,
    todoId: todo.id,
    text: todo.text,
    completed: todo.completed,
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  }));
  return item;
}

// PUT /todos/:id - Update a todo
async function updateTodo(userId, todoId, updates) {
  const result = await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, todoId },
    UpdateExpression: 'SET #text = :text, completed = :completed',
    ExpressionAttributeNames: { '#text': 'text' },
    ExpressionAttributeValues: {
      ':text': updates.text,
      ':completed': updates.completed,
    },
    ConditionExpression: 'attribute_exists(todoId)',
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
}

// DELETE /todos/:id - Delete a todo
async function deleteTodo(userId, todoId) {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { userId, todoId },
  }));
}

// PATCH /todos/reorder - Update order of todos
async function reorderTodos(userId, todoIds) {
  // Validate input
  if (!Array.isArray(todoIds) || todoIds.length === 0 || todoIds.length > 1000) {
    throw new Error('Invalid todoIds array');
  }

  // Verify all todoIds belong to this user
  const existingTodos = await listTodos(userId);
  const existingIds = new Set(existingTodos.map(t => t.todoId));
  const allValid = todoIds.every(id => existingIds.has(id));
  if (!allValid) {
    throw new Error('Invalid todoId in array');
  }

  // Update each todo with its new order based on position in array
  const updatePromises = todoIds.map((todoId, index) =>
    docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId, todoId },
      UpdateExpression: 'SET #order = :order',
      ExpressionAttributeNames: { '#order': 'order' },
      ExpressionAttributeValues: { ':order': index },
    }))
  );
  await Promise.all(updatePromises);
}

export const handler = async (event) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Authenticate
  const userId = await authenticateRequest(event);
  if (!userId) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const method = event.requestContext?.http?.method;
  const path = event.rawPath;
  const todoId = path.match(/\/todos\/([^/]+)$/)?.[1];
  const isReorderPath = path === '/todos/reorder';

  try {
    // Handle reorder endpoint
    if (method === 'PATCH' && isReorderPath) {
      const body = JSON.parse(event.body);
      await reorderTodos(userId, body.todoIds);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    switch (method) {
      case 'GET': {
        const todos = await listTodos(userId);
        return { statusCode: 200, headers, body: JSON.stringify(todos) };
      }
      case 'POST': {
        const body = JSON.parse(event.body);
        const todo = await createTodo(userId, body);
        return { statusCode: 201, headers, body: JSON.stringify(todo) };
      }
      case 'PUT': {
        if (!todoId) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing todoId' }) };
        }
        const body = JSON.parse(event.body);
        const todo = await updateTodo(userId, todoId, body);
        return { statusCode: 200, headers, body: JSON.stringify(todo) };
      }
      case 'DELETE': {
        if (!todoId) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing todoId' }) };
        }
        await deleteTodo(userId, todoId);
        return { statusCode: 204, headers, body: '' };
      }
      default:
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
  } catch (error) {
    console.error('Error:', error);
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Todo not found' }),
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
