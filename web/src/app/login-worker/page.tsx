'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function WorkerLoginPage() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Attempt to send OTP via Supabase
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: phone
    })

    if (otpError) {
      setError(otpError.message)
      setLoading(false)
      return
    }

    setStep('OTP')
    setLoading(false)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Verify OTP with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms'
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Authentication failed.')
      setLoading(false)
      return
    }

    // 2. Call the secure claim RPC (No parameters!)
    const { data: claimsProcessed, error: claimError } = await supabase.rpc('claim_worker_invitations')

    if (claimError) {
      console.error('Claim error:', claimError)
      // They are authenticated, but claiming failed. This shouldn't prevent them from proceeding
      // if they already had access, but it's good to note.
    }

    // 3. Resolve where they should go. Find their active org and role.
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('role, is_active')
      .eq('profile_id', authData.user.id)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!orgMember) {
      // They have no active membership. They shouldn't be here.
      // But they are authenticated now. We should log them out or show an error.
      // Requirements: "If the authenticated phone has no invitation/membership: show a safe message... Do not expose organization details."
      setError('No VyaparOS shop access is assigned to this mobile number.')
      await supabase.auth.signOut()
      setLoading(false)
      setStep('PHONE')
      return
    }

    // Route based on role
    if (orgMember.role === 'CASHIER') {
      window.location.href = '/dashboard/pos'
    } else if (orgMember.role === 'MANAGER') {
      window.location.href = '/dashboard'
    } else {
      window.location.href = '/dashboard' // Owner fallback
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
            Staff Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === 'PHONE' ? 'Sign in with your registered mobile number' : 'Enter the verification code'}
          </p>
        </div>

        {step === 'PHONE' ? (
          <form className="mt-8 space-y-6" onSubmit={handleSendOtp}>
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Mobile Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm mt-1"
                placeholder="+91 99999 99999"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !phone}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={() => window.location.href = '/login'}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Back to main login
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOtp}>
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm mt-1 text-center tracking-widest text-lg"
                placeholder="000000"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !otp}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('PHONE')
                  setError(null)
                  setOtp('')
                }}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Change mobile number
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
