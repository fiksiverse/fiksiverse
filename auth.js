import { supabase } from './supabase.js'

// Register User Baru
export async function signUpWithEmail(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  })
  if (error) throw error
  return data
}

// Login User
export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  if (error) throw error
  return data
}

// Logout
export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) alert('Gagal Logout: ' + error.message)
  else window.location.reload()
}

// Mengambil Data User Aktif
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { ...user, profile }
}
