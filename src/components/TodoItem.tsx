import { useState } from 'react'
import { Todo } from '../types/Todo'
import { ListItem, ListItemText, Checkbox, IconButton, Box, TextField } from '@mui/material'
import { Delete as DeleteIcon, Edit as EditIcon, KeyboardArrowUp, KeyboardArrowDown, DragIndicator } from '@mui/icons-material'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  isFirst: boolean
  isLast: boolean
}

export function TodoItem({ todo, onToggle, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)

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

  const handleStartEdit = () => {
    setEditText(todo.text)
    setIsEditing(true)
  }

  const handleSave = () => {
    if (editText.trim() && editText.trim() !== todo.text) {
      onEdit(todo.id, editText)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditText(todo.text)
      setIsEditing(false)
    }
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
            disabled={isFirst || isEditing}
            size="small"
          >
            <KeyboardArrowUp />
          </IconButton>
          <IconButton
            aria-label="move down"
            onClick={() => onMoveDown(todo.id)}
            disabled={isLast || isEditing}
            size="small"
          >
            <KeyboardArrowDown />
          </IconButton>
          <IconButton
            aria-label="edit"
            onClick={handleStartEdit}
            disabled={isEditing}
            size="small"
          >
            <EditIcon />
          </IconButton>
          <IconButton edge="end" aria-label="delete" onClick={() => onDelete(todo.id)} disabled={isEditing}>
            <DeleteIcon />
          </IconButton>
        </Box>
      }
      sx={{ pl: 1, pr: '160px', py: 1 }}
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
      {isEditing ? (
        <TextField
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          size="small"
          fullWidth
          inputProps={{ 'aria-label': 'edit todo text' }}
          sx={{ minWidth: 0 }}
        />
      ) : (
        <ListItemText
          primary={todo.text}
          sx={{
            textDecoration: todo.completed ? 'line-through' : 'none',
            color: todo.completed ? 'text.secondary' : 'text.primary',
            minWidth: 0,
            wordBreak: 'break-word',
          }}
        />
      )}
    </ListItem>
  )
}
