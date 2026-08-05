package com.nforceone.sync.utilization;

import com.nforceone.sync.approval.ApprovalAction;
import com.nforceone.sync.approval.ApprovalActionRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.utilization.dto.DayUtilDto;
import com.nforceone.sync.utilization.dto.TeamUtilDto;
import com.nforceone.sync.utilization.dto.UtilSnapshotDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class UtilizationService {

    private final EodEntryRepository      entryRepository;
    private final ApprovalActionRepository actionRepository;
    private final AppUserRepository        userRepository;
    private final UtilSnapshotRepository   snapshotRepository;
    private final HolidayRepository        holidayRepository;

    public UtilizationService(EodEntryRepository entryRepository,
                               ApprovalActionRepository actionRepository,
                               AppUserRepository userRepository,
                               UtilSnapshotRepository snapshotRepository,
                               HolidayRepository holidayRepository) {
        this.entryRepository   = entryRepository;
        this.actionRepository  = actionRepository;
        this.userRepository    = userRepository;
        this.snapshotRepository = snapshotRepository;
        this.holidayRepository = holidayRepository;
    }

    // Computes utilization for employee/date without touching the persisted snapshot row.
    // Used both as the basis for the persisted snapshot (computeSnapshot) and for
    // on-demand team reads where no approval has happened yet (getForTeam).
    private UtilSnapshot buildSnapshot(Long employeeId, LocalDate date) {
        Optional<EodEntry> entryOpt = entryRepository.findByEmployeeIdAndEntryDate(employeeId, date);

        boolean isHoliday = holidayRepository.existsByHolidayDate(date);
        boolean isApprovedLeave = entryOpt
                .filter(e -> e.getDayType() == EodEntry.DayType.LEAVE && e.getStatus() == EodEntry.Status.APPROVED)
                .isPresent();

        BigDecimal available = UtilizationCalculator.computeAvailableHours(date, isHoliday, isApprovedLeave);

        BigDecimal approvedProductive = BigDecimal.ZERO;
        BigDecimal billable           = BigDecimal.ZERO;
        BigDecimal nonBillable        = BigDecimal.ZERO;
        BigDecimal bench              = BigDecimal.ZERO;

        Optional<EodEntry> approvedOpt = entryOpt
                .filter(e -> e.getStatus() == EodEntry.Status.APPROVED);

        if (approvedOpt.isPresent()) {
            EodEntry entry = approvedOpt.get();

            // Check for billable_override on the latest APPROVE action.
            // If set, it overrides the per-task is_billable for billing categorization.
            Boolean billableOverride = actionRepository
                    .findByEodEntryIdOrderByActedAtDesc(entry.getId())
                    .stream()
                    .filter(a -> a.getAction() == ApprovalAction.Action.APPROVE)
                    .findFirst()
                    .map(ApprovalAction::getBillableOverride)
                    .orElse(null);

            for (EodTask task : entry.getTasks()) {
                if (task.getHours() == null) continue;
                BigDecimal h = task.getHours();

                boolean productive = task.getTaskCategory() != null
                        && Boolean.TRUE.equals(task.getTaskCategory().getIsProductive());
                boolean isBillable = billableOverride != null
                        ? billableOverride
                        : Boolean.TRUE.equals(task.getIsBillable());

                if (productive) {
                    approvedProductive = approvedProductive.add(h);
                    if (isBillable) billable    = billable.add(h);
                    else            nonBillable = nonBillable.add(h);
                } else {
                    bench = bench.add(h);
                }
            }
        }

        BigDecimal totalLogged = approvedProductive.add(bench);
        BigDecimal idle = available.subtract(totalLogged);
        if (idle.compareTo(BigDecimal.ZERO) < 0) idle = BigDecimal.ZERO;

        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(approvedProductive, available);

        UtilSnapshot snap = new UtilSnapshot();
        snap.setEmployeeId(employeeId);
        snap.setSnapshotDate(date);
        snap.setAvailableHours(available);
        snap.setApprovedProductiveHours(approvedProductive);
        snap.setBillableHours(billable);
        snap.setNonBillableHours(nonBillable);
        snap.setBenchHours(bench);
        snap.setIdleHours(idle);
        snap.setUtilizationPct(pct);
        snap.setComputedAt(OffsetDateTime.now());
        return snap;
    }

    public UtilSnapshot computeSnapshot(Long employeeId, LocalDate date) {
        UtilSnapshot computed = buildSnapshot(employeeId, date);

        UtilSnapshot snap = snapshotRepository
                .findByEmployeeIdAndSnapshotDate(employeeId, date)
                .orElse(new UtilSnapshot());

        snap.setEmployeeId(employeeId);
        snap.setSnapshotDate(date);
        snap.setAvailableHours(computed.getAvailableHours());
        snap.setApprovedProductiveHours(computed.getApprovedProductiveHours());
        snap.setBillableHours(computed.getBillableHours());
        snap.setNonBillableHours(computed.getNonBillableHours());
        snap.setBenchHours(computed.getBenchHours());
        snap.setIdleHours(computed.getIdleHours());
        snap.setUtilizationPct(computed.getUtilizationPct());
        snap.setComputedAt(computed.getComputedAt());

        return snapshotRepository.save(snap);
    }

    public void recomputeForEntry(Long eodEntryId) {
        EodEntry entry = entryRepository.findById(eodEntryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "EOD entry not found"));
        computeSnapshot(entry.getEmployee().getId(), entry.getEntryDate());
    }

    // Single source of truth for "is this a day utilization is even meaningful for" — the
    // same weekend + company-holiday rule computeAvailableHours already applies when zeroing
    // out available hours. Exposed so callers can gate on it BEFORE trusting a value, rather
    // than each duplicating the weekend/holiday check (or silently trusting a persisted
    // snapshot that predates this rule / was seeded directly and never passed through it).
    @Transactional(readOnly = true)
    public boolean isWorkingDay(LocalDate date) {
        if (isWeekend(date)) return false;
        return !holidayRepository.existsByHolidayDate(date);
    }

    // Factored out of isWorkingDay so getTrendForEmployee's batched loop (which checks
    // membership in an already-fetched holiday Set instead of querying per day) applies the
    // exact same weekend rule rather than a second, independently-typed copy of it.
    private static boolean isWeekend(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }

    // Persisted snapshots only exist once an EOD has been approved for that employee/date
    // (recomputeForEntry runs on approval). Callers averaging utilization across a whole
    // team must not treat "no approval yet" as "exclude this member" — that silently shrinks
    // the denominator to just the approved subset and inflates the average. Falls back to
    // the same on-demand computation getForTeam uses, so a member with no EOD/not yet
    // approved resolves to a real 0% (or null on a weekend/holiday/approved leave day).
    //
    // Non-working days always resolve to null regardless of what's persisted — a stray
    // snapshot row with a non-null pct on a weekend/holiday (e.g. seeded directly, or written
    // before this rule existed) must never surface as a real computed percentage.
    @Transactional(readOnly = true)
    public BigDecimal resolveUtilizationPct(Long employeeId, LocalDate date) {
        if (!isWorkingDay(date)) return null;
        return snapshotRepository.findByEmployeeIdAndSnapshotDate(employeeId, date)
                .map(UtilSnapshot::getUtilizationPct)
                .orElseGet(() -> buildSnapshot(employeeId, date).getUtilizationPct());
    }

    /**
     * Batched equivalent of calling resolveUtilizationPct() once per day in [from, to] — used
     * by the Team Utilization detail panel's trend/working-days/logged-days, which previously
     * called resolveUtilizationPct + findByEmployeeIdAndEntryDate + isWorkingDay per day (each
     * doing its own DB round trip, several of them duplicated), turning a 14-day window into
     * 50-100+ sequential queries — the actual cause of the multi-second lag switching between
     * employees. This does exactly 3 queries total regardless of window length: snapshots,
     * entries (with tasks eager-fetched), and holidays, then resolves each day in memory.
     */
    @Transactional(readOnly = true)
    public List<DayUtilDto> getTrendForEmployee(Long employeeId, LocalDate from, LocalDate to) {
        Map<LocalDate, UtilSnapshot> snapByDate = snapshotRepository
                .findByEmployeeIdAndSnapshotDateBetweenOrderBySnapshotDateAsc(employeeId, from, to)
                .stream()
                .collect(Collectors.toMap(UtilSnapshot::getSnapshotDate, s -> s, (a, b) -> a));

        Map<LocalDate, EodEntry> entryByDate = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(employeeId, from, to)
                .stream()
                .collect(Collectors.toMap(EodEntry::getEntryDate, e -> e, (a, b) -> a));

        Set<LocalDate> holidays = holidayRepository.findAllByOrderByHolidayDateAsc()
                .stream()
                .map(Holiday::getHolidayDate)
                .collect(Collectors.toSet());

        List<DayUtilDto> out = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            boolean isHoliday = holidays.contains(d);
            boolean workingDay = !isWeekend(d) && !isHoliday;
            EodEntry entry = entryByDate.get(d);
            boolean hasApprovedEntry = entry != null && entry.getStatus() == EodEntry.Status.APPROVED;

            BigDecimal pct;
            if (!workingDay) {
                // Never trust a persisted value on a non-working day — same rule resolveUtilizationPct enforces.
                pct = null;
            } else {
                UtilSnapshot snap = snapByDate.get(d);
                pct = snap != null ? snap.getUtilizationPct() : computeUtilizationPctInMemory(entry, d, isHoliday);
            }
            out.add(new DayUtilDto(d, workingDay, pct, hasApprovedEntry));
        }
        return out;
    }

    // Mirrors buildSnapshot's productive-hours/utilization math, but reads from an already-
    // fetched entry instead of querying — the in-memory counterpart used by getTrendForEmployee
    // for days with no persisted snapshot. Deliberately skips the billable-override lookup:
    // that only reclassifies billable vs non-billable hours, it never changes whether hours
    // count toward approvedProductiveHours, so it can't affect the utilization percentage.
    private BigDecimal computeUtilizationPctInMemory(EodEntry entry, LocalDate date, boolean isHoliday) {
        boolean isApprovedLeave = entry != null
                && entry.getDayType() == EodEntry.DayType.LEAVE
                && entry.getStatus() == EodEntry.Status.APPROVED;
        BigDecimal available = UtilizationCalculator.computeAvailableHours(date, isHoliday, isApprovedLeave);

        BigDecimal approvedProductive = BigDecimal.ZERO;
        if (entry != null && entry.getStatus() == EodEntry.Status.APPROVED) {
            for (EodTask task : entry.getTasks()) {
                if (task.getHours() == null) continue;
                boolean productive = task.getTaskCategory() != null
                        && Boolean.TRUE.equals(task.getTaskCategory().getIsProductive());
                if (productive) approvedProductive = approvedProductive.add(task.getHours());
            }
        }
        return UtilizationCalculator.computeUtilizationPct(approvedProductive, available);
    }

    @Transactional(readOnly = true)
    public List<UtilSnapshotDto> getForEmployee(Long employeeId, LocalDate from, LocalDate to) {
        return snapshotRepository
                .findByEmployeeIdAndSnapshotDateBetweenOrderBySnapshotDateAsc(employeeId, from, to)
                .stream()
                .map(UtilSnapshotDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TeamUtilDto> getForTeam(Long managerId, LocalDate date) {
        // Matches the active-member definition used everywhere else on the Team Dashboard
        // (TeamLeadService.activeMembers) — without this filter, terminated/deleted direct
        // reports would still show up here even though they're excluded from the dashboard's
        // KPI card, 7-day trend, and Utilization Overview donut.
        List<AppUser> reports = userRepository.findByManagerId(managerId).stream()
                .filter(u -> u.getStatus() == AppUser.Status.ACTIVE && u.getDeletedAt() == null)
                .toList();
        if (reports.isEmpty()) return List.of();

        // Fetch all snapshots for all team members in one query
        List<Long> ids = reports.stream().map(AppUser::getId).toList();
        Map<Long, UtilSnapshot> snapByEmployee = snapshotRepository
                .findByEmployeeIdInAndSnapshotDate(ids, date)
                .stream()
                .collect(Collectors.toMap(UtilSnapshot::getEmployeeId, s -> s));

        return reports.stream().map(emp -> {
            UtilSnapshot snap = snapByEmployee.get(emp.getId());
            UtilSnapshot resolved = snap != null ? snap : buildSnapshot(emp.getId(), date);
            return new TeamUtilDto(
                    emp.getId(),
                    emp.getFullName(),
                    emp.getEmployeeCode(),
                    UtilSnapshotDto.from(resolved)
            );
        }).toList();
    }
}
