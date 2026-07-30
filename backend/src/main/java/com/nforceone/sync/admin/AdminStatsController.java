package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.AdminStatsDto;
import com.nforceone.sync.admin.dto.AuditLogDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('SUPERADMIN')")
public class AdminStatsController {

    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;

    public AdminStatsController(AppUserRepository userRepository,
                                AuditLogRepository auditLogRepository) {
        this.userRepository     = userRepository;
        this.auditLogRepository = auditLogRepository;
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
                .findTop10ByEntityTypeNotOrderByOccurredAtDesc("EOD_ENTRY")
                .stream()
                .map(AuditLogDto::from)
                .toList();

        long last24h = auditLogRepository.countByOccurredAtAfterAndEntityTypeNot(
                OffsetDateTime.now().minusHours(24), "EOD_ENTRY");

        AdminStatsDto dto = new AdminStatsDto(total, active, inactive, inactiveNames, byRole, recentEvents, last24h);
        // No browser caching: this endpoint also backs the User Management filter-chip
        // counts, which must reflect a deactivate/reactivate/delete immediately. A 5-minute
        // cache here (fine for the slower-changing Dashboard summary) would otherwise leave
        // those chips showing stale counts for up to 5 minutes after every action. The
        // underlying query is already a single GROUP BY (see above), so re-fetching is cheap.
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(dto);
    }
}
