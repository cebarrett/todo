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
