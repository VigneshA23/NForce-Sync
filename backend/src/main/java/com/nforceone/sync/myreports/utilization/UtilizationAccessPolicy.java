package com.nforceone.sync.myreports.utilization;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.reporting.ReportingScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Who may see whom on the Team Utilization page — same shape as {@code EodAccessPolicy}.
 *
 * <p>The scope is {@link ReportingScopeService#reportingScopeUserIds}: the very resolver the My
 * Reports member list and EOD Status page use, so a row visible on one page can never 403 on another.
 * The entry gate mirrors {@code MyReportsService}: the caller must have at least one direct report.
 */
@Component
class UtilizationAccessPolicy {

    private final AppUserRepository userRepository;
    private final ReportingScopeService reportingScope;

    UtilizationAccessPolicy(AppUserRepository userRepository, ReportingScopeService reportingScope) {
        this.userRepository = userRepository;
        this.reportingScope = reportingScope;
    }

    AppUser requireManager(String actingEmail) {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (!userRepository.existsByManagerIdAndDeletedAtIsNull(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied: no direct reports assigned to this account");
        }
        return actor;
    }

    /** Every employee the actor may see utilization for. */
    List<Long> scopeMemberIds(AppUser actor) {
        return reportingScope.reportingScopeUserIds(actor.getId());
    }

    /** 403 unless {@code employeeId} is in the actor's reporting scope. */
    void requireInScope(AppUser actor, Long employeeId) {
        if (employeeId == null || !scopeMemberIds(actor).contains(employeeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied: this employee is not in your reporting team");
        }
    }
}
