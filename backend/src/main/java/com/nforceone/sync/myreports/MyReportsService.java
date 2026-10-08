package com.nforceone.sync.myreports;

import com.nforceone.sync.approval2.ApprovalPieceService;
import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodService;
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
    private final EodService eodService;

    public MyReportsService(AppUserRepository userRepository,
                             TeamLeadService teamLeadService,
                             ReportingScopeService reportingScopeService,
                             EodProjectApprovalRepository pieceRepository,
                             ApprovalPieceService approvalPieceService,
                             EodService eodService) {
        this.eodService = eodService;
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

    /**
     * A reportee's EOD for one date. Authorised by the SAME resolver the member-statuses list uses
     * ({@code reportingScopeUserIds}), deliberately not EodAccessPolicy's narrower project-lead
     * rule — otherwise a row visible in the list could 403 when clicked.
     *
     * <p>Contents are only returned for submitted entries; the list counts DRAFT / REJECTED / MISSED
     * as Missing, so those never leak their contents here.
     */
    public MemberEodDetailDto getMemberEod(Long employeeId, LocalDate date, String actingEmail) {
        AppUser actor = requireManager(actingEmail);
        if (date.isAfter(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date must not be in the future");
        }
        if (!reportingScopeService.reportingScopeUserIds(actor.getId()).contains(employeeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied: this employee is not in your reporting team");
        }
        AppUser employee = userRepository.findById(employeeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));

        TeamLeadService.MemberEodLookup lookup = teamLeadService.lookupMemberEod(employeeId, date);
        EodEntry entry = lookup.entry();
        boolean hasInProgressEntry = entry != null
                && (entry.getStatus() == EodEntry.Status.DRAFT || entry.getStatus() == EodEntry.Status.REJECTED);
        boolean showable = entry != null
                && (entry.getStatus() == EodEntry.Status.SUBMITTED
                    || entry.getStatus() == EodEntry.Status.PARTIALLY_APPROVED
                    || entry.getStatus() == EodEntry.Status.APPROVED);

        String emptyState = null;
        if (!showable) {
            if ("ON_LEAVE".equals(lookup.status())) {
                emptyState = "ON_LEAVE";
            } else if (hasInProgressEntry || date.equals(LocalDate.now())) {
                emptyState = "NOT_SUBMITTED";
            } else {
                emptyState = "MISSING";
            }
        }
        return new MemberEodDetailDto(
                employee.getId(), employee.getFullName(), employee.getEmployeeCode(), employee.getEmail(),
                date, lookup.status(), emptyState,
                showable ? eodService.toDetailDto(entry) : null);
    }

    public List<ApprovalPieceDto> getPendingApprovals(String actingEmail) {
        AppUser actor = requireManager(actingEmail);
        return pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                actor.getId(),
                EodProjectApproval.ApproverType.REPORTING_MANAGER,
                EodProjectApproval.Status.PENDING
        ).stream().map(ApprovalPieceDto::from).toList();
    }

    public List<ApprovalPieceDto> getDecidedApprovals(String actingEmail, String statusName) {
        requireManager(actingEmail);
        return approvalPieceService.getDecidedReportingManagerPieces(actingEmail, statusName);
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
