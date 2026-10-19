import 'server-only'

// Node Imports
import { createHmac } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const base32Decode = (input: string): Buffer => {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)

    if (idx === -1) throw new Error('Invalid base32 secret')

    value = (value << 5) | idx
    bits += 5

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

// RFC 6238 TOTP (SHA-1, 30s step, 6 digits) — what Google Authenticator / Authy generate
export const generateTotp = (secret: string, timestamp = Date.now(), step = 30, digits = 6) => {
  const counter = Math.floor(timestamp / 1000 / step)
  const counterBuf = Buffer.alloc(8)

  counterBuf.writeBigUInt64BE(BigInt(counter))

  const hmac = createHmac('sha1', base32Decode(secret)).update(counterBuf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits

  return {
    code: binary.toString().padStart(digits, '0'),
    expiresIn: step - (Math.floor(timestamp / 1000) % step)
  }
}
