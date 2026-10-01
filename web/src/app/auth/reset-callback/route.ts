import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Successfully consumed the PKCE recovery code and established a session
      return NextResponse.redirect(new URL('/reset-password', request.url))
    } else {
      // Exchange failed (e.g. expired or already used code)
      return NextResponse.redirect(new URL('/forgot-password?error=Invalid_or_expired_link', request.url))
    }
  }

  // If there's no code provided, redirect to forgot-password
  return NextResponse.redirect(new URL('/forgot-password', request.url))
}
