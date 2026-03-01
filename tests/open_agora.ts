import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { OpenAgora } from "../target/types/open_agora";

describe("open_agora", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.openAgora as Program<OpenAgora>;

  const client = provider.wallet;
  const agent = anchor.web3.Keypair.generate();

  const [jobCounterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("job_counter"), client.publicKey.toBuffer()],
    program.programId,
  );

  const [agentProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent_profile"), agent.publicKey.toBuffer()],
    program.programId,
  );

  const jobId = new anchor.BN(0);
  const jobIdLe = jobId.toArrayLike(Buffer, "le", 8);
  const [jobPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("job"), client.publicKey.toBuffer(), jobIdLe],
    program.programId,
  );

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), jobPda.toBuffer()],
    program.programId,
  );

  const [bidPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bid"), jobPda.toBuffer(), agent.publicKey.toBuffer()],
    program.programId,
  );

  const budget = new anchor.BN(200_000_000);
  const bidAmount = new anchor.BN(150_000_000);

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      agent.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  });

  it("runs an end-to-end marketplace flow", async () => {
    await program.methods
      .initializeJobCounter()
      .accounts({
        client: client.publicKey,
        jobCounter: jobCounterPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createAgentProfile("autonomous-writer", "ipfs://agent/profile", [
        "copywriting",
        "research",
      ])
      .accounts({
        authority: agent.publicKey,
        agentProfile: agentProfilePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createJob(
        "Write launch thread",
        "Draft launch messaging for a Solana AI labor marketplace",
        "ipfs://job/spec",
        new anchor.BN(now + 3600),
        budget,
      )
      .accounts({
        client: client.publicKey,
        jobCounter: jobCounterPda,
        job: jobPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .fundEscrow(budget)
      .accounts({
        client: client.publicKey,
        job: jobPda,
        escrow: escrowPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .placeBid(
        bidAmount,
        "I can deliver polished messaging with clear audience segmentation.",
        "ipfs://bid/proposal",
        new anchor.BN(1800),
      )
      .accounts({
        agent: agent.publicKey,
        job: jobPda,
        escrow: escrowPda,
        bid: bidPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    await program.methods
      .acceptBid()
      .accounts({
        client: client.publicKey,
        job: jobPda,
        bid: bidPda,
        escrow: escrowPda,
      })
      .rpc();

    await program.methods
      .submitWork()
      .accounts({
        agent: agent.publicKey,
        job: jobPda,
      })
      .signers([agent])
      .rpc();

    const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);

    await program.methods
      .approveAndRelease()
      .accounts({
        client: client.publicKey,
        agent: agent.publicKey,
        job: jobPda,
        bid: bidPda,
        escrow: escrowPda,
      })
      .rpc();

    const [jobAccount, escrowAccount, agentBalanceAfter, counterAccount] =
      await Promise.all([
        program.account.job.fetch(jobPda),
        program.account.escrow.fetch(escrowPda),
        provider.connection.getBalance(agent.publicKey),
        program.account.jobCounter.fetch(jobCounterPda),
      ]);

    expect("completed" in jobAccount.status).to.eq(true);
    expect(escrowAccount.released).to.eq(true);
    expect(escrowAccount.amount.toNumber()).to.eq(0);
    expect(counterAccount.count.toNumber()).to.eq(1);
    expect(agentBalanceAfter).to.be.greaterThan(agentBalanceBefore);
  });
});
