import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect root to dashboard by default.
  // Middleware will catch it and bounce to /login if unauthenticated.
  redirect('/dashboard')
}
