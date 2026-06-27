import type { OrchestrationState } from "../core/orchestrator";
import {
  createHermesProfile,
  deleteHermesProfile,
  listHermesProfiles,
  setActiveHermesProfile,
  type HermesProfileInfo,
} from "../runtime/hermes-runtime";

export function updateAgentProfileBinding(
  state: OrchestrationState,
  agentId: string,
  hermesProfile: string,
): OrchestrationState {
  return {
    ...state,
    bindings: state.bindings.map((binding) =>
      binding.agentId === agentId ? { ...binding, hermesProfile } : binding,
    ),
  };
}

export async function loadProfiles(): Promise<HermesProfileInfo[]> {
  return listHermesProfiles();
}

export async function createStoredProfile(input: {
  name: string;
  cloneConfig: boolean;
}): Promise<HermesProfileInfo[]> {
  return createHermesProfile(input);
}

export async function activateStoredProfile(profileName: string): Promise<HermesProfileInfo[]> {
  return setActiveHermesProfile({ name: profileName });
}

export async function deleteStoredProfile(profileName: string): Promise<HermesProfileInfo[]> {
  return deleteHermesProfile({ name: profileName });
}
