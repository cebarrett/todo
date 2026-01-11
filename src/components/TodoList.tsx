import { Todo } from '../types/Todo'
import { TodoItem } from './TodoItem'
import { List, Typography, Paper } from '@mui/material'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onReorder: (oldIndex: number, newIndex: number) => void
}

export function TodoList({ todos, onToggle, onDelete, onMoveUp, onMoveDown, onReorder }: TodoListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = todos.findIndex((todo) => todo.id === active.id)
      const newIndex = todos.findIndex((todo) => todo.id === over.id)
      onReorder(oldIndex, newIndex)
    }
  }

  if (todos.length === 0) {
    return (
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 4 }}>
        No todos yet. Add one above!
      </Typography>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={todos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}>
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
      </SortableContext>
    </DndContext>
  )
}
