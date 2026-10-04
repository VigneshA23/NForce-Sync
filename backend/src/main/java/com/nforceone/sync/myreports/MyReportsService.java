package com.nforceone.sync.myreports;

import com.nforceone.sync.approval2.ApprovalPieceService;
import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.TeamLeadService;
import com.nforceone.sync.teamlead.dto.MemberEodStatusDto;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class MyReportsService {

    private final AppUserRepository userRepository;
    private final TeamLeadService teamLeadService;
    private final ReportingScopeService reportingScopeService;
    private final EodProjectApprovalRepository pieceRepository;
    private final ApprovalPieceService approvalPieceService;

    public MyReportsService(AppUserRepository userRepository,
                             TeamLeadService teamLeadService,
                             ReportingScopeService reportingScopeService,
                             EodProjectApprovalRepository pieceRepository,
                             ApprovalPieceService approvalPieceService) {
        this.userRepository = userRepository;
        this.teamLeadService = teamLeadService;
        this.reportingScopeService = reportingScopeService;
        this.pieceRepository = pieceRepository;
        this.approvalPieceService = approvalPieceService;
    }

    public TeamLeadSummaryDto getSummary(LocalDate from, LocalDate to, String actingEmail) {
        AppUser actor = requireManager(actingEmail);
        List<Long> scopeIds = reportingScopeService.reportingScopeUserIds(actor.getId());
        return teamLeadService.getSummaryForScope(from, to, scopeIds);
    }

    public List<MemberEodStatusDto> getMemberStatuses(LocalDate from, LocalDate to, String actingEmail) {
        AppUser actor = requireManager(actingEmail);
        List<Long> scopeIds = reportingScopeService.reportingScopeUserIds(actor.getId());
        return teamLeadService.getMemberStatusesForScope(from, to, scopeIds);
    }

    public List<ApprovalPieceDto> getPendingApprovals(String actingEmail) {
        AppUser actor = requireManager(actingEmail);
        return pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                actor.getId(),
                EodProjectApproval.ApproverType.REPORTING_MANAGER,
                EodProjectApproval.Status.PENDING
        ).stream().map(ApprovalPieceDto::from).toList();
    }

    @org.springframework.transaction.annotation.Transactional
    public ApprovalPieceDto approve(Long pieceId, String actingEmail, String comment) {
        requireManager(actingEmail);
        return approvalPieceService.approve(pieceId, actingEmail, comment);
    }

    @org.springframework.transaction.annotation.Transactional
    public ApprovalPieceDto reject(Long pieceId, String actingEmail, String comment) {
        requireManager(actingEmail);
        return approvalPieceService.reject(pieceId, actingEmail, comment);
    }

    private AppUser requireManager(String email) {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (!userRepository.existsByManagerIdAndDeletedAtIsNull(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied: no direct reports assigned to this account");
        }
        return actor;
    }
}
