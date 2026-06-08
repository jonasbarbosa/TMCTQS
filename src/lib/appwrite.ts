import {
  Account,
  Client,
  Databases,
  ID,
  Permission,
  Query,
  Role,
  Storage,
  Teams,
  type Models,
} from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID

if (!endpoint) throw new Error('VITE_APPWRITE_ENDPOINT não definido')
if (!projectId) throw new Error('VITE_APPWRITE_PROJECT_ID não definido')

export const appwriteClient = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)

export const account = new Account(appwriteClient)
export const databases = new Databases(appwriteClient)
export const storage = new Storage(appwriteClient)
export const teams = new Teams(appwriteClient)

export { ID, Permission, Query, Role }
export type { Models }

let cachedTeamIds: string[] | null = null

export async function fetchUserTeams(): Promise<string[]> {
  try {
    const res = await teams.list({ queries: [Query.limit(100)] })
    cachedTeamIds = res.teams.map((t) => t.$id)
    return cachedTeamIds
  } catch {
    cachedTeamIds = []
    return []
  }
}

export function addTeamToCache(teamId: string) {
  if (cachedTeamIds && !cachedTeamIds.includes(teamId)) {
    cachedTeamIds.push(teamId)
  }
}

export function clearTeamCache() {
  cachedTeamIds = null
}

function userOnTeam(teamId: string): boolean {
  return cachedTeamIds?.includes(teamId) ?? false
}

export function teamDocPermissions(teamId: string, userId?: string) {
  if (!userId) {
    return [Permission.read(Role.team(teamId)), Permission.write(Role.team(teamId))]
  }
  const perms = [Permission.read(Role.user(userId)), Permission.write(Role.user(userId))]
  if (teamId && userOnTeam(teamId)) {
    perms.push(Permission.read(Role.team(teamId)), Permission.write(Role.team(teamId)))
  }
  return perms
}
