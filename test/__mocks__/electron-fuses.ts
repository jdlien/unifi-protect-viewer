import { vi } from 'vitest'

export const flipFuses = vi.fn().mockResolvedValue(undefined)

export const FuseVersion = { V1: 1 }

export const FuseV1Options = {
  RunAsNode: 'RunAsNode',
  EnableNodeCliInspectArguments: 'EnableNodeCliInspectArguments',
  EnableEmbeddedAsarIntegrityValidation: 'EnableEmbeddedAsarIntegrityValidation',
  OnlyLoadAppFromAsar: 'OnlyLoadAppFromAsar',
  GrantFileProtocolExtraPrivileges: 'GrantFileProtocolExtraPrivileges',
}
