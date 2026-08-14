// Third-party Imports
import CredentialProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { PrismaClient } from '@prisma/client'
import type { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'

const prisma = new PrismaClient()

type TrackVidPhone = {
  code?: string
  number?: string
  countryCode?: string
}

type TrackVidLoginUser = {
  id: string
  email: string
  name?: {
    firstName?: string
    lastName?: string
    fullName?: string
  }
  phone?: TrackVidPhone
  companyId?: string
}

type TrackVidLoginResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    accessToken: string
    user: TrackVidLoginUser
  }
}

const formatPhone = (phone?: TrackVidPhone) => {
  if (!phone?.number) return ''
  const code = phone.code ? `+${phone.code.replace(/^\+/, '')} ` : ''

  return `${code}${phone.number}`.trim()
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  providers: [
    CredentialProvider({
      name: 'Credentials',
      type: 'credentials',
      credentials: {},
      async authorize(credentials) {
        const { email, password } = credentials as { email: string; password: string }

        const apiBase = process.env.TRACKVID_API_URL

        if (!apiBase) {
          throw new Error(JSON.stringify({ message: ['TRACKVID_API_URL is not configured'] }))
        }

        let res: Response

        try {
          res = await fetch(`${apiBase}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({ email, password })
          })
        } catch (err: any) {
          throw new Error(JSON.stringify({ message: [err?.message || 'Unable to reach TrackVid API'] }))
        }

        const data = (await res.json().catch(() => null)) as TrackVidLoginResponse | null

        if (!res.ok || !data?.isSuccess || !data.data) {
          const displayMessage = data?.displayMessage || data?.message || 'Invalid email or password'

          throw new Error(JSON.stringify({ message: [displayMessage] }))
        }

        const { accessToken, user } = data.data

        return {
          id: user.id,
          email: user.email,
          name: user.name?.fullName || `${user.name?.firstName ?? ''} ${user.name?.lastName ?? ''}`.trim() || user.email,
          firstName: user.name?.firstName ?? '',
          lastName: user.name?.lastName ?? '',
          phone: formatPhone(user.phone),
          companyId: user.companyId ?? '',
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
        token.firstName = u.firstName
        token.lastName = u.lastName
        token.phone = u.phone
        token.companyId = u.companyId
        token.accessToken = u.accessToken
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as any

        su.name = token.name
        su.email = token.email
        su.firstName = (token as any).firstName
        su.lastName = (token as any).lastName
        su.phone = (token as any).phone
        su.companyId = (token as any).companyId
      }

      ;(session as any).accessToken = (token as any).accessToken

      return session
    }
  }
}
