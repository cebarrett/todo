import { Container, Typography, Box } from '@mui/material'
import { TodoInput } from './components/TodoInput'
import { TodoList } from './components/TodoList'
import { useTodos } from './hooks/useTodos'

function App() {
  const { todos, addTodo, toggleTodo, deleteTodo, moveTodoUp, moveTodoDown } = useTodos()

  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          Todo List
        </Typography>
        <TodoInput onAdd={addTodo} />
        <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} onMoveUp={moveTodoUp} onMoveDown={moveTodoDown} />
      </Box>
    </Container>
  )
}

export default App
