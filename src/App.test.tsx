import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Variable to control mock auth state
let mockSignedIn = true

// Variable to control mock theme state
let mockResolvedMode: 'light' | 'dark' = 'light'
const mockSetMode = vi.fn()

// In-memory store for mock GraphQL API
let mockTodos: { id: string; text: string; completed: boolean; order: number; createdAt: string }[] = []

// Mock GraphQL client methods
const mockQuery = vi.fn()
const mockMutate = vi.fn()

// Mock Clerk with configurable auth state
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => mockSignedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) => mockSignedIn ? null : <>{children}</>,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => null,
  useAuth: () => ({
    getToken: () => Promise.resolve('mock-token'),
    isSignedIn: mockSignedIn
  }),
}))

// Mock ThemeContext
vi.mock('./theme/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'system',
    setMode: mockSetMode,
    resolvedMode: mockResolvedMode,
  }),
}))

// Mock the GraphQL client
vi.mock('./graphql/client', () => ({
  useGraphQLClient: () => ({
    query: mockQuery,
    mutate: mockMutate
  })
}))

// Import App after mocks are defined
import App from './App'

// Setup GraphQL mock implementations
function setupGraphQLMocks() {
  mockQuery.mockImplementation(async (document: string) => {
    if (document.includes('listTodos')) {
      return { listTodos: mockTodos }
    }
    throw new Error('Unknown query')
  })

  mockMutate.mockImplementation(async (document: string, variables?: Record<string, unknown>) => {
    if (document.includes('createTodo')) {
      const input = variables?.input as { text: string }
      const newTodo = {
        id: crypto.randomUUID(),
        text: input.text,
        completed: false,
        order: Date.now(),
        createdAt: new Date().toISOString()
      }
      mockTodos.push(newTodo)
      return { createTodo: newTodo }
    }

    if (document.includes('updateTodo')) {
      const input = variables?.input as { id: string; text?: string; completed?: boolean }
      mockTodos = mockTodos.map(t =>
        t.id === input.id
          ? {
              ...t,
              ...(input.text !== undefined && { text: input.text }),
              ...(input.completed !== undefined && { completed: input.completed })
            }
          : t
      )
      const updatedTodo = mockTodos.find(t => t.id === input.id)
      return { updateTodo: updatedTodo }
    }

    if (document.includes('deleteTodo')) {
      const id = variables?.id as string
      mockTodos = mockTodos.filter(t => t.id !== id)
      return { deleteTodo: id }
    }

    if (document.includes('reorderTodos')) {
      const input = variables?.input as { todoIds: string[] }
      const reorderedTodos: typeof mockTodos = []
      for (const todoId of input.todoIds) {
        const todo = mockTodos.find(t => t.id === todoId)
        if (todo) reorderedTodos.push({ ...todo, order: reorderedTodos.length })
      }
      mockTodos = reorderedTodos
      return { reorderTodos: reorderedTodos }
    }

    throw new Error('Unknown mutation')
  })
}

describe('App', () => {
  beforeEach(() => {
    mockTodos = []
    mockSignedIn = true
    mockResolvedMode = 'light'
    vi.clearAllMocks()
    setupGraphQLMocks()
  })

  it('shows sign-in prompt when signed out', () => {
    mockSignedIn = false
    render(<App />)
    expect(screen.getByText('Sign in to manage your todos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a new todo...')).not.toBeInTheDocument()
  })

  it('shows empty message when no todos', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
    })
  })

  it('adds a new todo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    const addButton = screen.getByRole('button', { name: 'Add' })

    await user.type(input, 'Buy milk')
    await user.click(addButton)

    expect(screen.getByText('Buy milk')).toBeInTheDocument()
  })

  it('clears input after adding todo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(input).toHaveValue('')
  })

  it('toggles todo completion', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('deletes a todo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Buy milk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'delete' }))

    await waitFor(() => {
      expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
    })
  })

  it('does not add empty todos', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
  })

  it('does not add whitespace-only todos', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
  })

  it('moves a todo up in the list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('First')
    expect(items[1]).toHaveTextContent('Second')

    const moveUpButtons = screen.getAllByRole('button', { name: 'move up' })
    await user.click(moveUpButtons[1])

    await waitFor(() => {
      const reorderedItems = screen.getAllByRole('listitem')
      expect(reorderedItems[0]).toHaveTextContent('Second')
      expect(reorderedItems[1]).toHaveTextContent('First')
    })
  })

  it('moves a todo down in the list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const moveDownButtons = screen.getAllByRole('button', { name: 'move down' })
    await user.click(moveDownButtons[0])

    await waitFor(() => {
      const reorderedItems = screen.getAllByRole('listitem')
      expect(reorderedItems[0]).toHaveTextContent('Second')
      expect(reorderedItems[1]).toHaveTextContent('First')
    })
  })

  it('disables move up button for first item', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const moveUpButtons = screen.getAllByRole('button', { name: 'move up' })
    expect(moveUpButtons[0]).toBeDisabled()
    expect(moveUpButtons[1]).not.toBeDisabled()
  })

  it('disables move down button for last item', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const moveDownButtons = screen.getAllByRole('button', { name: 'move down' })
    expect(moveDownButtons[0]).not.toBeDisabled()
    expect(moveDownButtons[1]).toBeDisabled()
  })

  it('renders drag handles for each todo item', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const dragHandles = screen.getAllByRole('button', { name: 'drag to reorder' })
    expect(dragHandles).toHaveLength(2)
  })

  it('drag handles have correct accessibility attributes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const dragHandle = screen.getByRole('button', { name: 'drag to reorder' })
    expect(dragHandle).toHaveAttribute('aria-label', 'drag to reorder')
    expect(dragHandle).toHaveAttribute('tabindex', '0')
  })

  it('drag handles are reachable via keyboard tab navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const dragHandle = screen.getByRole('button', { name: 'drag to reorder' })

    // Tab through focusable elements until we reach the drag handle
    let foundDragHandle = false
    for (let i = 0; i < 10; i++) {
      await user.tab()
      if (document.activeElement === dragHandle) {
        foundDragHandle = true
        break
      }
    }

    expect(foundDragHandle).toBe(true)
    expect(dragHandle).toHaveFocus()
  })

  it('clicking edit button shows input field', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Buy milk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'edit' }))

    const editInput = screen.getByRole('textbox', { name: 'edit todo text' })
    expect(editInput).toBeInTheDocument()
    expect(editInput).toHaveValue('Buy milk')
  })

  it('pressing Enter saves edit and exits edit mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await user.click(screen.getByRole('button', { name: 'edit' }))

    const editInput = screen.getByRole('textbox', { name: 'edit todo text' })
    await user.clear(editInput)
    await user.type(editInput, 'Buy eggs')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'edit todo text' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Buy eggs')).toBeInTheDocument()
  })

  it('pressing Escape cancels edit and reverts text', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await user.click(screen.getByRole('button', { name: 'edit' }))

    const editInput = screen.getByRole('textbox', { name: 'edit todo text' })
    await user.clear(editInput)
    await user.type(editInput, 'Buy eggs')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'edit todo text' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    expect(screen.queryByText('Buy eggs')).not.toBeInTheDocument()
  })

  it('blur saves edit', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await user.click(screen.getByRole('button', { name: 'edit' }))

    const editInput = screen.getByRole('textbox', { name: 'edit todo text' })
    await user.clear(editInput)
    await user.type(editInput, 'Buy eggs')
    // Click elsewhere to trigger blur
    await user.click(document.body)

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'edit todo text' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Buy eggs')).toBeInTheDocument()
  })

  it('does not save empty text when editing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await user.click(screen.getByRole('button', { name: 'edit' }))

    const editInput = screen.getByRole('textbox', { name: 'edit todo text' })
    await user.clear(editInput)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'edit todo text' })).not.toBeInTheDocument()
    })
    // Original text should remain since empty text is not saved
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
  })

  it('disables other buttons while editing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a new todo...')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const editButtons = screen.getAllByRole('button', { name: 'edit' })
    await user.click(editButtons[0])

    // While editing first item, these buttons should be disabled
    const moveUpButtons = screen.getAllByRole('button', { name: 'move up' })
    const moveDownButtons = screen.getAllByRole('button', { name: 'move down' })
    const deleteButtons = screen.getAllByRole('button', { name: 'delete' })

    expect(moveUpButtons[0]).toBeDisabled()
    expect(moveDownButtons[0]).toBeDisabled()
    expect(deleteButtons[0]).toBeDisabled()
    expect(editButtons[0]).toBeDisabled()
  })

  it('renders theme toggle button', () => {
    render(<App />)
    const toggleButton = screen.getByRole('button', { name: 'Switch to dark mode' })
    expect(toggleButton).toBeInTheDocument()
  })

  it('clicking theme toggle calls setMode with opposite mode', async () => {
    const user = userEvent.setup()
    mockResolvedMode = 'light'
    render(<App />)

    const toggleButton = screen.getByRole('button', { name: 'Switch to dark mode' })
    await user.click(toggleButton)

    expect(mockSetMode).toHaveBeenCalledWith('dark')
  })

  it('theme toggle shows correct aria-label for dark mode', () => {
    mockResolvedMode = 'dark'
    render(<App />)
    const toggleButton = screen.getByRole('button', { name: 'Switch to light mode' })
    expect(toggleButton).toBeInTheDocument()
  })
})
