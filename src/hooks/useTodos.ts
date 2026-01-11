import { useState, useEffect } from 'react'
import { Todo } from '../types/Todo'

const STORAGE_KEY = 'todos'

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  const addTodo = (text: string) => {
    if (!text.trim()) return
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: text.trim(),
      completed: false,
    }
    setTodos((prev) => [...prev, newTodo])
  }

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    )
  }

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
  }

  const moveTodoUp = (id: string) => {
    setTodos((prev) => {
      const index = prev.findIndex((todo) => todo.id === id)
      if (index <= 0) return prev
      const newTodos = [...prev]
      ;[newTodos[index - 1], newTodos[index]] = [newTodos[index], newTodos[index - 1]]
      return newTodos
    })
  }

  const moveTodoDown = (id: string) => {
    setTodos((prev) => {
      const index = prev.findIndex((todo) => todo.id === id)
      if (index < 0 || index >= prev.length - 1) return prev
      const newTodos = [...prev]
      ;[newTodos[index], newTodos[index + 1]] = [newTodos[index + 1], newTodos[index]]
      return newTodos
    })
  }

  const reorderTodos = (oldIndex: number, newIndex: number) => {
    setTodos((prev) => {
      const newTodos = [...prev]
      const [removed] = newTodos.splice(oldIndex, 1)
      newTodos.splice(newIndex, 0, removed)
      return newTodos
    })
  }

  return { todos, addTodo, toggleTodo, deleteTodo, moveTodoUp, moveTodoDown, reorderTodos }
}
