import { Todo } from '../types/Todo'
import { ListItem, ListItemText, Checkbox, IconButton } from '@mui/material'
import { Delete as DeleteIcon } from '@mui/icons-material'

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" aria-label="delete" onClick={() => onDelete(todo.id)}>
          <DeleteIcon />
        </IconButton>
      }
      disablePadding
      sx={{ py: 0.5 }}
    >
      <Checkbox
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        edge="start"
      />
      <ListItemText
        primary={todo.text}
        sx={{
          textDecoration: todo.completed ? 'line-through' : 'none',
          color: todo.completed ? 'text.secondary' : 'text.primary',
        }}
      />
    </ListItem>
  )
}
