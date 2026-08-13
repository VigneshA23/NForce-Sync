package com.nforceone.sync.businessrules;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.LocalTime;

// Column names/types below mirror the table as it actually exists on the shared database
// (created by an earlier, since-reverted migration — see V27__create_shifts_and_holidays.sql).
@Entity
@Table(name = "business_rule_config")
@Getter
@Setter
public class BusinessRuleConfig {

    @Id
    private Long id;

    @Column(name = "standard_hours_per_day", nullable = false)
    private BigDecimal workingHoursPerDay;

    @Enumerated(EnumType.STRING)
    @Column(name = "weekend_rule", nullable = false, length = 20)
    private WeekendRule weekendRule;

    /**
     * @deprecated Superseded by {@code shift_definition.eod_cutoff_hours} — the deadline is now
     * "shift end + N hours" per shift, which a single global time-of-day could not express for a
     * shift crossing midnight. Nothing reads this any more and it is no longer exposed on
     * {@link BusinessRuleConfigDto}, but the column is NOT NULL and still mapped so saves of this
     * singleton row keep working; dropping it would need its own migration.
     */
    @Deprecated
    @Column(name = "eod_cutoff_time", nullable = false)
    private LocalTime eodCutoffTime;

    @Column(name = "reminder_lead_minutes", nullable = false)
    private Integer reminderLeadMinutes;

    @Column(name = "escalation_sla_hours", nullable = false)
    private Integer escalationSlaHours;

    // Team Lead Dashboard: individual-utilization flags and the "team at risk" rule read these.
    @Column(name = "underutilized_threshold_pct", nullable = false)
    private BigDecimal underutilizedThresholdPct;

    @Column(name = "overloaded_threshold_pct", nullable = false)
    private BigDecimal overloadedThresholdPct;

    @Column(name = "at_risk_missing_pct", nullable = false)
    private BigDecimal atRiskMissingPct;

    // How long a blocker can sit open before the Blockers panel highlights it.
    @Column(name = "blocker_age_alert_hours", nullable = false)
    private BigDecimal blockerAgeAlertHours;

    // Time adjustment allowances — uses permitted per calendar month, per type. Global:
    // one value each, no per-role or per-department override. Separate from the per-use
    // duration limit (30-120 minutes), which lives in EodService.
    @Column(name = "late_arrival_allowance", nullable = false)
    private Integer lateArrivalAllowance;

    @Column(name = "early_leave_allowance", nullable = false)
    private Integer earlyLeaveAllowance;

    @Column(name = "intervening_allowance", nullable = false)
    private Integer interveningAllowance;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private AppUser updatedBy;

    public enum WeekendRule { SAT_SUN, SUN_ONLY }
}
