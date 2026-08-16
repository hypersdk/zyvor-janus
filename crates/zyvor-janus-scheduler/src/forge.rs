//! Forge-inspired baseline scheduler: priority ordering with preemption.
//! Quotas, gang spread, and topology locality are enforced by `ResourceManager`,
//! not here — this is not full kube-scheduler / Forge plugin parity.

pub use crate::preemptive::PreemptivePriorityScheduler as ForgeScheduler;
