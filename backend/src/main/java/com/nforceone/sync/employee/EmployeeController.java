package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.BlockerConversationService;
import com.nforceone.sync.eod.BlockerReplyAttachment;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.employee.dto.DashboardSummaryDto;
import com.nforceone.sync.employee.dto.UtilizationDetailDto;
import com.nforceone.sync.project.dto.ProjectDetailDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/employee")
public class EmployeeController {

    private final AppUserRepository userRepository;
    private final EmployeeService   employeeService;
    private final BlockerConversationService conversationService;
    private final EmployeeProjectService employeeProjectService;

    public EmployeeController(AppUserRepository userRepository, EmployeeService employeeService,
                               BlockerConversationService conversationService,
                               EmployeeProjectService employeeProjectService) {
        this.userRepository  = userRepository;
        this.employeeService = employeeService;
        this.conversationService = conversationService;
        this.employeeProjectService = employeeProjectService;
    }

    /** The signed-in Employee's own allocated projects — see {@link EmployeeProjectService}. */
    @GetMapping("/projects")
    public List<ProjectFullDto> myProjects(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return employeeProjectService.listMyProjects(actingEmail(), date != null ? date : LocalDate.now());
    }

    /** Details for one of the signed-in Employee's own assigned projects. */
    @GetMapping("/projects/{id}")
    public ProjectDetailDto myProjectDetail(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return employeeProjectService.getProjectDetail(actingEmail(), id, date != null ? date : LocalDate.now());
    }

    @GetMapping("/dashboard-summary")
    public DashboardSummaryDto dashboardSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate calendarFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate calendarTo) {
        AppUser user = currentUser();
        LocalDate today = LocalDate.now();
        LocalDate from  = calendarFrom != null ? calendarFrom : today.withDayOfMonth(1);
        LocalDate to    = calendarTo   != null ? calendarTo   : today.withDayOfMonth(1).plusMonths(1).minusDays(1);
        return employeeService.getDashboardSummary(user.getId(), from, to);
    }

    @GetMapping("/utilization-detail")
    public UtilizationDetailDto utilizationDetail(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
        AppUser user = currentUser();
        return employeeService.getUtilizationDetail(user.getId(), from, to);
    }

    // Full blocker history for the dedicated "My Blockers" page — unlike the dashboard's
    // fixed 14-day window (see EmployeeService.buildBlockedTasks), this takes an arbitrary
    // caller-supplied range, mirroring TeamLeadController.getBlockers.
    @GetMapping("/blockers")
    public List<DashboardSummaryDto.BlockedTask> getBlockers(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
        AppUser user = currentUser();
        return employeeService.getBlockers(user.getId(), from, to);
    }

    // A BLOCKER_REPLY notification can point at a blocker older than any range the "My
    // Blockers" page would have fetched. This fetches that one blocker directly,
    // regardless of age, so the notification's deep link always resolves.
    @GetMapping("/blockers/{taskId}")
    public DashboardSummaryDto.BlockedTask getBlocker(@PathVariable Long taskId) {
        AppUser user = currentUser();
        return employeeService.getBlockedTask(taskId, user.getId());
    }

    @GetMapping("/blockers/{taskId}/replies")
    public List<BlockerReplyDto> getBlockerReplies(@PathVariable Long taskId) {
        return conversationService.getThreadForEmployee(taskId, actingEmail());
    }

    @PostMapping(value = "/blockers/{taskId}/replies", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BlockerReplyDto postBlockerReply(
            @PathVariable Long taskId,
            @RequestParam String message,
            @RequestParam(required = false) List<MultipartFile> files) {
        return conversationService.postReplyAsEmployee(taskId, actingEmail(), message, files);
    }

    @GetMapping("/blockers/attachments/{attachmentId}")
    public ResponseEntity<byte[]> downloadBlockerAttachment(@PathVariable Long attachmentId) {
        BlockerReplyAttachment attachment = conversationService.getAttachmentForEmployee(attachmentId, actingEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getFileName() + "\"")
                .body(attachment.getData());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    private AppUser currentUser() {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
