import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'

// Mock Clerk to simulate signed-in state for tests
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  SignInButton: () => null,
  UserButton: () => null,
}))

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows empty message when no todos', () => {
    render(<App />)
    expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
  })

  it('adds a new todo', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByPlaceholderText('Add a new todo...')
    const addButton = screen.getByRole('button', { name: 'Add' })

    await user.type(input, 'Buy milk')
    await user.click(addButton)

    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    expect(screen.queryByText('No todos yet. Add one above!')).not.toBeInTheDocument()
  })

  it('clears input after adding todo', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(input).toHaveValue('')
  })

  it('toggles todo completion', async () => {
    const user = userEvent.setup()
    render(<App />)

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

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Buy milk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'delete' }))

    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
    expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
  })

  it('persists todos to localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    unmount()

    render(<App />)
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
  })

  it('does not add empty todos', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
  })

  it('does not add whitespace-only todos', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('No todos yet. Add one above!')).toBeInTheDocument()
  })

  it('moves a todo up in the list', async () => {
    const user = userEvent.setup()
    render(<App />)

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

    const reorderedItems = screen.getAllByRole('listitem')
    expect(reorderedItems[0]).toHaveTextContent('Second')
    expect(reorderedItems[1]).toHaveTextContent('First')
  })

  it('moves a todo down in the list', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const moveDownButtons = screen.getAllByRole('button', { name: 'move down' })
    await user.click(moveDownButtons[0])

    const reorderedItems = screen.getAllByRole('listitem')
    expect(reorderedItems[0]).toHaveTextContent('Second')
    expect(reorderedItems[1]).toHaveTextContent('First')
  })

  it('disables move up button for first item', async () => {
    const user = userEvent.setup()
    render(<App />)

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

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const moveDownButtons = screen.getAllByRole('button', { name: 'move down' })
    expect(moveDownButtons[0]).not.toBeDisabled()
    expect(moveDownButtons[1]).toBeDisabled()
  })

  it('persists reordered todos to localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    const input = screen.getByPlaceholderText('Add a new todo...')
    await user.type(input, 'First')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'Second')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const moveUpButtons = screen.getAllByRole('button', { name: 'move up' })
    await user.click(moveUpButtons[1])

    unmount()

    render(<App />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Second')
    expect(items[1]).toHaveTextContent('First')
  })

  it('renders drag handles for each todo item', async () => {
    const user = userEvent.setup()
    render(<App />)

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
