import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTodos } from './useTodos'

describe('useTodos', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('initializes with empty array when localStorage is empty', () => {
      const { result } = renderHook(() => useTodos())
      expect(result.current.todos).toEqual([])
    })

    it('loads todos from localStorage on mount', () => {
      const savedTodos = [
        { id: '1', text: 'Buy milk', completed: false },
        { id: '2', text: 'Walk dog', completed: true },
      ]
      localStorage.setItem('todos', JSON.stringify(savedTodos))

      const { result } = renderHook(() => useTodos())
      expect(result.current.todos).toEqual(savedTodos)
    })

    it('handles invalid JSON in localStorage gracefully', () => {
      localStorage.setItem('todos', 'invalid json')

      expect(() => {
        renderHook(() => useTodos())
      }).toThrow()
    })
  })

  describe('addTodo', () => {
    it('adds a new todo with correct properties', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      expect(result.current.todos).toHaveLength(1)
      expect(result.current.todos[0]).toMatchObject({
        text: 'Buy milk',
        completed: false,
      })
      expect(result.current.todos[0].id).toBeDefined()
      expect(typeof result.current.todos[0].id).toBe('string')
    })

    it('trims whitespace from todo text', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('  Buy milk  ')
      })

      expect(result.current.todos[0].text).toBe('Buy milk')
    })

    it('does not add empty todos', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('')
      })

      expect(result.current.todos).toHaveLength(0)
    })

    it('does not add whitespace-only todos', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('   ')
      })

      expect(result.current.todos).toHaveLength(0)
    })

    it('generates unique IDs for each todo', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('First todo')
        result.current.addTodo('Second todo')
        result.current.addTodo('Third todo')
      })

      const ids = result.current.todos.map((todo) => todo.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
    })

    it('adds multiple todos in correct order', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('First')
        result.current.addTodo('Second')
        result.current.addTodo('Third')
      })

      expect(result.current.todos.map((t) => t.text)).toEqual([
        'First',
        'Second',
        'Third',
      ])
    })
  })

  describe('toggleTodo', () => {
    it('toggles todo completion status', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      const todoId = result.current.todos[0].id
      expect(result.current.todos[0].completed).toBe(false)

      act(() => {
        result.current.toggleTodo(todoId)
      })

      expect(result.current.todos[0].completed).toBe(true)

      act(() => {
        result.current.toggleTodo(todoId)
      })

      expect(result.current.todos[0].completed).toBe(false)
    })

    it('only toggles the specified todo', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('First')
        result.current.addTodo('Second')
        result.current.addTodo('Third')
      })

      const secondTodoId = result.current.todos[1].id

      act(() => {
        result.current.toggleTodo(secondTodoId)
      })

      expect(result.current.todos[0].completed).toBe(false)
      expect(result.current.todos[1].completed).toBe(true)
      expect(result.current.todos[2].completed).toBe(false)
    })

    it('does nothing when toggling non-existent todo', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      const initialTodos = [...result.current.todos]

      act(() => {
        result.current.toggleTodo('non-existent-id')
      })

      expect(result.current.todos).toEqual(initialTodos)
    })
  })

  describe('deleteTodo', () => {
    it('removes a todo by id', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
        result.current.addTodo('Walk dog')
      })

      const firstTodoId = result.current.todos[0].id

      act(() => {
        result.current.deleteTodo(firstTodoId)
      })

      expect(result.current.todos).toHaveLength(1)
      expect(result.current.todos[0].text).toBe('Walk dog')
    })

    it('removes the correct todo from multiple todos', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('First')
        result.current.addTodo('Second')
        result.current.addTodo('Third')
      })

      const secondTodoId = result.current.todos[1].id

      act(() => {
        result.current.deleteTodo(secondTodoId)
      })

      expect(result.current.todos).toHaveLength(2)
      expect(result.current.todos.map((t) => t.text)).toEqual(['First', 'Third'])
    })

    it('does nothing when deleting non-existent todo', () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      const initialLength = result.current.todos.length

      act(() => {
        result.current.deleteTodo('non-existent-id')
      })

      expect(result.current.todos).toHaveLength(initialLength)
    })
  })

  describe('localStorage persistence', () => {
    it('persists todos to localStorage when adding', async () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      await waitFor(() => {
        const saved = localStorage.getItem('todos')
        expect(saved).toBeTruthy()
        const parsed = JSON.parse(saved!)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].text).toBe('Buy milk')
      })
    })

    it('persists todos to localStorage when toggling', async () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      const todoId = result.current.todos[0].id

      act(() => {
        result.current.toggleTodo(todoId)
      })

      await waitFor(() => {
        const saved = localStorage.getItem('todos')
        const parsed = JSON.parse(saved!)
        expect(parsed[0].completed).toBe(true)
      })
    })

    it('persists todos to localStorage when deleting', async () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
        result.current.addTodo('Walk dog')
      })

      const firstTodoId = result.current.todos[0].id

      act(() => {
        result.current.deleteTodo(firstTodoId)
      })

      await waitFor(() => {
        const saved = localStorage.getItem('todos')
        const parsed = JSON.parse(saved!)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].text).toBe('Walk dog')
      })
    })

    it('clears localStorage when all todos are deleted', async () => {
      const { result } = renderHook(() => useTodos())

      act(() => {
        result.current.addTodo('Buy milk')
      })

      const todoId = result.current.todos[0].id

      act(() => {
        result.current.deleteTodo(todoId)
      })

      await waitFor(() => {
        const saved = localStorage.getItem('todos')
        const parsed = JSON.parse(saved!)
        expect(parsed).toEqual([])
      })
    })
  })
})
