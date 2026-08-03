package com.nforceone.sync.utilization;

import com.nforceone.sync.approval.ApprovalAction;
import com.nforceone.sync.approval.ApprovalActionRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.utilization.dto.TeamUtilDto;
import com.nforceone.sync.utilization.dto.UtilSnapshotDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class UtilizationService {

    private final EodEntryRepository      entryRepository;
    private final ApprovalActionRepository actionRepository;
    private final AppUserRepository        userRepository;
    private final UtilSnapshotRepository   snapshotRepository;

    public UtilizationService(EodEntryRepository entryRepository,
                               ApprovalActionRepository actionRepository,
                               AppUserRepository userRepository,
                               UtilSnapshotRepository snapshotRepository) {
        this.entryRepository   = entryRepository;
        this.actionRepository  = actionRepository;
        this.userRepository    = userRepository;
        this.snapshotRepository = snapshotRepository;
    }

    public UtilSnapshot computeSnapshot(Long employeeId, LocalDate date) {
        BigDecimal available = UtilizationCalculator.computeAvailableHours(date);

        BigDecimal approvedProductive = BigDecimal.ZERO;
        BigDecimal billable           = BigDecimal.ZERO;
        BigDecimal nonBillable        = BigDecimal.ZERO;
        BigDecimal bench              = BigDecimal.ZERO;

        Optional<EodEntry> approvedOpt = entryRepository
                .findByEmployeeIdAndEntryDate(employeeId, date)
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

        UtilSnapshot snap = snapshotRepository
                .findByEmployeeIdAndSnapshotDate(employeeId, date)
                .orElse(new UtilSnapshot());

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

        return snapshotRepository.save(snap);
    }

    public void recomputeForEntry(Long eodEntryId) {
        EodEntry entry = entryRepository.findById(eodEntryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "EOD entry not found"));
        computeSnapshot(entry.getEmployee().getId(), entry.getEntryDate());
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
        List<AppUser> reports = userRepository.findByManagerId(managerId);
        if (reports.isEmpty()) return List.of();

        // Fetch all snapshots for all team members in one query
        List<Long> ids = reports.stream().map(AppUser::getId).toList();
        Map<Long, UtilSnapshot> snapByEmployee = snapshotRepository
                .findByEmployeeIdInAndSnapshotDate(ids, date)
                .stream()
                .collect(Collectors.toMap(UtilSnapshot::getEmployeeId, s -> s));

        return reports.stream().map(emp -> {
            UtilSnapshot snap = snapByEmployee.get(emp.getId());
            return new TeamUtilDto(
                    emp.getId(),
                    emp.getFullName(),
                    emp.getEmployeeCode(),
                    snap != null ? UtilSnapshotDto.from(snap) : null
            );
        }).toList();
    }
}
