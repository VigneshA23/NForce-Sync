package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.teamlead.dto.DashboardTrendDto;
import com.nforceone.sync.teamlead.dto.MemberEodStatusDto;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import com.nforceone.sync.teamlead.dto.ThresholdsDto;
import com.nforceone.sync.teamlead.dto.TrendPointDto;
import com.nforceone.sync.utilization.UtilSnapshot;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Backs the Team Lead Dashboard. Every method resolves the acting Team Lead from
 * their own session (no managerId path param) — this surface is self-scoped by design,
 * unlike TeamController/TeamService which SUPERADMIN can also query by id.
 */
@Service
@Transactional(readOnly = true)
public class TeamLeadService {

    private static final long CONFIG_ID = 1L;

    // Matches the category name EodService validates against for leave/holiday tasks
    // (must have 0 hours). No dedicated leave-request/approval workflow exists yet —
    // "approved leave" is inferred from an entry whose only task falls in this category.
    private static final String LEAVE_HOLIDAY_CATEGORY = "Leave / Holiday";

    private final AppUserRepository            userRepository;
    private final EodEntryRepository           entryRepository;
    private final EodTaskRepository            taskRepository;
    private final UtilSnapshotRepository       snapshotRepository;
    private final HolidayRepository            holidayRepository;
    private final BusinessRuleConfigRepository configRepository;

    public TeamLeadService(AppUserRepository userRepository,
                            EodEntryRepository entryRepository,
                            EodTaskRepository taskRepository,
                            UtilSnapshotRepository snapshotRepository,
                            HolidayRepository holidayRepository,
                            BusinessRuleConfigRepository configRepository) {
        this.userRepository    = userRepository;
        this.entryRepository   = entryRepository;
        this.taskRepository    = taskRepository;
        this.snapshotRepository = snapshotRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository  = configRepository;
    }

    public ThresholdsDto getThresholds() {
        return toThresholds(requireConfig());
    }

    /**
     * {@code from}/{@code to} bound the window shown in the Blockers panel (accumulated
     * over the range); per-member snapshot fields (status, utilization) are always read
     * as of {@code to} — a single status/util field can't represent more than one day.
     */
    public TeamLeadSummaryDto getSummary(LocalDate from, LocalDate to, String actingEmail) {
        AppUser lead = requireLead(actingEmail);
        BusinessRuleConfig config = requireConfig();
        boolean holidayToday = holidayRepository.existsByHolidayDate(to);

        List<AppUser> members = activeMembers(lead.getId());
        int onLeave = 0, missing = 0, pending = 0, submitted = 0;
        int underutilized = 0, overloaded = 0;
        BigDecimal utilSum = BigDecimal.ZERO;
        int utilCount = 0;

        for (AppUser member : members) {
            Optional<EodEntry> entry = entryRepository.findByEmployeeIdAndEntryDate(member.getId(), to);
            String status = resolveStatus(entry, holidayToday);
            switch (status) {
                case "ON_LEAVE" -> onLeave++;
                case "MISSING" -> missing++;
                case "PENDING_APPROVAL" -> pending++;
                case "SUBMITTED" -> submitted++;
                default -> { }
            }

            BigDecimal pct = utilizationPct(member.getId(), to);
            if (pct != null) {
                utilSum = utilSum.add(pct);
                utilCount++;
                if (pct.compareTo(config.getUnderutilizedThresholdPct()) < 0) underutilized++;
                if (pct.compareTo(config.getOverloadedThresholdPct()) > 0) overloaded++;
            }
        }

        BigDecimal avgUtil = utilCount > 0
                ? utilSum.divide(BigDecimal.valueOf(utilCount), 2, RoundingMode.HALF_UP)
                : null;

        int activeBlockers = (int) taskRepository.findBlockedByManagerId(lead.getId())
                .stream()
                .filter(t -> inRange(t.getEodEntry().getEntryDate(), from, to))
                .filter(t -> t.getAcknowledgedAt() == null)
                .count();

        return new TeamLeadSummaryDto(
                members.size(), onLeave, missing, pending, submitted,
                avgUtil, underutilized, overloaded, activeBlockers,
                toThresholds(config));
    }

    public List<MemberEodStatusDto> getMemberStatuses(LocalDate from, LocalDate to, String actingEmail) {
        AppUser lead = requireLead(actingEmail);
        BusinessRuleConfig config = requireConfig();
        boolean holidayToday = holidayRepository.existsByHolidayDate(to);

        List<AppUser> members = activeMembers(lead.getId());
        List<TeamBlockerDto> openBlockers = getBlockers(from, to, actingEmail);

        return members.stream().map(member -> {
            Optional<EodEntry> entry = entryRepository.findByEmployeeIdAndEntryDate(member.getId(), to);
            String status = resolveStatus(entry, holidayToday);
            BigDecimal pct = utilizationPct(member.getId(), to);
            boolean underutilized = pct != null && pct.compareTo(config.getUnderutilizedThresholdPct()) < 0;
            boolean overloaded    = pct != null && pct.compareTo(config.getOverloadedThresholdPct()) > 0;
            boolean hasOpenBlocker = openBlockers.stream()
                    .anyMatch(b -> b.employeeId().equals(member.getId()) && !b.acknowledged());

            return new MemberEodStatusDto(
                    member.getId(), member.getFullName(), member.getEmployeeCode(),
                    status, entry.map(EodEntry::getId).orElse(null), projectNamesFor(entry),
                    pct, underutilized, overloaded, hasOpenBlocker);
        }).sorted(TeamLeadService::compareByStatusPriority).toList();
    }

    @Transactional(readOnly = true)
    public List<TeamBlockerDto> getBlockers(LocalDate from, LocalDate to, String actingEmail) {
        AppUser lead = requireLead(actingEmail);
        return taskRepository.findBlockedByManagerId(lead.getId())
                .stream()
                .filter(t -> inRange(t.getEodEntry().getEntryDate(), from, to))
                .filter(t -> t.getAcknowledgedAt() == null)
                .map(TeamBlockerDto::from)
                .toList();
    }

    private boolean inRange(LocalDate d, LocalDate from, LocalDate to) {
        return !d.isBefore(from) && !d.isAfter(to);
    }

    @Transactional
    public TeamBlockerDto acknowledgeBlocker(Long taskId, String actingEmail) {
        AppUser lead = requireLead(actingEmail);
        EodTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));

        if (!task.getEodEntry().getEmployee().getManager().getId().equals(lead.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }

        task.setAcknowledgedAt(OffsetDateTime.now());
        task.setAcknowledgedBy(lead);
        return TeamBlockerDto.from(taskRepository.save(task));
    }

    public DashboardTrendDto getTrend(LocalDate endDate, int days, String actingEmail) {
        AppUser lead = requireLead(actingEmail);
        List<AppUser> members = activeMembers(lead.getId());
        List<EodTask> allBlocked = taskRepository.findBlockedByManagerId(lead.getId());

        List<TrendPointDto> avgUtil = new ArrayList<>();
        List<TrendPointDto> submitted = new ArrayList<>();
        List<TrendPointDto> pending = new ArrayList<>();
        List<TrendPointDto> blockers = new ArrayList<>();

        for (int i = days - 1; i >= 0; i--) {
            LocalDate date = endDate.minusDays(i);
            boolean holidayToday = holidayRepository.existsByHolidayDate(date);

            int submittedCount = 0, pendingCount = 0;
            BigDecimal utilSum = BigDecimal.ZERO;
            int utilCount = 0;

            for (AppUser member : members) {
                Optional<EodEntry> entry = entryRepository.findByEmployeeIdAndEntryDate(member.getId(), date);
                String status = resolveStatus(entry, holidayToday);
                if (status.equals("SUBMITTED")) submittedCount++;
                if (status.equals("PENDING_APPROVAL")) pendingCount++;

                BigDecimal pct = utilizationPct(member.getId(), date);
                if (pct != null) {
                    utilSum = utilSum.add(pct);
                    utilCount++;
                }
            }

            Double avg = utilCount > 0
                    ? utilSum.divide(BigDecimal.valueOf(utilCount), 2, RoundingMode.HALF_UP).doubleValue()
                    : null;
            long blockedCount = allBlocked.stream()
                    .filter(t -> t.getEodEntry().getEntryDate().equals(date))
                    .filter(t -> t.getAcknowledgedAt() == null)
                    .count();

            avgUtil.add(new TrendPointDto(date, avg));
            submitted.add(new TrendPointDto(date, (double) submittedCount));
            pending.add(new TrendPointDto(date, (double) pendingCount));
            blockers.add(new TrendPointDto(date, (double) blockedCount));
        }

        return new DashboardTrendDto(avgUtil, submitted, pending, blockers);
    }

    // ── helpers ──────────────────────────────────────────────────────────────────

    private List<AppUser> activeMembers(Long managerId) {
        return userRepository.findByManagerId(managerId).stream()
                .filter(u -> u.getStatus() == AppUser.Status.ACTIVE && u.getDeletedAt() == null)
                .toList();
    }

    private String resolveStatus(Optional<EodEntry> entryOpt, boolean holidayToday) {
        if (holidayToday) return "ON_LEAVE";
        if (entryOpt.isEmpty()) return "MISSING";

        EodEntry entry = entryOpt.get();
        if (isLeaveOnlyEntry(entry)) return "ON_LEAVE";

        return switch (entry.getStatus()) {
            case APPROVED -> "SUBMITTED";
            case SUBMITTED -> "PENDING_APPROVAL";
            case DRAFT, REJECTED, CHANGES_REQUESTED, MISSED -> "MISSING";
        };
    }

    // TODO(leave-workflow): once a real leave-request/approval feature exists, replace this
    // inference with a direct lookup against approved leave for (employeeId, date).
    private boolean isLeaveOnlyEntry(EodEntry entry) {
        List<EodTask> tasks = entry.getTasks();
        if (tasks.isEmpty()) return false;
        return tasks.stream().allMatch(t ->
                t.getTaskCategory() != null && LEAVE_HOLIDAY_CATEGORY.equals(t.getTaskCategory().getName()));
    }

    private List<String> projectNamesFor(Optional<EodEntry> entryOpt) {
        if (entryOpt.isEmpty()) return List.of();
        return entryOpt.get().getTasks().stream()
                .map(t -> t.getProject() != null ? t.getProject().getName() : null)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
    }

    private BigDecimal utilizationPct(Long employeeId, LocalDate date) {
        return snapshotRepository.findByEmployeeIdAndSnapshotDate(employeeId, date)
                .map(UtilSnapshot::getUtilizationPct)
                .orElse(null);
    }

    private static int compareByStatusPriority(MemberEodStatusDto a, MemberEodStatusDto b) {
        return Integer.compare(statusPriority(a.status()), statusPriority(b.status()));
    }

    // Default sort: Missing -> Pending Approval -> Submitted -> On Leave
    private static int statusPriority(String status) {
        return switch (status) {
            case "MISSING" -> 0;
            case "PENDING_APPROVAL" -> 1;
            case "SUBMITTED" -> 2;
            default -> 3;
        };
    }

    private AppUser requireLead(String email) {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (actor.getRole() != AppUser.Role.MANAGER && actor.getRole() != AppUser.Role.SUPERADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return actor;
    }

    private BusinessRuleConfig requireConfig() {
        return configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Business rule config row missing"));
    }

    private ThresholdsDto toThresholds(BusinessRuleConfig c) {
        return new ThresholdsDto(
                c.getUnderutilizedThresholdPct(), c.getOverloadedThresholdPct(),
                c.getAtRiskMissingPct(), c.getBlockerAgeAlertHours());
    }
}
