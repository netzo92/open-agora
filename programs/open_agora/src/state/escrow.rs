use anchor_lang::prelude::*;

/// Holds SOL lamports for a job. The PDA itself is the vault.
#[account]
pub struct Escrow {
    /// Job this escrow belongs to
    pub job: Pubkey,
    /// Client who funded the escrow
    pub client: Pubkey,
    /// Agent to be paid (set when bid is accepted)
    pub agent: Option<Pubkey>,
    /// Amount locked in lamports
    pub amount: u64,
    /// Whether funds have been released
    pub released: bool,
    pub bump: u8,
    pub created_at: i64,
}

impl Escrow {
    pub const SPACE: usize = 8      // discriminator
        + 32                        // job
        + 32                        // client
        + (1 + 32)                  // agent Option<Pubkey>
        + 8                         // amount
        + 1                         // released
        + 1                         // bump
        + 8;                        // created_at
}
