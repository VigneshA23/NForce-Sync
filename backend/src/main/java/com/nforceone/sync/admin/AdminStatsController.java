package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.AdminStatsDto;
import com.nforceone.sync.admin.dto.AuditLogDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
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
    public AdminStatsDto getStats() {
        long total    = userRepository.count();
        long active   = userRepository.countByStatus(AppUser.Status.ACTIVE);
        long inactive = userRepository.countByStatus(AppUser.Status.INACTIVE);

        Map<String, Long> byRole = new LinkedHashMap<>();
        for (AppUser.Role role : AppUser.Role.values()) {
            byRole.put(role.name(), userRepository.countByRole(role));
        }

        List<AuditLogDto> recentEvents = auditLogRepository.findTop5ByOrderByOccurredAtDesc()
                .stream()
                .map(AuditLogDto::from)
                .toList();

        long last24h = auditLogRepository.countByOccurredAtAfter(
                OffsetDateTime.now().minusHours(24));

        return new AdminStatsDto(total, active, inactive, byRole, recentEvents, last24h);
    }
}
