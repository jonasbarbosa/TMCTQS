import { BUCKET_IDS, COLLECTION_IDS, DATABASE_ID } from './ids'

function asMessage(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return ''
}

function uniqueList(items: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const i of items) {
    if (!i) continue
    if (seen.has(i)) continue
    seen.add(i)
    out.push(i)
  }
  return out
}

const NETWORK_ERRORS = [
  'Failed to fetch',
  'NetworkError',
  'Network Error',
  'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_NAME_NOT_RESOLVED',
  'The network connection was lost',
  'timeout',
  'Timed out',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
]

function isNetworkError(msg: string) {
  const lowered = msg.toLowerCase()
  return NETWORK_ERRORS.some((keyword) => lowered.includes(keyword.toLowerCase()))
}

export function appwriteErrorMessage(e: unknown, fallback: string) {
  const msg = asMessage(e)

  if (isNetworkError(msg)) {
    return [
      'Falha de conexão com o servidor Appwrite.',
      'Verifique se o servidor está acessível em ' + import.meta.env.VITE_APPWRITE_ENDPOINT,
      'Pode ser uma instabilidade temporária — tente novamente em alguns segundos.',
    ].join(' ')
  }

  if (msg.includes('Collection with the requested ID could not be found')) {
    const expectedCollections = uniqueList(Object.values(COLLECTION_IDS))
    return [
      'Collections do Appwrite não encontradas.',
      `Database: ${DATABASE_ID}`,
      `Crie as Collections com IDs: ${expectedCollections.join(', ')}`,
      'Ou rode: npm run appwrite:provision (com APPWRITE_API_KEY no .env)',
    ].join(' ')
  }

  if (msg.includes('Database with the requested ID could not be found')) {
    return [
      'Database do Appwrite não encontrado.',
      `Database: ${DATABASE_ID}`,
      'Confira VITE_APPWRITE_DATABASE_ID no .env.',
    ].join(' ')
  }

  if (msg.includes('Bucket with the requested ID could not be found')) {
    const expectedBuckets = uniqueList(Object.values(BUCKET_IDS))
    return [
      'Bucket do Appwrite não encontrado (Storage).',
      `Buckets esperados: ${expectedBuckets.join(', ')}`,
      'Crie o Bucket no Console ou rode: npm run appwrite:provision.',
    ].join(' ')
  }

  if (
    msg.includes('The current user is not authorized to perform the requested action') ||
    msg.toLowerCase().includes('not authorized')
  ) {
    return [
      'Acesso negado no Appwrite (permissões).',
      'Verifique no Console: Database → Collection → Settings → Permissions.',
      'Para o MVP funcionar, libere pelo menos Read e Create para Role: Users.',
      'E mantenha Document Security ligado para restringir por Team nos documentos.',
    ].join(' ')
  }

  if (msg) return msg
  return fallback
}
