import { Todo } from '../types/Todo'
import { TodoItem } from './TodoItem'
import { List, Typography, Paper } from '@mui/material'

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 4 }}>
        No todos yet. Add one above!
      </Typography>
    )
  }

  return (
    <Paper elevation={2}>
      <List>
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </List>
    </Paper>
  )
}
