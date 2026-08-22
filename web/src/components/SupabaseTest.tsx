'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function SupabaseTest() {
  const [status, setStatus] = useState<'testing' | 'success' | 'error'>('testing')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    async function testConnection() {
      try {
        const supabase = createClient()
        // Use auth.getSession() to verify the connection since the anon key 
        // does not have execute permissions for RLS functions like is_org_member.
        const { error } = await supabase.auth.getSession()
        
        if (error) {
          throw error
        }
        
        setStatus('success')
      } catch (err: unknown) {
        setStatus('error')
        const message = err instanceof Error ? err.message : 'Failed to connect to Supabase'
        setErrorMessage(message)
      }
    }

    testConnection()
  }, [])

  return (
    <div className="p-4 rounded-lg border mt-8">
      <h2 className="text-xl font-semibold mb-2">Supabase Connection Test</h2>
      {status === 'testing' && <p className="text-gray-500">Testing connection...</p>}
      {status === 'success' && (
        <div className="text-green-600 font-medium flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          Successfully connected to Supabase!
        </div>
      )}
      {status === 'error' && (
        <div className="text-red-600">
          <div className="font-medium flex items-center gap-2 mb-1">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            Connection Failed
          </div>
          <p className="text-sm font-mono bg-red-50 p-2 rounded">{errorMessage}</p>
          <p className="text-sm mt-2 text-gray-600">
            Make sure you have added NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to web/.env.local
          </p>
        </div>
      )}
    </div>
  )
}
