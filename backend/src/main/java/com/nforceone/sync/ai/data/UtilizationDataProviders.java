package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.utilization.UtilizationService;
import com.nforceone.sync.utilization.dto.UtilSnapshotDto;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

final class UtilizationDataProviders {

    private UtilizationDataProviders() {
    }

    @Component
    static class UtilizationMineProvider implements AssistantDataProvider {
        private final UtilizationService utilizationService;

        UtilizationMineProvider(UtilizationService utilizationService) {
            this.utilizationService = utilizationService;
        }

        @Override public String id() { return "utilization.mine"; }
        @Override public String title() { return "My utilization (last 14 days)"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("utilization"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.minusDays(14);
            // Always ctx.userId() — the caller's own id only, never a parameter derived from
            // anything else (UtilizationService itself performs no ownership check, so this
            // provider is the only thing standing between "my utilization" and "anyone's").
            List<UtilSnapshotDto> snapshots = utilizationService.getForEmployee(context.userId(), from, to);
            if (snapshots.isEmpty()) {
                return Optional.of("No utilization has been computed yet for the last 14 days.");
            }
            UtilSnapshotDto latest = snapshots.get(snapshots.size() - 1);
            String latestPct = latest.utilizationPct() == null ? "N/A (non-working day or no available hours)"
                    : latest.utilizationPct() + "%";
            return Optional.of("Most recent computed utilization (" + latest.snapshotDate() + "): " + latestPct + ".");
        }
    }
}
