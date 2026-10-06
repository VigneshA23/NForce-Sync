package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.AdminStatsDto;
import com.nforceone.sync.admin.dto.AuditLogDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.org.Department;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocation;
import com.nforceone.sync.org.OrgLocationRepository;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Backs the Admin Dashboard — user headcounts/status and recent account-admin activity.
// This is user-administration data, so it belongs to Admin, not Super Admin.
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminStatsController {

    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final DepartmentRepository departmentRepository;
    private final DesignationRepository designationRepository;
    private final OrgLocationRepository locationRepository;
    private final EodEntryRepository eodEntryRepository;

    public AdminStatsController(AppUserRepository userRepository,
                                AuditLogRepository auditLogRepository,
                                DepartmentRepository departmentRepository,
                                DesignationRepository designationRepository,
                                OrgLocationRepository locationRepository,
                                EodEntryRepository eodEntryRepository) {
        this.userRepository       = userRepository;
        this.auditLogRepository   = auditLogRepository;
        this.departmentRepository = departmentRepository;
        this.designationRepository = designationRepository;
        this.locationRepository   = locationRepository;
        this.eodEntryRepository   = eodEntryRepository;
    }

    @GetMapping("/stats")
    public ResponseEntity<AdminStatsDto> getStats() {
        // Single GROUP BY query replaces 11 individual count round-trips (was ~3.7s on Neon)
        List<Object[]> grouped = userRepository.countGroupedByRoleAndStatus();

        long total = 0, active = 0, inactive = 0;
        Map<String, Long> byRole = new LinkedHashMap<>();

        for (Object[] row : grouped) {
            AppUser.Role   role   = (AppUser.Role)   row[0];
            AppUser.Status status = (AppUser.Status) row[1];
            long           cnt    = (Long)           row[2];

            total += cnt;
            if (status == AppUser.Status.ACTIVE)   active   += cnt;
            if (status == AppUser.Status.INACTIVE) inactive += cnt;
            byRole.merge(role.name(), cnt, Long::sum);
        }
        for (AppUser.Role role : AppUser.Role.values()) {
            byRole.putIfAbsent(role.name(), 0L);
        }

        List<String> inactiveNames = userRepository.findInactiveUserNames();

        // Admin/config-level events only — routine EOD approvals are high-volume and
        // are excluded from this summary widget (see AuditLogRepository for rationale).
        List<AuditLogDto> recentEvents = auditLogRepository
                .findTop20ByEntityTypeNotOrderByOccurredAtDesc("EOD_ENTRY")
                .stream()
                .map(AuditLogDto::from)
                .toList();

        long last24h = auditLogRepository.countByOccurredAtAfterAndEntityTypeNot(
                OffsetDateTime.now().minusHours(24), "EOD_ENTRY");

        Map<String, Long> byDepartment = resolveNamedCounts(
                userRepository.countActiveGroupedByDepartment(),
                departmentRepository.findAllByOrderByNameAsc().stream()
                        .collect(java.util.stream.Collectors.toMap(Department::getId, Department::getName)));
        Map<String, Long> byLocation = resolveNamedCounts(
                userRepository.countActiveGroupedByLocation(),
                locationRepository.findAllByOrderByNameAsc().stream()
                        .collect(java.util.stream.Collectors.toMap(OrgLocation::getId, OrgLocation::getName)));

        long departmentCount = departmentRepository.count();
        long designationCount = designationRepository.count();
        long locationCount = locationRepository.count();

        OffsetDateTime since7d = OffsetDateTime.now().minusDays(7);
        long newUsersLast7Days = userRepository.countByCreatedAtAfterAndDeletedAtIsNull(since7d);
        List<String> newUserNames = userRepository.findRecentlyJoinedUserNames(since7d);

        LocalDate today = LocalDate.now();
        long eodSubmittedToday = eodEntryRepository.countDistinctSubmittedEmployeesOnDate(today);

        AdminStatsDto dto = new AdminStatsDto(
                total, active, inactive, inactiveNames, byRole, recentEvents, last24h,
                byDepartment, byLocation,
                departmentCount, designationCount, locationCount,
                newUsersLast7Days, newUserNames,
                eodSubmittedToday, active);
        // No browser caching: this endpoint also backs the User Management filter-chip
        // counts, which must reflect a deactivate/reactivate/delete immediately. A 5-minute
        // cache here (fine for the slower-changing Dashboard summary) would otherwise leave
        // those chips showing stale counts for up to 5 minutes after every action. The
        // underlying query is already a single GROUP BY (see above), so re-fetching is cheap.
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(dto);
    }

    // Resolves a GROUP BY departmentId/locationId projection (row[0] may be null for a user
    // with none assigned) into a name-keyed map for direct chart rendering on the frontend —
    // bucketed under "Unassigned" rather than dropped, so headcount totals still add up to
    // activeUsers.
    private Map<String, Long> resolveNamedCounts(List<Object[]> grouped, Map<Long, String> namesById) {
        Map<String, Long> result = new LinkedHashMap<>();
        for (Object[] row : grouped) {
            Long id = (Long) row[0];
            long cnt = (Long) row[1];
            String name = id != null ? namesById.getOrDefault(id, "Unassigned") : "Unassigned";
            result.merge(name, cnt, Long::sum);
        }
        return result;
    }
}
