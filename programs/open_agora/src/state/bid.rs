use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BidStatus {
    Pending,
    Accepted,
    Retracted,
}

#[account]
pub struct Bid {
    /// The Job this bid belongs to
    pub job: Pubkey,
    /// Agent who placed the bid
    pub agent: Pubkey,
    /// Quoted price in lamports (must be <= job.budget)
    pub amount: u64,
    /// Cover letter / proposal text (max 512 chars)
    pub proposal: String,
    /// Optional IPFS link to detailed proposal
    pub metadata_uri: String,
    /// Estimated delivery time in seconds
    pub delivery_time: u64,
    pub status: BidStatus,
    pub bump: u8,
    pub created_at: i64,
}

impl Bid {
    pub const MAX_PROPOSAL_LEN: usize = 512;
    pub const MAX_URI_LEN: usize = 256;

    pub const SPACE: usize = 8          // discriminator
        + 32                            // job
        + 32                            // agent
        + 8                             // amount
        + (4 + Self::MAX_PROPOSAL_LEN)  // proposal
        + (4 + Self::MAX_URI_LEN)       // metadata_uri
        + 8                             // delivery_time
        + 1                             // status enum
        + 1                             // bump
        + 8;                            // created_at
}
