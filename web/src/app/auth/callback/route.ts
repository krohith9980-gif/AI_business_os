import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && sessionData.user) {
      // Check for active organization membership
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('id')
        .eq('profile_id', sessionData.user.id)
        .eq('is_active', true)
        .limit(1)

      if (memberships && memberships.length > 0) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      } else {
        return NextResponse.redirect(new URL('/setup', request.url))
      }
    }
  }

  // If there's an error exchanging code or no code provided, redirect to login
  return NextResponse.redirect(new URL('/login', request.url))
}
