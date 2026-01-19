import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

/**
 * Get all todos for a user
 */
async function getTodosByUser(userId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
  }));
  return result.Items || [];
}

/**
 * AppSync Lambda Resolver for reorderTodos mutation
 * Updates the order of multiple todos atomically using DynamoDB transactions
 */
export const handler = async (event) => {
  const { userId } = event.identity.resolverContext;
  const { todoIds } = event.arguments.input;

  // Validate input
  if (!Array.isArray(todoIds) || todoIds.length === 0) {
    throw new Error('todoIds must be a non-empty array');
  }

  if (todoIds.length > 100) {
    throw new Error('Cannot reorder more than 100 todos at once');
  }

  // Verify all todos belong to this user
  const todos = await getTodosByUser(userId);
  const todosMap = new Map(todos.map(t => [t.todoId, t]));
  const validIds = new Set(todos.map(t => t.todoId));

  for (const id of todoIds) {
    if (!validIds.has(id)) {
      throw new Error(`Todo ${id} not found`);
    }
  }

  // Build transaction items to update order for each todo
  const transactItems = todoIds.map((todoId, index) => ({
    Update: {
      TableName: TABLE_NAME,
      Key: { userId, todoId },
      UpdateExpression: 'SET #order = :order',
      ExpressionAttributeNames: { '#order': 'order' },
      ExpressionAttributeValues: { ':order': index }
    }
  }));

  // Execute transaction
  await docClient.send(new TransactWriteCommand({
    TransactItems: transactItems
  }));

  // Return updated todos in new order
  return todoIds.map((id, index) => {
    const todo = todosMap.get(id);
    return {
      id: todo.todoId,
      text: todo.text,
      completed: todo.completed,
      order: index,
      createdAt: todo.createdAt
    };
  });
};
