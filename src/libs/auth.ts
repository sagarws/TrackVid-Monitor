// Third-party Imports
import CredentialProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { PrismaClient } from '@prisma/client'
import type { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'

const prisma = new PrismaClient()

type SystemAdminVerifyResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    accessToken: string
    user: {
      id: string
      email: string
      name: string
      role: string
    }
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  providers: [
    CredentialProvider({
      name: 'Credentials',
      type: 'credentials',
      credentials: {},
      async authorize(credentials) {
        const { tempToken, code, isSetup } = (credentials || {}) as {
          tempToken?: string
          code?: string
          isSetup?: string
        }

        if (!tempToken || !code) {
          throw new Error(JSON.stringify({ message: ['Missing 2FA credentials'] }))
        }

        const apiBase = process.env.TRACKVID_API_URL

        if (!apiBase) {
          throw new Error(JSON.stringify({ message: ['TRACKVID_API_URL is not configured'] }))
        }

        const endpoint = isSetup === 'true' ? '/auth/system-admin-2fa-verify-setup' : '/auth/system-admin-2fa-verify'

        let res: Response

        try {
          res = await fetch(`${apiBase}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({ tempToken, code })
          })
        } catch (err: any) {
          throw new Error(JSON.stringify({ message: [err?.message || 'Unable to reach TrackVid API'] }))
        }

        const data = (await res.json().catch(() => null)) as SystemAdminVerifyResponse | null

        if (!res.ok || !data?.isSuccess || !data.data) {
          const displayMessage = data?.displayMessage || data?.message || 'Two-factor verification failed'

          throw new Error(JSON.stringify({ message: [displayMessage] }))
        }

        const { accessToken, user } = data.data

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          accessToken
        } as any
      }
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string
    })
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60
  },

  pages: {
    signIn: '/login'
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any

        token.name = u.name
        token.email = u.email
        token.role = u.role
        token.accessToken = u.accessToken
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as any

        su.name = token.name
        su.email = token.email
        su.role = (token as any).role
      }

      ;(session as any).accessToken = (token as any).accessToken

      return session
    }
  }
}
