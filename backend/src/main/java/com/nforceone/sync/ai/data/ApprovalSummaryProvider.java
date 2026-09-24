package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.approval.ApprovalService;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.dto.EodEntryDto;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The one deliberate exception to "one provider, one service method" (mirrors OneHR's
 * {@code approvals.summary}): a question like "how many things need my approval" is about the
 * total, and the per-turn provider cap means several narrower providers could never guarantee a
 * complete count. Still counts-only — never an entry's employee name or comment.
 */
@Component
final class ApprovalSummaryProvider implements AssistantDataProvider {

    private final ApprovalService approvalService;

    ApprovalSummaryProvider(ApprovalService approvalService) {
        this.approvalService = approvalService;
    }

    @Override public String id() { return "approvals.summary"; }
    @Override public String title() { return "Pending approvals"; }
    @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.MANAGER, AppUser.Role.PM, AppUser.Role.SUPERADMIN); }
    @Override public Set<String> modules() { return Set.of("approvals"); }

    @Override
    public Optional<String> fetch(AssistantRequestContext context) {
        // pmId/managerId=null — for SUPERADMIN this is deliberately the full backlog (no narrowing
        // to someone else's queue); for MANAGER/PM it is already self-scoped by the service itself.
        List<EodEntryDto> pending = approvalService.getPendingForActor(context.email(), null, null, null, null);
        if (pending.isEmpty()) {
            return Optional.empty();
        }
        long escalated = pending.stream().filter(e -> Boolean.TRUE.equals(e.escalated())).count();
        // MANAGER/PM have their own approvals page and personally act on this queue, so "pending
        // your approval" is literally true for them. SUPERADMIN has no approve/reject page at all
        // (see role.superadmin knowledge) — this is org-wide visibility, not a personal queue, so
        // it must not be worded as something the Super Admin themself approves.
        boolean personalQueue = context.role() != AppUser.Role.SUPERADMIN;
        StringBuilder text = new StringBuilder()
                .append(pending.size()).append(" EOD entr").append(pending.size() == 1 ? "y is" : "ies are")
                .append(personalQueue ? " pending your approval" : " pending approval organization-wide");
        if (escalated > 0) {
            text.append(" (").append(escalated).append(" escalated, overdue for a decision)");
        }
        if (!personalQueue) {
            text.append(" — visible to you as Super Admin; each is actioned by the employee's "
                    + "Team Lead or their project's PM, not by you directly");
        }
        return Optional.of(text.append('.').toString());
    }
}
