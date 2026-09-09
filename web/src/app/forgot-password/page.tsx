'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    setSuccess(false)
    
    const email = formData.get('email') as string
    
    if (!email || email.trim() === '') {
      setError('Please enter a valid email address.')
      setLoading(false)
      return
    }

    // Prefer explicitly configured APP_URL.
    // If not set, safely fallback to the branch URL or the window origin.
    const baseUrl = 
      process.env.NEXT_PUBLIC_APP_URL || 
      process.env.NEXT_PUBLIC_SITE_URL || 
      (process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL}` : window.location.origin)
    
    const resetUrl = `${baseUrl}/auth/reset-callback`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resetUrl,
    })
    
    if (resetError) {
      console.error("Password reset error details:", resetError);
      
      // Determine if we are in development/staging to show detailed errors
      const isDevOrStaging = window.location.hostname === 'localhost' || window.location.hostname.includes('vercel.app');
      
      if (isDevOrStaging) {
        setError(`Diagnostic Error: ${resetError.message} | Redirect URL used: ${resetUrl}`);
      } else {
        setError('Failed to send recovery email. Please try again later.');
      }
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email to receive a password reset link
          </p>
        </div>
        
        <form className="mt-8 space-y-6" action={handleSubmit}>
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 text-green-700 p-4 rounded-md text-sm border border-green-200">
              <h3 className="font-semibold text-green-800 text-base mb-1">Check your email</h3>
              <p>We've sent you a password reset link. Please check your inbox and click the link to continue.</p>
            </div>
          )}
          
          <div className="rounded-md shadow-sm space-y-4" style={{ display: success ? 'none' : 'block' }}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm mt-1"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {!success && (
            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </span>
                ) : (
                  'Send reset link'
                )}
              </button>
            </div>
          )}

          <div className="text-center text-sm mt-4">
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Return to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
