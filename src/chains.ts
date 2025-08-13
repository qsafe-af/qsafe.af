// Chain configuration with friendly names mapped to genesis hashes
import type { Chain } from "./types";

// Dictionary of chains with lowercase name as key
export const chains: Record<string, Chain> = {
  resonance: {
    name: "resonance",
    genesis:
      "0xdbacc01ae41b79388135ccd5d0ebe81eb0905260344256e6f4003bb8e75a91b5",
    displayName: "Resonance",
    endpoints: ["wss://a.t.res.fm"],
    pallets: [
      {
        name: "System",
        index: 0,
        calls: [
          { name: "remark", index: 0 },
          { name: "set_heap_pages", index: 1 },
          { name: "set_code", index: 2 },
          { name: "set_code_without_checks", index: 3 },
          { name: "set_storage", index: 4 },
          { name: "kill_storage", index: 5 },
          { name: "kill_prefix", index: 6 },
          { name: "remark_with_event", index: 7 },
          { name: "authorize_upgrade", index: 9 },
          { name: "authorize_upgrade_without_checks", index: 10 },
          { name: "apply_authorized_upgrade", index: 11 },
        ],
      },
      {
        name: "Timestamp",
        index: 1,
        calls: [
          { name: "set", index: 0 },
        ],
      },
      {
        name: "Balances",
        index: 2,
        calls: [
          { name: "transfer_allow_death", index: 0 },
          { name: "force_transfer", index: 2 },
          { name: "transfer_keep_alive", index: 3 },
          { name: "transfer_all", index: 4 },
          { name: "force_unreserve", index: 5 },
          { name: "upgrade_accounts", index: 6 },
          { name: "force_set_balance", index: 8 },
          { name: "force_adjust_total_issuance", index: 9 },
          { name: "burn", index: 10 },
        ],
      },
      { name: "TransactionPayment", index: 3 },
      {
        name: "Sudo",
        index: 4,
        calls: [
          { name: "sudo", index: 0 },
          { name: "sudo_unchecked_weight", index: 1 },
          { name: "set_key", index: 2 },
          { name: "sudo_as", index: 3 },
          { name: "remove_key", index: 4 },
        ],
      },
      { name: "QPoW", index: 5 },
      {
        name: "Wormhole",
        index: 6,
        calls: [
          { name: "verify_wormhole_proof", index: 0 },
        ],
      },
      { name: "MiningRewards", index: 7 },
      {
        name: "Vesting",
        index: 8,
        calls: [
          { name: "vest", index: 0 },
          { name: "vest_other", index: 1 },
          { name: "vested_transfer", index: 2 },
          { name: "force_vested_transfer", index: 3 },
          { name: "merge_schedules", index: 4 },
          { name: "force_remove_vesting_schedule", index: 5 },
        ],
      },
      {
        name: "Preimage",
        index: 9,
        calls: [
          { name: "note_preimage", index: 0 },
          { name: "unnote_preimage", index: 1 },
          { name: "request_preimage", index: 2 },
          { name: "unrequest_preimage", index: 3 },
          { name: "ensure_updated", index: 4 },
        ],
      },
      {
        name: "Scheduler",
        index: 10,
        calls: [
          { name: "schedule", index: 0 },
          { name: "cancel", index: 1 },
          { name: "schedule_named", index: 2 },
          { name: "cancel_named", index: 3 },
          { name: "schedule_after", index: 4 },
          { name: "schedule_named_after", index: 5 },
          { name: "set_retry", index: 6 },
          { name: "set_retry_named", index: 7 },
          { name: "cancel_retry", index: 8 },
          { name: "cancel_retry_named", index: 9 },
        ],
      },
      {
        name: "Utility",
        index: 11,
        calls: [
          { name: "batch", index: 0 },
          { name: "as_derivative", index: 1 },
          { name: "batch_all", index: 2 },
          { name: "dispatch_as", index: 3 },
          { name: "force_batch", index: 4 },
          { name: "with_weight", index: 5 },
        ],
      },
      {
        name: "Referenda",
        index: 12,
        calls: [
          { name: "submit", index: 0 },
          { name: "place_decision_deposit", index: 1 },
          { name: "refund_decision_deposit", index: 2 },
          { name: "cancel", index: 3 },
          { name: "kill", index: 4 },
          { name: "nudge_referendum", index: 5 },
          { name: "one_fewer_deciding", index: 6 },
          { name: "refund_submission_deposit", index: 7 },
          { name: "set_metadata", index: 8 },
        ],
      },
      {
        name: "ReversibleTransfers",
        index: 13,
        calls: [
          { name: "create_transfer", index: 0 },
          { name: "send_transfer", index: 1 },
          { name: "send_transfer_root", index: 2 },
          { name: "revert_transfer", index: 3 },
          { name: "finalize_transfer", index: 4 },
        ],
      },
      {
        name: "ConvictionVoting",
        index: 14,
        calls: [
          { name: "vote", index: 0 },
          { name: "delegate", index: 1 },
          { name: "undelegate", index: 2 },
          { name: "unlock", index: 3 },
          { name: "remove_vote", index: 4 },
          { name: "remove_other_vote", index: 5 },
        ],
      },
      {
        name: "TechCollective",
        index: 15,
        calls: [
          { name: "add_member", index: 0 },
          { name: "promote_member", index: 1 },
          { name: "demote_member", index: 2 },
          { name: "remove_member", index: 3 },
          { name: "vote", index: 4 },
          { name: "cleanup_poll", index: 5 },
          { name: "exchange_member", index: 6 },
        ],
      },
      {
        name: "TechReferenda",
        index: 16,
        calls: [
          { name: "submit", index: 0 },
          { name: "place_decision_deposit", index: 1 },
          { name: "refund_decision_deposit", index: 2 },
          { name: "cancel", index: 3 },
          { name: "kill", index: 4 },
          { name: "nudge_referendum", index: 5 },
          { name: "one_fewer_deciding", index: 6 },
          { name: "refund_submission_deposit", index: 7 },
          { name: "set_metadata", index: 8 },
        ],
      },
      {
        name: "MerkleAirdrop",
        index: 17,
        calls: [
          { name: "create_airdrop", index: 0 },
          { name: "fund_airdrop", index: 1 },
          { name: "claim", index: 2 },
          { name: "delete_airdrop", index: 3 },
        ],
      },
      {
        name: "TreasuryPallet",
        index: 18,
        calls: [
          { name: "spend_local", index: 3 },
          { name: "remove_approval", index: 4 },
          { name: "spend", index: 5 },
          { name: "payout", index: 6 },
          { name: "check_status", index: 7 },
          { name: "void_spend", index: 8 },
        ],
      },
      { name: "Origins", index: 19 },
      {
        name: "Recovery",
        index: 20,
        calls: [
          { name: "as_recovered", index: 0 },
          { name: "set_recovered", index: 1 },
          { name: "create_recovery", index: 2 },
          { name: "initiate_recovery", index: 3 },
          { name: "vouch_recovery", index: 4 },
          { name: "claim_recovery", index: 5 },
          { name: "close_recovery", index: 6 },
          { name: "remove_recovery", index: 7 },
          { name: "cancel_recovered", index: 8 },
        ],
      },
      {
        name: "Assets",
        index: 21,
        calls: [
          { name: "create", index: 0 },
          { name: "force_create", index: 1 },
          { name: "start_destroy", index: 2 },
          { name: "destroy_accounts", index: 3 },
          { name: "destroy_approvals", index: 4 },
          { name: "finish_destroy", index: 5 },
          { name: "mint", index: 6 },
          { name: "burn", index: 7 },
          { name: "transfer", index: 8 },
          { name: "transfer_keep_alive", index: 9 },
          { name: "force_transfer", index: 10 },
          { name: "freeze", index: 11 },
          { name: "thaw", index: 12 },
          { name: "freeze_asset", index: 13 },
          { name: "thaw_asset", index: 14 },
          { name: "transfer_ownership", index: 15 },
          { name: "set_team", index: 16 },
          { name: "set_metadata", index: 17 },
          { name: "clear_metadata", index: 18 },
          { name: "force_set_metadata", index: 19 },
          { name: "force_clear_metadata", index: 20 },
          { name: "force_asset_status", index: 21 },
          { name: "approve_transfer", index: 22 },
          { name: "cancel_approval", index: 23 },
          { name: "force_cancel_approval", index: 24 },
          { name: "transfer_approved", index: 25 },
          { name: "touch", index: 26 },
          { name: "refund", index: 27 },
          { name: "set_min_balance", index: 28 },
          { name: "touch_other", index: 29 },
          { name: "refund_other", index: 30 },
          { name: "block", index: 31 },
          { name: "transfer_all", index: 32 },
        ],
      },
    ],
  },
  quantus: {
    name: "quantus",
    genesis:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    displayName: "Quantus",
  },
  integration: {
    name: "integration",
    genesis:
      "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    displayName: "Integration",
    endpoints: ["wss://a.i.res.fm"],
  },
};

// Get chain by genesis hash
export function getChainByGenesis(genesis: string): Chain | undefined {
  const normalizedGenesis = genesis.toLowerCase();
  return Object.values(chains).find(
    (chain) => chain.genesis.toLowerCase() === normalizedGenesis,
  );
}

// Get chain by name (case-insensitive)
export function getChainByName(name: string): Chain | undefined {
  return chains[name.toLowerCase()];
}

// Get chain by either name or genesis hash
export function getChain(nameOrGenesis: string): Chain | undefined {
  // First try to find by name
  const byName = getChainByName(nameOrGenesis);
  if (byName) return byName;

  // Then try to find by genesis hash
  return getChainByGenesis(nameOrGenesis);
}

// Get all available chains
export function getAllChains(): Chain[] {
  return Object.values(chains);
}

// Get display name for a chain identifier (name or genesis)
export function getChainDisplayName(nameOrGenesis: string): string {
  const chain = getChain(nameOrGenesis);
  return chain ? chain.displayName : nameOrGenesis;
}

// Normalize chain identifier to genesis hash
export function normalizeToGenesis(nameOrGenesis: string): string {
  const chain = getChain(nameOrGenesis);
  return chain ? chain.genesis : nameOrGenesis;
}

// Normalize chain identifier to friendly name
export function normalizeToName(nameOrGenesis: string): string {
  const chain = getChain(nameOrGenesis);
  return chain ? chain.name : nameOrGenesis;
}
