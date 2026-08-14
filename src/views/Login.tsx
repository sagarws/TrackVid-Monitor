'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import useMediaQuery from '@mui/material/useMediaQuery'
import { styled, useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

// Third-party Imports
import { signIn } from 'next-auth/react'
import { Controller, useForm } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { email, object, minLength, string, pipe, nonEmpty } from 'valibot'
import type { SubmitHandler } from 'react-hook-form'
import type { InferInput } from 'valibot'
import classnames from 'classnames'

// Type Imports
import type { SystemMode } from '@core/types'
import type { Locale } from '@/configs/i18n'

// Component Imports
import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Hook Imports
import { useImageVariant } from '@core/hooks/useImageVariant'
import { useSettings } from '@core/hooks/useSettings'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

// Styled Custom Components
const LoginIllustration = styled('img')(({ theme }) => ({
  zIndex: 2,
  blockSize: 'auto',
  maxBlockSize: 680,
  maxInlineSize: '100%',
  margin: theme.spacing(12),
  [theme.breakpoints.down(1536)]: { maxBlockSize: 550 },
  [theme.breakpoints.down('lg')]: { maxBlockSize: 450 }
}))

const MaskImg = styled('img')({
  blockSize: 'auto',
  maxBlockSize: 355,
  inlineSize: '100%',
  position: 'absolute',
  insetBlockEnd: 0,
  zIndex: -1
})

const schema = object({
  email: pipe(string(), minLength(1, 'This field is required'), email('Email is invalid')),
  password: pipe(string(), nonEmpty('This field is required'))
})

type FormData = InferInput<typeof schema>

type Step = 'credentials' | 'twoFactor' | 'twoFactorSetup'

const apiBase = process.env.NEXT_PUBLIC_TRACKVID_API_URL || 'http://localhost:8000/api'

const Login = ({ mode }: { mode: SystemMode }) => {
  // States
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('credentials')
  const [tempToken, setTempToken] = useState<string>('')
  const [qrCode, setQrCode] = useState<string>('')
  const [twoFaCode, setTwoFaCode] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  // Vars
  const darkImg = '/images/pages/auth-mask-dark.png'
  const lightImg = '/images/pages/auth-mask-light.png'
  const darkIllustration = '/images/illustrations/auth/v2-login-dark.png'
  const lightIllustration = '/images/illustrations/auth/v2-login-light.png'
  const borderedDarkIllustration = '/images/illustrations/auth/v2-login-dark-border.png'
  const borderedLightIllustration = '/images/illustrations/auth/v2-login-light-border.png'

  // Hooks
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang: locale } = useParams()
  const { settings } = useSettings()
  const theme = useTheme()
  const hidden = useMediaQuery(theme.breakpoints.down('md'))
  const authBackground = useImageVariant(mode, lightImg, darkImg)

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<FormData>({
    resolver: valibotResolver(schema),
    defaultValues: {
      email: 'sagar.vavadiya.ws@gmail.com',
      password: 'SagarT@123'
    }
  })

  const characterIllustration = useImageVariant(
    mode,
    lightIllustration,
    darkIllustration,
    borderedLightIllustration,
    borderedDarkIllustration
  )

  const handleClickShowPassword = () => setIsPasswordShown(show => !show)

  const fetchQrCode = async (token: string) => {
    try {
      const res = await fetch(`${apiBase}/auth/system-admin-2fa-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: token })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        throw new Error(json?.displayMessage || json?.message || 'Failed to start 2FA setup')
      }

      setQrCode(json?.data?.qrCode || '')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start 2FA setup')
    }
  }

  const onCredentialsSubmit: SubmitHandler<FormData> = async data => {
    setErrorMessage(null)
    setSubmitting(true)

    try {
      const res = await fetch(`${apiBase}/auth/system-admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setErrorMessage(json?.displayMessage || json?.message || 'Invalid email or password')

        return
      }

      const token = json?.data?.tempToken

      if (!token) {
        setErrorMessage('Login response missing tempToken')

        return
      }

      setTempToken(token)

      if (json?.data?.requiresTwoFASetup) {
        setStep('twoFactorSetup')
        await fetchQrCode(token)
      } else {
        setStep('twoFactor')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to reach TrackVid API')
    } finally {
      setSubmitting(false)
    }
  }

  const onCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!twoFaCode.trim()) {
      setErrorMessage('Enter the 6-digit code from your authenticator app')

      return
    }

    setSubmitting(true)

    try {
      const res = await signIn('credentials', {
        tempToken,
        code: twoFaCode.trim(),
        isSetup: step === 'twoFactorSetup' ? 'true' : 'false',
        redirect: false
      })

      if (res && res.ok && !res.error) {
        const redirectURL = searchParams.get('redirectTo') ?? '/'

        router.replace(getLocalizedUrl(redirectURL, locale as Locale))
      } else if (res?.error) {
        try {
          const parsed = JSON.parse(res.error)

          setErrorMessage(parsed?.message?.[0] || 'Verification failed')
        } catch {
          setErrorMessage(res.error)
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  const resetToCredentials = () => {
    setStep('credentials')
    setTempToken('')
    setQrCode('')
    setTwoFaCode('')
    setErrorMessage(null)
  }

  return (
    <div className='flex bs-full justify-center'>
      <div
        className={classnames(
          'flex bs-full items-center justify-center flex-1 min-bs-[100dvh] relative p-6 max-md:hidden',
          { 'border-ie': settings.skin === 'bordered' }
        )}
      >
        <LoginIllustration src={characterIllustration} alt='character-illustration' />
        {!hidden && <MaskImg alt='mask' src={authBackground} />}
      </div>
      <div className='flex justify-center items-center bs-full bg-backgroundPaper !min-is-full p-6 md:!min-is-[unset] md:p-12 md:is-[480px]'>
        <div className='absolute block-start-5 sm:block-start-[33px] inline-start-6 sm:inline-start-[38px]'>
          <Logo />
        </div>
        <div className='flex flex-col gap-6 is-full sm:is-auto md:is-full sm:max-is-[400px] md:max-is-[unset] mbs-8 sm:mbs-11 md:mbs-0'>
          <div className='flex flex-col gap-1'>
            <Typography variant='h4'>{`Welcome to ${themeConfig.templateName}! 👋🏻`}</Typography>
            <Typography>
              {step === 'credentials'
                ? 'Sign in with your TrackVid system-admin account.'
                : step === 'twoFactorSetup'
                  ? 'Set up two-factor authentication to continue.'
                  : 'Enter the 6-digit code from your authenticator app.'}
            </Typography>
          </div>

          {errorMessage && (
            <Alert severity='error' onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Alert>
          )}

          {step === 'credentials' && (
            <form
              noValidate
              autoComplete='off'
              onSubmit={handleSubmit(onCredentialsSubmit)}
              className='flex flex-col gap-6'
            >
              <Controller
                name='email'
                control={control}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    autoFocus
                    fullWidth
                    type='email'
                    label='Email'
                    placeholder='Enter your email'
                    {...(errors.email && { error: true, helperText: errors.email.message })}
                  />
                )}
              />
              <Controller
                name='password'
                control={control}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    fullWidth
                    label='Password'
                    placeholder='············'
                    id='login-password'
                    type={isPasswordShown ? 'text' : 'password'}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position='end'>
                            <IconButton
                              edge='end'
                              onClick={handleClickShowPassword}
                              onMouseDown={e => e.preventDefault()}
                            >
                              <i className={isPasswordShown ? 'tabler-eye' : 'tabler-eye-off'} />
                            </IconButton>
                          </InputAdornment>
                        )
                      }
                    }}
                    {...(errors.password && { error: true, helperText: errors.password.message })}
                  />
                )}
              />
              <div className='flex justify-between items-center gap-x-3 gap-y-1 flex-wrap'>
                <FormControlLabel control={<Checkbox defaultChecked />} label='Remember me' />
                <Typography
                  className='text-end'
                  color='primary.main'
                  component={Link}
                  href={getLocalizedUrl('/forgot-password', locale as Locale)}
                >
                  Forgot password?
                </Typography>
              </div>
              <Button fullWidth variant='contained' type='submit' disabled={submitting}>
                {submitting ? <CircularProgress size={22} color='inherit' /> : 'Login'}
              </Button>
            </form>
          )}

          {(step === 'twoFactor' || step === 'twoFactorSetup') && (
            <form onSubmit={onCodeSubmit} className='flex flex-col gap-6'>
              {step === 'twoFactorSetup' && qrCode && (
                <div className='flex flex-col items-center gap-2'>
                  <Typography variant='body2' color='text.secondary'>
                    Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.)
                  </Typography>
                  <img src={qrCode} alt='2FA QR Code' width={200} height={200} />
                </div>
              )}
              <CustomTextField
                autoFocus
                fullWidth
                label='Authenticator Code'
                placeholder='123456'
                value={twoFaCode}
                onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode='numeric'
              />
              <Button fullWidth variant='contained' type='submit' disabled={submitting}>
                {submitting ? <CircularProgress size={22} color='inherit' /> : 'Verify & Sign in'}
              </Button>
              <Button variant='text' onClick={resetToCredentials} disabled={submitting}>
                Back to login
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
