package com.nforceone.sync.team;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.team.dto.DashboardStatsDto;
import com.nforceone.sync.team.dto.MemberStatusDto;
import com.nforceone.sync.utilization.UtilSnapshot;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class TeamService {

    private final AppUserRepository       userRepository;
    private final EodEntryRepository      entryRepository;
    private final EodTaskRepository       taskRepository;
    private final UtilSnapshotRepository  snapshotRepository;

    public TeamService(AppUserRepository userRepository,
                       EodEntryRepository entryRepository,
                       EodTaskRepository taskRepository,
                       UtilSnapshotRepository snapshotRepository) {
        this.userRepository    = userRepository;
        this.entryRepository   = entryRepository;
        this.taskRepository    = taskRepository;
        this.snapshotRepository = snapshotRepository;
    }

    public DashboardStatsDto getDashboardStats(Long managerId, String actingEmail) {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));

        if (actor.getRole() != AppUser.Role.SUPERADMIN && !actor.getId().equals(managerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }

        LocalDate today   = LocalDate.now();
        List<AppUser> members = userRepository.findByManagerId(managerId);

        int pendingCount  = entryRepository
                .findPendingByManagerId(managerId, EodEntry.Status.SUBMITTED).size();
        int blockersCount = taskRepository.findBlockedByManagerId(managerId).size();

        List<MemberStatusDto> memberStatuses = new ArrayList<>();
        int submittedToday = 0;

        for (AppUser member : members) {
            Optional<EodEntry> todayEntry =
                    entryRepository.findByEmployeeIdAndEntryDate(member.getId(), today);
            String status = "MISSING";
            if (todayEntry.isPresent()) {
                EodEntry.Status s = todayEntry.get().getStatus();
                status = s.name();
                if (s == EodEntry.Status.SUBMITTED || s == EodEntry.Status.APPROVED) {
                    submittedToday++;
                }
            }
            memberStatuses.add(new MemberStatusDto(
                    member.getId(), member.getFullName(), member.getEmployeeCode(), status));
        }

        List<UtilSnapshot> snaps = snapshotRepository.findByManagerIdAndDate(managerId, today);
        List<UtilSnapshot> withPct = snaps.stream()
                .filter(s -> s.getUtilizationPct() != null)
                .toList();
        BigDecimal utilAvg = null;
        if (!withPct.isEmpty()) {
            BigDecimal sum = withPct.stream()
                    .map(UtilSnapshot::getUtilizationPct)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            utilAvg = sum.divide(BigDecimal.valueOf(withPct.size()), 2, RoundingMode.HALF_UP);
        }

        return new DashboardStatsDto(
                pendingCount,
                utilAvg,
                blockersCount,
                submittedToday,
                members.size(),
                memberStatuses);
    }
}
