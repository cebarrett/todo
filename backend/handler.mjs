import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { verifyToken } from '@clerk/backend';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// CORS headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

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

// GET /todos - List all todos for user
async function listTodos(userId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
  }));
  return result.Items || [];
}

// POST /todos - Create a new todo
async function createTodo(userId, todo) {
  const item = {
    userId,
    todoId: todo.id,
    text: todo.text,
    completed: todo.completed,
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

export const handler = async (event) => {
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
  const todoId = path.match(/\/todos\/(.+)/)?.[1];

  try {
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
