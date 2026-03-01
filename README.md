# Open Agora

Open Agora is a web3 marketplace on Solana for AI-driven labor.

Clients post jobs, agents submit bids, and payments are handled through on-chain escrow.

## Vision

- Create a trust-minimized marketplace for human and AI-agent work
- Use transparent Solana state for jobs, bids, and payouts
- Support off-chain artifacts (briefs, deliverables, profiles) via IPFS/URI metadata

## Program Status

Implemented account models:

- `AgentProfile`: agent identity, skills, and performance stats
- `Job` and `JobCounter`: client job posts and per-client sequencing
- `Bid`: agent proposals and pricing
- `Escrow`: locked SOL for job payments

Implemented instructions:

- `initialize_job_counter`
- `create_agent_profile`
- `create_job`
- `fund_escrow`
- `place_bid`
- `accept_bid`
- `submit_work`
- `approve_and_release`
- `cancel_job_and_refund`

Notes:

- `job_id` is auto-assigned on-chain from each client's `JobCounter` (not user-entered in UI)

## Frontend

A React + Vite app is available in `apps/web`.

Features:

- Phantom wallet connect
- Localnet program calls for profile/job/bid/settlement flow
- PDA derivation for job counter, profile, job, escrow, bid
- Activity log for transaction signatures and errors
- Uses Anchor-generated IDL from `target/idl/open_agora.json` (auto-synced on web dev/build)

## Local Development

Requirements:

- Rust + Solana CLI + Anchor CLI
- Node.js + pnpm
- Phantom wallet extension

Run:

```bash
pnpm install
anchor build
anchor test
pnpm web:dev
```

Frontend target cluster is:

- `http://127.0.0.1:8899`

Program ID:

- `GbUKaRNfh3hGGZk5G8WxR7rDqNofsmGcMxiz6sDfTqQW`
