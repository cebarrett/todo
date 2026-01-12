import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'

// Variable to control mock auth state
let mockSignedIn = true

// In-memory store for mock API
let mockTodos: { todoId: string; text: string; completed: boolean }[] = []

// Mock Clerk with configurable auth state
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => mockSignedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) => mockSignedIn ? null : <>{children}</>,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => null,
  useAuth: () => ({ getToken: () => Promise.resolve('mock-token') }),
}))

// Mock fetch for API calls
global.fetch = vi.fn((url: string, options?: RequestInit) => {
  const path = new URL(url).pathname
  const method = options?.method || 'GET'

  if (method === 'GET' && path === '/todos') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockTodos),
    } as Response)
  }

  if (method === 'POST' && path === '/todos') {
    const body = JSON.parse(options?.body as string)
    const newTodo = { todoId: body.id, text: body.text, completed: body.completed }
    mockTodos.push(newTodo)
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(newTodo),
    } as Response)
  }

  if (method === 'PUT' && path.startsWith('/todos/')) {
    const todoId = path.split('/todos/')[1]
    const body = JSON.parse(options?.body as string)
    mockTodos = mockTodos.map((t) =>
      t.todoId === todoId ? { ...t, text: body.text, completed: body.completed } : t
    )
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ todoId, ...body }),
    } as Response)
  }

  if (method === 'DELETE' && path.startsWith('/todos/')) {
    const todoId = path.split('/todos/')[1]
    mockTodos = mockTodos.filter((t) => t.todoId !== todoId)
    return Promise.resolve({ ok: true } as Response)
  }

  return Promise.resolve({ ok: false } as Response)
})

describe('App', () => {
  beforeEach(() => {
    mockTodos = []
    mockSignedIn = true
    vi.clearAllMocks()
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
})
