use anchor_lang::prelude::*;

#[error_code]
pub enum AgoraError {
    #[msg("Job is not in Open status")]
    JobNotOpen,
    #[msg("Job is not in the expected status for this operation")]
    InvalidJobStatus,
    #[msg("Caller is not authorized to perform this action")]
    Unauthorized,
    #[msg("Bid amount exceeds job budget")]
    BidExceedsBudget,
    #[msg("Bid amount must be greater than zero")]
    BidAmountZero,
    #[msg("Bid does not belong to this job")]
    BidJobMismatch,
    #[msg("Bid is not in Pending status")]
    BidNotPending,
    #[msg("Escrow has already been released")]
    EscrowAlreadyReleased,
    #[msg("Escrow is not funded")]
    EscrowNotFunded,
    #[msg("Escrow amount must equal job budget")]
    InvalidEscrowFunding,
    #[msg("Insufficient escrow balance for transfer")]
    EscrowInsufficient,
    #[msg("Agent name exceeds maximum length")]
    NameTooLong,
    #[msg("Metadata URI exceeds maximum length")]
    UriTooLong,
    #[msg("Too many skills provided (max 10)")]
    TooManySkills,
    #[msg("Skill tag exceeds maximum length (max 32)")]
    SkillTooLong,
    #[msg("Job title exceeds maximum length")]
    TitleTooLong,
    #[msg("Job description exceeds maximum length")]
    DescriptionTooLong,
    #[msg("Bid proposal exceeds maximum length")]
    ProposalTooLong,
    #[msg("Job deadline has already passed")]
    DeadlinePassed,
    #[msg("Budget must be greater than zero")]
    BudgetZero,
    #[msg("Math overflow")]
    ArithmeticOverflow,
    #[msg("Service listing is not active")]
    ServiceNotActive,
    #[msg("Hourly rate must be non-negative")]
    InvalidRate,
}
