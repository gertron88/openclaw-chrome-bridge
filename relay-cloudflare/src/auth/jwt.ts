import { CONFIG } from '@/config';

/**
 * JWT payload interface
 */
export interface JWTPayload {
  sub: string; // subject (device_id)
  agent_id: string;
  tenant_id?: string;
  iat: number; // issued at
  exp: number; // expiration
  iss: string; // issuer
}

/**
 * Base64URL encode without padding
 */
function base64urlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64urlDecode(str: string): ArrayBuffer {
  // Add padding if needed
  const paddedStr = str + '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = paddedStr.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Create JWT header
 */
function createJWTHeader(): string {
  const header = {
    alg: CONFIG.JWT.ALGORITHM,
    typ: 'JWT'
  };
  
  return base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
}

/**
 * Sign JWT using Web Crypto API
 */
export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + CONFIG.JWT.ACCESS_TOKEN_TTL,
    iss: CONFIG.JWT.ISSUER,
  };
  
  const header = createJWTHeader();
  const payloadEncoded = base64urlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const message = `${header}.${payloadEncoded}`;
  
  // Import the secret key
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const signatureEncoded = base64urlEncode(signature);
  
  return `${message}.${signatureEncoded}`;
}

/**
 * Verify JWT using Web Crypto API
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [headerEncoded, payloadEncoded, signatureEncoded] = token.split('.');
    
    if (!headerEncoded || !payloadEncoded || !signatureEncoded) {
      return null;
    }
    
    // Verify the signature
    const message = `${headerEncoded}.${payloadEncoded}`;
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signature = base64urlDecode(signatureEncoded);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(message)
    );
    
    if (!isValid) {
      return null;
    }
    
    // Decode and validate payload
    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadEncoded));
    const payload = JSON.parse(payloadJson) as JWTPayload;
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }
    
    // Check issuer
    if (payload.iss !== CONFIG.JWT.ISSUER) {
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}