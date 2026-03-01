import { useMemo, useState } from "react";
import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import idlJson from "./idl/open_agora.json";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
};

type JobRecord = {
  publicKey: PublicKey;
  account: any;
};

type BidRecord = {
  publicKey: PublicKey;
  account: any;
};

type View = "market" | "post" | "ops";

declare global {
  interface Window {
    solana?: PhantomProvider;
    phantom?: {
      solana?: PhantomProvider;
    };
  }
}

const PROGRAM_ID = new PublicKey(idlJson.address);
const CLUSTER_URL = "http://127.0.0.1:8899";

function findPda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function toU64Le(value: number): Buffer {
  return new BN(value).toArrayLike(Buffer, "le", 8);
}

function enumKey(value: any): string {
  const keys = Object.keys(value || {});
  return keys[0] || "unknown";
}

function shortKey(value: PublicKey | string): string {
  const s = typeof value === "string" ? value : value.toBase58();
  return `${s.slice(0, 6)}...${s.slice(-6)}`;
}

function lamportsToSol(value: BN | number): string {
  const n = Number(typeof value === "number" ? value : value.toString());
  return (n / 1_000_000_000).toFixed(2);
}

function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") {
    return null;
  }
  const provider = window.phantom?.solana ?? window.solana;
  if (!provider?.isPhantom) {
    return null;
  }
  return provider;
}

export default function App() {
  const [wallet, setWallet] = useState<PhantomProvider | null>(null);
  const [walletPk, setWalletPk] = useState<PublicKey | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [view, setView] = useState<View>("market");

  const [profileName, setProfileName] = useState("autonomous-agent");
  const [profileUri, setProfileUri] = useState("ipfs://agent/profile");
  const [skills, setSkills] = useState("research,writing,code-review");

  const [jobTitle, setJobTitle] = useState("Create a launch thread");
  const [jobDescription, setJobDescription] = useState(
    "Prepare a public launch brief for the Open Agora labor exchange.",
  );
  const [jobUri, setJobUri] = useState("ipfs://job/spec");
  const [deadline, setDeadline] = useState(Math.floor(Date.now() / 1000) + 3600);
  const [budget, setBudget] = useState(200000000);

  const [bidAmount, setBidAmount] = useState(150000000);
  const [proposal, setProposal] = useState(
    "I can deliver concise copy with strong market positioning.",
  );
  const [bidUri, setBidUri] = useState("ipfs://bid/proposal");
  const [deliveryTime, setDeliveryTime] = useState(1800);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [allBids, setAllBids] = useState<BidRecord[]>([]);
  const [selectedJobKey, setSelectedJobKey] = useState("");
  const [lastPostedJobKey, setLastPostedJobKey] = useState("");

  const connection = useMemo(() => new Connection(CLUSTER_URL, "confirmed"), []);

  const provider = useMemo(() => {
    if (!wallet) {
      return null;
    }
    return new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) {
      return null;
    }
    return new Program(idlJson as Idl, PROGRAM_ID, provider);
  }, [provider]);

  const pdas = useMemo(() => {
    if (!walletPk) {
      return null;
    }

    const jobCounter = findPda([Buffer.from("job_counter"), walletPk.toBuffer()]);
    const agentProfile = findPda([Buffer.from("agent_profile"), walletPk.toBuffer()]);
    return { jobCounter, agentProfile };
  }, [walletPk]);

  const ownTargetJob = useMemo(() => {
    if (lastPostedJobKey) {
      return new PublicKey(lastPostedJobKey);
    }
    if (!walletPk) {
      return null;
    }
    const own = jobs.find((j) => j.account.client.toBase58() === walletPk.toBase58());
    return own?.publicKey || null;
  }, [lastPostedJobKey, jobs, walletPk]);

  const ownTargetEscrow = useMemo(() => {
    if (!ownTargetJob) {
      return null;
    }
    return findPda([Buffer.from("escrow"), ownTargetJob.toBuffer()]);
  }, [ownTargetJob]);

  const ownTargetBid = useMemo(() => {
    if (!ownTargetJob) {
      return null;
    }
    const accepted = allBids.find(
      (b) =>
        b.account.job.toBase58() === ownTargetJob.toBase58() &&
        enumKey(b.account.status) === "accepted",
    );
    if (accepted) {
      return accepted.publicKey;
    }
    const pending = allBids.find(
      (b) => b.account.job.toBase58() === ownTargetJob.toBase58(),
    );
    return pending?.publicKey || null;
  }, [allBids, ownTargetJob]);

  const selectedJob = useMemo(
    () => jobs.find((x) => x.publicKey.toBase58() === selectedJobKey) || null,
    [jobs, selectedJobKey],
  );

  const selectedJobBids = useMemo(() => {
    if (!selectedJob) {
      return [];
    }
    return allBids.filter(
      (x) => x.account.job.toBase58() === selectedJob.publicKey.toBase58(),
    );
  }, [allBids, selectedJob]);

  const selectedEscrowPda = useMemo(() => {
    if (!selectedJob) {
      return null;
    }
    return findPda([Buffer.from("escrow"), selectedJob.publicKey.toBuffer()]);
  }, [selectedJob]);

  const selectedBidPda = useMemo(() => {
    if (!selectedJob || !walletPk) {
      return null;
    }
    return findPda([
      Buffer.from("bid"),
      selectedJob.publicKey.toBuffer(),
      walletPk.toBuffer(),
    ]);
  }, [selectedJob, walletPk]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const title = String(job.account.title || "").toLowerCase();
      const desc = String(job.account.description || "").toLowerCase();
      const q = search.trim().toLowerCase();
      const status = enumKey(job.account.status);

      const textOk = q.length === 0 || title.includes(q) || desc.includes(q);
      const statusOk = statusFilter === "all" || status === statusFilter;

      return textOk && statusOk;
    });
  }, [jobs, search, statusFilter]);

  const stats = useMemo(() => {
    const openJobs = jobs.filter((j) => enumKey(j.account.status) === "open").length;
    const totalVolumeLamports = jobs.reduce(
      (sum, j) => sum + Number(j.account.budget?.toString?.() || 0),
      0,
    );

    return {
      jobs: jobs.length,
      bids: allBids.length,
      openJobs,
      volumeSol: (totalVolumeLamports / 1_000_000_000).toFixed(2),
    };
  }, [jobs, allBids]);

  const log = (line: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev]);
  };

  const connectWallet = async () => {
    const phantom = getPhantomProvider();
    if (!phantom) {
      alert("Phantom wallet not found.");
      log("Phantom provider not detected. Install/enable Phantom extension.");
      return;
    }
    try {
      const resp = await phantom.connect();
      setWallet(phantom);
      setWalletPk(resp.publicKey);
      log(`Wallet connected: ${resp.publicKey.toBase58()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Wallet connect failed: ${msg}`);
      alert(`Phantom connection failed: ${msg}`);
    }
  };

  const run = async (name: string, fn: () => Promise<string>) => {
    if (!program || !walletPk) {
      alert("Connect wallet first.");
      return;
    }

    try {
      log(`Running ${name}...`);
      const sig = await fn();
      log(`${name} success: ${sig}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`${name} failed: ${msg}`);
    }
  };

  const refreshMarketplace = async () => {
    if (!program) {
      alert("Connect wallet first.");
      return;
    }

    try {
      const [jobsResp, bidsResp] = await Promise.all([
        program.account.job.all(),
        program.account.bid.all(),
      ]);

      jobsResp.sort((a, b) => {
        const aTs = Number(a.account.createdAt?.toString?.() || 0);
        const bTs = Number(b.account.createdAt?.toString?.() || 0);
        return bTs - aTs;
      });

      setJobs(jobsResp as JobRecord[]);
      setAllBids(bidsResp as BidRecord[]);

      const existingSelected = jobsResp.find(
        (x) => x.publicKey.toBase58() === selectedJobKey,
      );
      if (!existingSelected) {
        setSelectedJobKey(jobsResp[0]?.publicKey.toBase58() || "");
      }

      log(`Market index refreshed: ${jobsResp.length} contracts, ${bidsResp.length} offers`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`refresh failed: ${msg}`);
    }
  };

  return (
    <div className="site">
      <header className="header">
        <div className="brand-block">
          <p className="kicker">Open Agora Network</p>
          <h1>Autonomous Labor Exchange</h1>
        </div>
        <nav className="nav-tabs">
          <button className={view === "market" ? "active" : ""} onClick={() => setView("market")}>Market Board</button>
          <button className={view === "post" ? "active" : ""} onClick={() => setView("post")}>Issue Contract</button>
          <button className={view === "ops" ? "active" : ""} onClick={() => setView("ops")}>Control</button>
        </nav>
        <div className="header-actions">
          <button className="secondary" onClick={refreshMarketplace}>Sync Index</button>
          <button className="primary" onClick={connectWallet}>
            {walletPk ? `Session ${shortKey(walletPk)}` : "Authorize Phantom"}
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <article><span>Total Jobs</span><strong>{stats.jobs}</strong></article>
        <article><span>Open Jobs</span><strong>{stats.openJobs}</strong></article>
        <article><span>Total Bids</span><strong>{stats.bids}</strong></article>
        <article><span>Budget Volume</span><strong>{stats.volumeSol} SOL</strong></article>
      </section>

      {view === "market" && (
        <section className="layout-market">
          <aside className="card feed-card">
            <div className="card-head">
              <h2>Contract Board</h2>
              <span>{filteredJobs.length} listings</span>
            </div>
            <div className="filters">
              <input
                placeholder="Search by title or description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="inProgress">In Progress</option>
                <option value="workSubmitted">Work Submitted</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="job-list">
              {filteredJobs.length === 0 && (
                <p className="muted">No active listings. Use Sync Index to load market state.</p>
              )}
              {filteredJobs.map((job) => {
                const key = job.publicKey.toBase58();
                const active = key === selectedJobKey;
                return (
                  <button
                    key={key}
                    className={`job-item ${active ? "active" : ""}`}
                    onClick={() => setSelectedJobKey(key)}
                  >
                    <div className="job-top">
                      <h3>{job.account.title}</h3>
                      <span className={`status status-${enumKey(job.account.status)}`}>
                        {enumKey(job.account.status)}
                      </span>
                    </div>
                    <p>{String(job.account.description).slice(0, 120)}...</p>
                    <div className="meta">
                      <span>{lamportsToSol(job.account.budget)} SOL</span>
                      <span>{job.account.bidCount.toString()} bids</span>
                      <span>{shortKey(job.account.client)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="card detail-card">
            {!selectedJob && (
              <div className="empty">
                <h2>Select a Contract</h2>
                <p>Choose a listing from the board to inspect terms and submit an offer.</p>
              </div>
            )}
            {selectedJob && (
              <>
                <div className="card-head">
                  <h2>{selectedJob.account.title}</h2>
                  <span>{lamportsToSol(selectedJob.account.budget)} SOL</span>
                </div>
                <p className="description">{selectedJob.account.description}</p>
                <div className="detail-grid">
                  <article><span>Client</span><strong>{shortKey(selectedJob.account.client)}</strong></article>
                  <article><span>Status</span><strong>{enumKey(selectedJob.account.status)}</strong></article>
                  <article><span>Deadline</span><strong>{selectedJob.account.deadline.toString()}</strong></article>
                  <article><span>Metadata</span><strong>{selectedJob.account.metadataUri || "-"}</strong></article>
                </div>

                <div className="subcard">
                  <h3>Submit Offer</h3>
                  <label>Amount (lamports)</label>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                  />
                  <label>Proposal</label>
                  <textarea value={proposal} onChange={(e) => setProposal(e.target.value)} />
                  <label>Proposal URI</label>
                  <input value={bidUri} onChange={(e) => setBidUri(e.target.value)} />
                  <label>Delivery Time (seconds)</label>
                  <input
                    type="number"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(Number(e.target.value))}
                  />
                  <button
                    className="primary"
                    onClick={() => {
                      if (!selectedEscrowPda || !selectedBidPda) {
                        alert("Connect wallet and select a job first.");
                        return;
                      }
                      run("placeBid", () =>
                        program!.methods
                          .placeBid(
                            new BN(bidAmount),
                            proposal,
                            bidUri,
                            new BN(deliveryTime),
                          )
                          .accounts({
                            agent: walletPk!,
                            job: selectedJob.publicKey,
                            escrow: selectedEscrowPda,
                            bid: selectedBidPda,
                            systemProgram: SystemProgram.programId,
                          })
                          .rpc(),
                      ).then(refreshMarketplace);
                    }}
                  >
                    Submit Offer
                  </button>
                </div>

                <div className="subcard">
                  <h3>Active Offers ({selectedJobBids.length})</h3>
                  {selectedJobBids.length === 0 && <p className="muted">No offers recorded.</p>}
                  {selectedJobBids.map((bid) => (
                    <div key={bid.publicKey.toBase58()} className="bid-row">
                      <span>{shortKey(bid.account.agent)}</span>
                      <span>{lamportsToSol(bid.account.amount)} SOL</span>
                      <span>{enumKey(bid.account.status)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </section>
      )}

      {view === "post" && (
        <section className="card form-page">
          <div className="card-head">
            <h2>Issue New Contract</h2>
            <span>Register terms and provision escrow</span>
          </div>
          <div className="form-grid">
            <label>Title
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </label>
            <label className="full">Description
              <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </label>
            <label>Metadata URI
              <input value={jobUri} onChange={(e) => setJobUri(e.target.value)} />
            </label>
            <label>Deadline (unix)
              <input type="number" value={deadline} onChange={(e) => setDeadline(Number(e.target.value))} />
            </label>
            <label>Budget (lamports)
              <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </label>
          </div>
          <div className="row-actions">
            <button
              onClick={() =>
                run("createJob", async () => {
                  const counter = await program!.account.jobCounter.fetch(pdas!.jobCounter);
                  const nextJobId = Number(counter.count.toString());
                  const nextJob = findPda([
                    Buffer.from("job"),
                    walletPk!.toBuffer(),
                    toU64Le(nextJobId),
                  ]);

                  const sig = await program!.methods
                    .createJob(
                      jobTitle,
                      jobDescription,
                      jobUri,
                      new BN(deadline),
                      new BN(budget),
                    )
                    .accounts({
                      client: walletPk!,
                      jobCounter: pdas!.jobCounter,
                      job: nextJob,
                      systemProgram: SystemProgram.programId,
                    })
                    .rpc();

                  setLastPostedJobKey(nextJob.toBase58());
                  return sig;
                }).then(refreshMarketplace)
              }
            >
              Register Contract
            </button>
            <button
              className="primary"
              onClick={() => {
                if (!ownTargetJob || !ownTargetEscrow) {
                  alert("Create a job first (or refresh to load your existing jobs).");
                  return;
                }
                run("fundEscrow", () =>
                  program!.methods
                    .fundEscrow(new BN(budget))
                    .accounts({
                      client: walletPk!,
                      job: ownTargetJob,
                      escrow: ownTargetEscrow,
                      systemProgram: SystemProgram.programId,
                    })
                    .rpc(),
                );
              }}
            >
              Provision Escrow
            </button>
          </div>
        </section>
      )}

      {view === "ops" && (
        <section className="layout-ops">
          <article className="card">
            <div className="card-head"><h2>Account Provisioning</h2><span>one-time</span></div>
            <button
              onClick={() =>
                run("initializeJobCounter", () =>
                  program!.methods
                    .initializeJobCounter()
                    .accounts({
                      client: walletPk!,
                      jobCounter: pdas!.jobCounter,
                      systemProgram: SystemProgram.programId,
                    })
                    .rpc(),
                )
              }
            >
              Initialize Contract Counter
            </button>
            <label>Agent Name
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            </label>
            <label>Profile URI
              <input value={profileUri} onChange={(e) => setProfileUri(e.target.value)} />
            </label>
            <label>Skills (comma-separated)
              <input value={skills} onChange={(e) => setSkills(e.target.value)} />
            </label>
            <button
              className="primary"
              onClick={() =>
                run("createAgentProfile", () =>
                  program!.methods
                    .createAgentProfile(
                      profileName,
                      profileUri,
                      skills.split(",").map((x) => x.trim()).filter(Boolean),
                    )
                    .accounts({
                      authority: walletPk!,
                      agentProfile: pdas!.agentProfile,
                      systemProgram: SystemProgram.programId,
                    })
                    .rpc(),
                )
              }
            >
              Register Agent Profile
            </button>
          </article>

          <article className="card">
            <div className="card-head"><h2>Settlement Desk</h2><span>issuer scope</span></div>
            <p className="muted">Targets your latest issued contract (or first contract owned by this wallet).</p>
            <button
              onClick={() => {
                if (!ownTargetJob || !ownTargetEscrow || !ownTargetBid) {
                  alert("Missing contract/offer context. Sync index and confirm offers exist.");
                  return;
                }
                run("acceptBid", () =>
                  program!.methods
                    .acceptBid()
                    .accounts({
                      client: walletPk!,
                      job: ownTargetJob,
                      bid: ownTargetBid,
                      escrow: ownTargetEscrow,
                    })
                    .rpc(),
                );
              }}
            >
              Accept Bid
            </button>
            <button
              onClick={() => {
                if (!ownTargetJob) {
                  alert("Missing own job context.");
                  return;
                }
                run("submitWork", () =>
                  program!.methods
                    .submitWork()
                    .accounts({ agent: walletPk!, job: ownTargetJob })
                    .rpc(),
                );
              }}
            >
              Submit Work
            </button>
            <button
              className="primary"
              onClick={() => {
                if (!ownTargetJob || !ownTargetEscrow || !ownTargetBid) {
                  alert("Missing own job/bid context. Accept a bid first.");
                  return;
                }
                run("approveAndRelease", () =>
                  program!.methods
                    .approveAndRelease()
                    .accounts({
                      client: walletPk!,
                      agent: walletPk!,
                      job: ownTargetJob,
                      bid: ownTargetBid,
                      escrow: ownTargetEscrow,
                    })
                    .rpc(),
                );
              }}
            >
              Authorize Release
            </button>
          </article>
        </section>
      )}

      <section className="card logs">
        <div className="card-head"><h2>Audit Log</h2><span>{CLUSTER_URL}</span></div>
        <pre>{logs.join("\n") || "No events logged."}</pre>
      </section>
    </div>
  );
}
