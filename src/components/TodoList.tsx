import { Todo } from '../types/Todo'
import { TodoItem } from './TodoItem'
import { List, Typography, Paper } from '@mui/material'

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

export function TodoList({ todos, onToggle, onDelete, onMoveUp, onMoveDown }: TodoListProps) {
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
        {todos.map((todo, index) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            isFirst={index === 0}
            isLast={index === todos.length - 1}
          />
        ))}
      </List>
    </Paper>
  )
}
