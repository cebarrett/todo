import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App'

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

    await user.click(screen.getByRole('button', { name: 'Delete' }))

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
})
