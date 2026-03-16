import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

const PROGRAM_ID_FALLBACK = "GbUKaRNfh3hGGZk5G8WxR7rDqNofsmGcMxiz6sDfTqQW";
const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const idlPath = path.resolve(process.cwd(), "target/idl/open_agora.json");
if (!fs.existsSync(idlPath)) {
  console.error("Missing target/idl/open_agora.json");
  console.error("Run: anchor build");
  process.exit(1);
}

const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
const programId = new PublicKey(
  idl.address || idl.metadata?.address || PROGRAM_ID_FALLBACK,
);
const program = new anchor.Program(idl, programId, provider);

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
}

async function maybeAirdrop(pubkey, sol = 3) {
  const min = 0.5 * LAMPORTS_PER_SOL;
  const bal = await provider.connection.getBalance(pubkey, "confirmed");
  if (bal > min) return;
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    Math.floor(sol * LAMPORTS_PER_SOL),
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

async function ensureJobCounter(client) {
  const jobCounter = pda([Buffer.from("job_counter"), client.publicKey.toBuffer()]);
  const existing = await provider.connection.getAccountInfo(jobCounter, "confirmed");
  if (existing) return jobCounter;

  await program.methods
    .initializeJobCounter()
    .accounts({
      client: client.publicKey,
      jobCounter,
      systemProgram: SystemProgram.programId,
    })
    .signers([client])
    .rpc();

  return jobCounter;
}

async function ensureAgentProfile(agent, i) {
  const agentProfile = pda([
    Buffer.from("agent_profile"),
    agent.publicKey.toBuffer(),
  ]);
  const existing = await provider.connection.getAccountInfo(agentProfile, "confirmed");
  if (existing) return agentProfile;

  await program.methods
    .createAgentProfile(
      `agent-${i + 1}`,
      `ipfs://agent/${i + 1}`,
      ["research", "writing", "automation"],
    )
    .accounts({
      authority: agent.publicKey,
      agentProfile,
      systemProgram: SystemProgram.programId,
    })
    .signers([agent])
    .rpc();

  return agentProfile;
}

async function createJobForClient(client, title, description, budgetLamports) {
  const jobCounter = pda([Buffer.from("job_counter"), client.publicKey.toBuffer()]);
  const counter = await program.account.jobCounter.fetch(jobCounter);
  const jobId = Number(counter.count.toString());
  const job = pda([
    Buffer.from("job"),
    client.publicKey.toBuffer(),
    new anchor.BN(jobId).toArrayLike(Buffer, "le", 8),
  ]);
  const escrow = pda([Buffer.from("escrow"), job.toBuffer()]);

  await program.methods
    .createJob(
      title,
      description,
      `ipfs://job/${jobId}`,
      new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
      new anchor.BN(budgetLamports),
    )
    .accounts({
      client: client.publicKey,
      jobCounter,
      job,
      systemProgram: SystemProgram.programId,
    })
    .signers([client])
    .rpc();

  await program.methods
    .fundEscrow(new anchor.BN(budgetLamports))
    .accounts({
      client: client.publicKey,
      job,
      escrow,
      systemProgram: SystemProgram.programId,
    })
    .signers([client])
    .rpc();

  return { job, escrow, budgetLamports };
}

async function placeBid(agent, job, escrow, amountLamports, i) {
  const bid = pda([
    Buffer.from("bid"),
    job.toBuffer(),
    agent.publicKey.toBuffer(),
  ]);
  const existing = await provider.connection.getAccountInfo(bid, "confirmed");
  if (existing) return bid;

  await program.methods
    .placeBid(
      new anchor.BN(amountLamports),
      `Delivery proposal ${i + 1}: scoped execution with milestone report.`,
      `ipfs://bid/${i + 1}`,
      new anchor.BN(7200),
    )
    .accounts({
      agent: agent.publicKey,
      job,
      escrow,
      bid,
      systemProgram: SystemProgram.programId,
    })
    .signers([agent])
    .rpc();

  return bid;
}

async function main() {
  const clients = [Keypair.generate(), Keypair.generate()];
  const agents = [Keypair.generate(), Keypair.generate(), Keypair.generate()];

  for (const kp of [...clients, ...agents]) {
    await maybeAirdrop(kp.publicKey, 3);
  }

  for (let i = 0; i < clients.length; i++) {
    await ensureJobCounter(clients[i]);
  }

  for (let i = 0; i < agents.length; i++) {
    await ensureAgentProfile(agents[i], i);
  }

  const createdJobs = [];
  createdJobs.push(
    await createJobForClient(
      clients[0],
      "Draft product launch brief",
      "Need a concise launch narrative and campaign structure.",
      0.4 * LAMPORTS_PER_SOL,
    ),
  );
  createdJobs.push(
    await createJobForClient(
      clients[0],
      "Build onboarding flow copy",
      "Create conversion-focused onboarding copy for web onboarding.",
      0.25 * LAMPORTS_PER_SOL,
    ),
  );
  createdJobs.push(
    await createJobForClient(
      clients[1],
      "Write API docs summary",
      "Produce concise developer docs for integration quickstart.",
      0.3 * LAMPORTS_PER_SOL,
    ),
  );

  for (let i = 0; i < createdJobs.length; i++) {
    const j = createdJobs[i];
    await placeBid(agents[0], j.job, j.escrow, Math.floor(j.budgetLamports * 0.8), i);
    await placeBid(agents[1], j.job, j.escrow, Math.floor(j.budgetLamports * 0.7), i);
  }

  console.log("Seed completed.");
  console.log("Program:", program.programId.toBase58());
  console.log("Created jobs:", createdJobs.length);
  console.log("Client wallets:");
  for (const c of clients) console.log(" -", c.publicKey.toBase58());
  console.log("Agent wallets:");
  for (const a of agents) console.log(" -", a.publicKey.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
