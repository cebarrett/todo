import { Container, Typography, Box, Button, CircularProgress, IconButton } from '@mui/material'
import { DarkMode, LightMode } from '@mui/icons-material'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { TodoInput } from './components/TodoInput'
import { TodoList } from './components/TodoList'
import { useTodos } from './hooks/useTodos'
import { useTheme } from './theme/ThemeContext'

function App() {
  const { todos, isLoading, addTodo, toggleTodo, editTodo, deleteTodo, moveTodoUp, moveTodoDown, reorderTodos } = useTodos()
  const { resolvedMode, setMode } = useTheme()

  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h3" component="h1">
            Todo List
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={() => setMode(resolvedMode === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${resolvedMode === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedMode === 'dark' ? <LightMode /> : <DarkMode />}
            </IconButton>
            <SignedIn>
              <UserButton />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="contained">Sign In</Button>
              </SignInButton>
            </SignedOut>
          </Box>
        </Box>

        <SignedIn>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TodoInput onAdd={addTodo} />
              <TodoList todos={todos} onToggle={toggleTodo} onEdit={editTodo} onDelete={deleteTodo} onMoveUp={moveTodoUp} onMoveDown={moveTodoDown} onReorder={reorderTodos} />
            </>
          )}
        </SignedIn>

        <SignedOut>
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 4 }}>
            Sign in to manage your todos
          </Typography>
        </SignedOut>
      </Box>
    </Container>
  )
}

export default App
