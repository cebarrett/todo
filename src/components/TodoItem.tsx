import { Todo } from '../types/Todo'
import { ListItem, ListItemText, Checkbox, IconButton, Box } from '@mui/material'
import { Delete as DeleteIcon, KeyboardArrowUp, KeyboardArrowDown, DragIndicator } from '@mui/icons-material'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  isFirst: boolean
  isLast: boolean
}

export function TodoItem({ todo, onToggle, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: TodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      secondaryAction={
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            aria-label="move up"
            onClick={() => onMoveUp(todo.id)}
            disabled={isFirst}
            size="small"
          >
            <KeyboardArrowUp />
          </IconButton>
          <IconButton
            aria-label="move down"
            onClick={() => onMoveDown(todo.id)}
            disabled={isLast}
            size="small"
          >
            <KeyboardArrowDown />
          </IconButton>
          <IconButton edge="end" aria-label="delete" onClick={() => onDelete(todo.id)}>
            <DeleteIcon />
          </IconButton>
        </Box>
      }
      sx={{ pl: 1, pr: 1, py: 1 }}
    >
      <IconButton
        {...attributes}
        {...listeners}
        size="small"
        sx={{ cursor: 'grab', mr: 1, '&:active': { cursor: 'grabbing' } }}
        aria-label="drag to reorder"
      >
        <DragIndicator />
      </IconButton>
      <Checkbox
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        sx={{ mr: 1 }}
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
