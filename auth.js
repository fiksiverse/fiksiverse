import { supabase } from './supabase.js[span_4](start_span)'[span_4](end_span)

// Register User Baru
export async function signUpWithEmail(email, password, fullName) {[span_5](start_span)[span_5](end_span)
  const { data, error } = await supabase.auth.signUp({[span_6](start_span)[span_6](end_span)
    email,[span_7](start_span)[span_7](end_span)
    password,[span_8](start_span)[span_8](end_span)
    options: {[span_9](start_span)[span_9](end_span)
      data: { full_name: fullName }[span_10](start_span)[span_10](end_span)
    }[span_11](start_span)[span_11](end_span)
  })[span_12](start_span)[span_12](end_span)
  if (error) throw error[span_13](start_span)[span_13](end_span)
  return data[span_14](start_span)[span_14](end_span)
}[span_15](start_span)[span_15](end_span)

// Login User
export async function loginWithEmail(email, password) {[span_16](start_span)[span_16](end_span)
  const { data, error } = await supabase.auth.signInWithPassword({[span_17](start_span)[span_17](end_span)
    email,[span_18](start_span)[span_18](end_span)
    password[span_19](start_span)[span_19](end_span)
  })[span_20](start_span)[span_20](end_span)
  if (error) throw error[span_21](start_span)[span_21](end_span)
  return data[span_22](start_span)[span_22](end_span)
}[span_23](start_span)[span_23](end_span)

// Logout
export async function logout() {[span_24](start_span)[span_24](end_span)
  const { error } = await supabase.auth.signOut()[span_25](start_span)[span_25](end_span)
  if (error) alert('Gagal Logout: ' + error.message)[span_26](start_span)[span_26](end_span)
  else window.location.reload()[span_27](start_span)[span_27](end_span)
}[span_28](start_span)[span_28](end_span)

// Mengambil Data User Aktif
export async function getCurrentUser() {[span_29](start_span)[span_29](end_span)
  const { data: { user } } = await supabase.auth.getUser()[span_30](start_span)[span_30](end_span)
  if (!user) return null[span_31](start_span)[span_31](end_span)

  const { data: profile } = await supabase[span_32](start_span)[span_32](end_span)
    .from('profiles')[span_33](start_span)[span_33](end_span)
    .select('*')[span_34](start_span)[span_34](end_span)
    .eq('id', user.id)[span_35](start_span)[span_35](end_span)
    .single()[span_36](start_span)[span_36](end_span)

  return { ...user, profile }[span_37](start_span)[span_37](end_span)
}[span_38](start_span)[span_38](end_span)
