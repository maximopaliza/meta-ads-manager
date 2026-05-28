// Shared constants for Drive folders — safe to import in client components
export const SUBFOLDER_NAMES = ['No subidos', 'Nuevos subidos', 'Winners', 'Poco gasto', 'Malos', 'Quemados'] as const
export type DriveFolder = (typeof SUBFOLDER_NAMES)[number]

export const SUBFOLDER_EMOJI: Record<string, string> = {
  'No subidos':    '🆕',
  'Nuevos subidos':'🔄',
  'Winners':       '🏆',
  'Poco gasto':    '💸',
  'Malos':         '❌',
  'Quemados':      '🔥',
}
