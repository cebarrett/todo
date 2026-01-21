import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useGraphQLClient } from '../graphql/client'
import { LIST_TODOS, CREATE_TODO, UPDATE_TODO, DELETE_TODO, REORDER_TODOS } from '../graphql/operations'
import type { Todo } from '../types/Todo'

const MAX_TODO_LENGTH = 500

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isSignedIn } = useAuth()
  const client = useGraphQLClient()
  const clientRef = useRef(client)
  clientRef.current = client

  // Fetch todos
  useEffect(() => {
    if (!isSignedIn) {
      setTodos([])
      setIsLoading(false)
      return
    }

    const fetchTodos = async () => {
      try {
        const data = await clientRef.current.query<{ listTodos: Todo[] }>(LIST_TODOS)
        setTodos(data.listTodos)
      } catch (error) {
        console.error('Failed to fetch todos:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTodos()
  }, [isSignedIn])

  // Add todo (with optimistic update)
  const addTodo = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_TODO_LENGTH) {
      throw new Error(`Todo text cannot exceed ${MAX_TODO_LENGTH} characters`)
    }

    const tempId = crypto.randomUUID()
    const tempTodo: Todo = {
      id: tempId,
      text: trimmed,
      completed: false,
      order: Date.now(),
      createdAt: new Date().toISOString()
    }

    const previousTodos = [...todos]
    setTodos(prev => [...prev, tempTodo])

    try {
      const data = await clientRef.current.mutate<{ createTodo: Todo }>(CREATE_TODO, {
        input: { text: trimmed }
      })
      setTodos(prev => prev.map(t => t.id === tempId ? data.createTodo : t))
    } catch (error) {
      console.error('Failed to create todo:', error)
      setTodos(previousTodos)
    }
  }, [todos])

  // Toggle todo
  const toggleTodo = useCallback(async (id: string) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return

    const previousTodos = [...todos]
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ))

    try {
      await clientRef.current.mutate(UPDATE_TODO, {
        input: { id, completed: !todo.completed }
      })
    } catch (error) {
      console.error('Failed to toggle todo:', error)
      setTodos(previousTodos)
    }
  }, [todos])

  // Edit todo
  const editTodo = useCallback(async (id: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_TODO_LENGTH) {
      throw new Error(`Todo text cannot exceed ${MAX_TODO_LENGTH} characters`)
    }

    const previousTodos = [...todos]
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, text: trimmed } : t
    ))

    try {
      await clientRef.current.mutate(UPDATE_TODO, {
        input: { id, text: trimmed }
      })
    } catch (error) {
      console.error('Failed to edit todo:', error)
      setTodos(previousTodos)
    }
  }, [todos])

  // Delete todo
  const deleteTodo = useCallback(async (id: string) => {
    const previousTodos = [...todos]
    setTodos(prev => prev.filter(t => t.id !== id))

    try {
      await clientRef.current.mutate(DELETE_TODO, { id })
    } catch (error) {
      console.error('Failed to delete todo:', error)
      setTodos(previousTodos)
    }
  }, [todos])

  // Reorder todos
  const reorderTodos = useCallback(async (oldIndex: number, newIndex: number) => {
    const previousTodos = [...todos]
    const newTodos = [...todos]
    const [removed] = newTodos.splice(oldIndex, 1)
    newTodos.splice(newIndex, 0, removed)

    const reorderedWithNewOrder = newTodos.map((todo, index) => ({
      ...todo,
      order: index
    }))
    setTodos(reorderedWithNewOrder)

    try {
      await clientRef.current.mutate(REORDER_TODOS, {
        input: { todoIds: newTodos.map(t => t.id) }
      })
    } catch (error) {
      console.error('Failed to reorder todos:', error)
      setTodos(previousTodos)
    }
  }, [todos])

  // Move todo up
  const moveTodoUp = useCallback((id: string) => {
    const index = todos.findIndex(t => t.id === id)
    if (index <= 0) return
    reorderTodos(index, index - 1)
  }, [todos, reorderTodos])

  // Move todo down
  const moveTodoDown = useCallback((id: string) => {
    const index = todos.findIndex(t => t.id === id)
    if (index < 0 || index >= todos.length - 1) return
    reorderTodos(index, index + 1)
  }, [todos, reorderTodos])

  return {
    todos,
    isLoading,
    addTodo,
    toggleTodo,
    editTodo,
    deleteTodo,
    moveTodoUp,
    moveTodoDown,
    reorderTodos
  }
}
