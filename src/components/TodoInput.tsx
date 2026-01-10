import { useState } from 'react'
import { TextField, Button, Box } from '@mui/material'
import { Add as AddIcon } from '@mui/icons-material'

interface TodoInputProps {
  onAdd: (text: string) => void
}

export function TodoInput({ onAdd }: TodoInputProps) {
  const [text, setText] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) {
      onAdd(text)
      setText('')
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1, mb: 3 }}>
      <TextField
        fullWidth
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a new todo..."
        variant="outlined"
        size="medium"
        inputProps={{ maxLength: 250 }}
      />
      <Button
        type="submit"
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        sx={{ minWidth: '100px' }}
      >
        Add
      </Button>
    </Box>
  )
}
