import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    user: {
      id?: string
      role?: string
    } & DefaultSession['user']
  }

  interface User {
    role?: string
    accessToken?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string
    accessToken?: string
  }
}
