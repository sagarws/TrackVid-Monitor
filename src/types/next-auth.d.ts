import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    user: {
      id?: string
      firstName?: string
      lastName?: string
      phone?: string
      companyId?: string
    } & DefaultSession['user']
  }

  interface User {
    firstName?: string
    lastName?: string
    phone?: string
    companyId?: string
    accessToken?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    firstName?: string
    lastName?: string
    phone?: string
    companyId?: string
    accessToken?: string
  }
}
