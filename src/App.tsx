import './App.css'
import { TodoInput } from './components/TodoInput'
import { TodoList } from './components/TodoList'
import { useTodos } from './hooks/useTodos'

function App() {
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodos()

  return (
    <div className="app">
      <h1>Todo List</h1>
      <TodoInput onAdd={addTodo} />
      <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
    </div>
  )
}

export default App
