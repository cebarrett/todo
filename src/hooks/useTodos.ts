import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Todo } from '../types/Todo'

const API_URL = import.meta.env.VITE_API_URL

export function useTodos() {
  const { getToken } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchWithAuth = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken()
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })
    return response
  }, [getToken])

  // Fetch todos on mount
  useEffect(() => {
    const loadTodos = async () => {
      try {
        const response = await fetchWithAuth('/todos')
        if (response.ok) {
          const data = await response.json()
          // Map from API format to local format
          const mappedTodos = data.map((item: { todoId: string; text: string; completed: boolean }) => ({
            id: item.todoId,
            text: item.text,
            completed: item.completed,
          }))
          setTodos(mappedTodos)
        }
      } catch (error) {
        console.error('Failed to fetch todos:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadTodos()
  }, [fetchWithAuth])

  const addTodo = async (text: string) => {
    if (!text.trim()) return
    const tempId = crypto.randomUUID()
    const newTodo: Todo = {
      id: tempId,
      text: text.trim(),
      completed: false,
    }

    // Optimistic update with temporary ID
    setTodos((prev) => [...prev, newTodo])

    try {
      const response = await fetchWithAuth('/todos', {
        method: 'POST',
        body: JSON.stringify({ text: newTodo.text }),
      })
      if (response.ok) {
        const created = await response.json()
        // Replace temp ID with server-generated ID
        setTodos((prev) => prev.map((t) => t.id === tempId ? { ...t, id: created.todoId } : t))
      } else {
        throw new Error('Failed to create todo')
      }
    } catch (error) {
      // Rollback on error
      setTodos((prev) => prev.filter((t) => t.id !== tempId))
      console.error('Failed to add todo:', error)
    }
  }

  const toggleTodo = async (id: string) => {
    const todo = todos.find((t) => t.id === id)
    if (!todo) return

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )

    try {
      await fetchWithAuth(`/todos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ text: todo.text, completed: !todo.completed }),
      })
    } catch (error) {
      // Rollback on error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: todo.completed } : t))
      )
      console.error('Failed to toggle todo:', error)
    }
  }

  const editTodo = async (id: string, newText: string) => {
    const todo = todos.find((t) => t.id === id)
    if (!todo || !newText.trim()) return

    const trimmedText = newText.trim()

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text: trimmedText } : t))
    )

    try {
      await fetchWithAuth(`/todos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ text: trimmedText, completed: todo.completed }),
      })
    } catch (error) {
      // Rollback on error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, text: todo.text } : t))
      )
      console.error('Failed to edit todo:', error)
    }
  }

  const deleteTodo = async (id: string) => {
    const todo = todos.find((t) => t.id === id)

    // Optimistic update
    setTodos((prev) => prev.filter((t) => t.id !== id))

    try {
      await fetchWithAuth(`/todos/${id}`, { method: 'DELETE' })
    } catch (error) {
      // Rollback on error
      if (todo) {
        setTodos((prev) => [...prev, todo])
      }
      console.error('Failed to delete todo:', error)
    }
  }

  const persistOrder = async (newTodos: Todo[]) => {
    try {
      await fetchWithAuth('/todos/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ todoIds: newTodos.map((t) => t.id) }),
      })
    } catch (error) {
      console.error('Failed to persist order:', error)
    }
  }

  const moveTodoUp = (id: string) => {
    setTodos((prev) => {
      const index = prev.findIndex((todo) => todo.id === id)
      if (index <= 0) return prev
      const newTodos = [...prev]
      ;[newTodos[index - 1], newTodos[index]] = [newTodos[index], newTodos[index - 1]]
      persistOrder(newTodos)
      return newTodos
    })
  }

  const moveTodoDown = (id: string) => {
    setTodos((prev) => {
      const index = prev.findIndex((todo) => todo.id === id)
      if (index < 0 || index >= prev.length - 1) return prev
      const newTodos = [...prev]
      ;[newTodos[index], newTodos[index + 1]] = [newTodos[index + 1], newTodos[index]]
      persistOrder(newTodos)
      return newTodos
    })
  }

  const reorderTodos = (oldIndex: number, newIndex: number) => {
    setTodos((prev) => {
      const newTodos = [...prev]
      const [removed] = newTodos.splice(oldIndex, 1)
      newTodos.splice(newIndex, 0, removed)
      persistOrder(newTodos)
      return newTodos
    })
  }

  return { todos, isLoading, addTodo, toggleTodo, editTodo, deleteTodo, moveTodoUp, moveTodoDown, reorderTodos }
}
