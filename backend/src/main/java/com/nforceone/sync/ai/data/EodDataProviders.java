package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodClarificationService;
import com.nforceone.sync.eod.EodService;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.EodInboxItemDto;
import com.nforceone.sync.eod.dto.TimeAdjustmentContextDto;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * EOD-related live-data providers. Every {@code fetch} calls exactly one existing Sync service
 * method with only the caller's own email/id from {@code context} — never a parameter that could
 * name someone else (see {@code DataProviderSafetyTest}).
 */
final class EodDataProviders {

    private EodDataProviders() {
    }

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    @Component
    static class EodTodayProvider implements AssistantDataProvider {
        private final EodService eodService;

        EodTodayProvider(EodService eodService) {
            this.eodService = eodService;
        }

        @Override public String id() { return "eod.today"; }
        @Override public String title() { return "Today's EOD status"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("eod"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate today = LocalDate.now();
            List<EodEntryDto> entries = eodService.listEntries(null, today, today, false, context.email());
            if (entries.isEmpty()) {
                return Optional.of("No EOD entry has been logged for today (" + today.format(DATE) + ") yet.");
            }
            EodEntryDto entry = entries.get(0);
            return Optional.of("Today's (" + today.format(DATE) + ") EOD entry status: " + entry.status() + ".");
        }
    }

    @Component
    static class EodRecentProvider implements AssistantDataProvider {
        private final EodService eodService;

        EodRecentProvider(EodService eodService) {
            this.eodService = eodService;
        }

        @Override public String id() { return "eod.recent"; }
        @Override public String title() { return "Recent EOD activity (last 14 days)"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("eod"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.minusDays(14);
            List<EodEntryDto> entries = eodService.listEntries(null, from, to, true, context.email());
            if (entries.isEmpty()) {
                return Optional.empty();
            }
            var byStatus = entries.stream().collect(Collectors.groupingBy(EodEntryDto::status, Collectors.counting()));
            String counts = byStatus.entrySet().stream()
                    .map(e -> e.getValue() + " " + e.getKey())
                    .collect(Collectors.joining(", "));
            return Optional.of("In the last 14 days (" + from.format(DATE) + " to " + to.format(DATE) + "): " + counts + ".");
        }
    }

    @Component
    static class EodTimeAdjustmentProvider implements AssistantDataProvider {
        private final EodService eodService;

        EodTimeAdjustmentProvider(EodService eodService) {
            this.eodService = eodService;
        }

        @Override public String id() { return "eod.time-adjustment"; }
        @Override public String title() { return "Time adjustment budget"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("eod"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            TimeAdjustmentContextDto ctx = eodService.getTimeAdjustmentContext(LocalDate.now(), context.email());
            if (!ctx.shiftAssigned()) {
                return Optional.of("No shift is assigned, so time adjustments are not available.");
            }
            long remaining = Math.max(0, ctx.monthlyAdjustmentMinutes() - ctx.adjustmentMinutesUsed());
            return Optional.of("Shift: " + ctx.shiftName() + ". Monthly time-adjustment budget: "
                    + ctx.adjustmentMinutesUsed() + " of " + ctx.monthlyAdjustmentMinutes()
                    + " minutes used this month (" + remaining + " remaining).");
        }
    }

    @Component
    static class ClarificationMineProvider implements AssistantDataProvider {
        private final EodClarificationService clarificationService;

        ClarificationMineProvider(EodClarificationService clarificationService) {
            this.clarificationService = clarificationService;
        }

        @Override public String id() { return "clarification.mine"; }
        @Override public String title() { return "My open EOD clarifications"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("eod"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            List<EodInboxItemDto> open = clarificationService.listForEmployee(context.email(), true);
            if (open.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(open.size() + " open EOD clarification(s) waiting on a reply, for entry date(s): "
                    + open.stream().limit(5).map(i -> i.entryDate().format(DATE)).collect(Collectors.joining(", ")) + ".");
        }
    }

    @Component
    static class ClarificationLeadProvider implements AssistantDataProvider {
        private final EodClarificationService clarificationService;

        ClarificationLeadProvider(EodClarificationService clarificationService) {
            this.clarificationService = clarificationService;
        }

        @Override public String id() { return "clarification.lead"; }
        @Override public String title() { return "Open EOD clarifications on my team"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("eod", "approvals"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            List<EodInboxItemDto> open = clarificationService.listForLead(context.email(), true);
            if (open.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(open.size() + " open EOD clarification(s) on your team, awaiting a reply.");
        }
    }

    @Component
    static class ClarificationPmProvider implements AssistantDataProvider {
        private final EodClarificationService clarificationService;

        ClarificationPmProvider(EodClarificationService clarificationService) {
            this.clarificationService = clarificationService;
        }

        @Override public String id() { return "clarification.pm"; }
        @Override public String title() { return "Open EOD clarifications on my projects"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.PM); }
        @Override public Set<String> modules() { return Set.of("eod", "approvals"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            List<EodInboxItemDto> open = clarificationService.listForPm(context.email(), true);
            if (open.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(open.size() + " open EOD clarification(s) on your projects, awaiting a reply.");
        }
    }
}
