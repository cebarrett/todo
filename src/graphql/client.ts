import { useAuth } from '@clerk/clerk-react'
import { useCallback, useMemo } from 'react'

const APPSYNC_URL = import.meta.env.VITE_APPSYNC_URL

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export function useGraphQLClient() {
  const { getToken } = useAuth()

  const executeQuery = useCallback(async <T>(
    document: string,
    variables?: Record<string, unknown>
  ): Promise<T> => {
    const token = await getToken()

    const response = await fetch(APPSYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: document,
        variables,
      }),
    })

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`)
    }

    const result: GraphQLResponse<T> = await response.json()

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message)
    }

    return result.data as T
  }, [getToken])

  const query = useCallback(async <T>(
    document: string,
    variables?: Record<string, unknown>
  ): Promise<T> => {
    return executeQuery<T>(document, variables)
  }, [executeQuery])

  const mutate = useCallback(async <T>(
    document: string,
    variables?: Record<string, unknown>
  ): Promise<T> => {
    return executeQuery<T>(document, variables)
  }, [executeQuery])

  return useMemo(() => ({ query, mutate }), [query, mutate])
}
