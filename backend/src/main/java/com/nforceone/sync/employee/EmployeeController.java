package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.BlockerConversationService;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.eod.dto.ReplyRequest;
import com.nforceone.sync.employee.dto.DashboardSummaryDto;
import com.nforceone.sync.employee.dto.UtilizationDetailDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/employee")
public class EmployeeController {

    private final AppUserRepository userRepository;
    private final EmployeeService   employeeService;
    private final BlockerConversationService conversationService;

    public EmployeeController(AppUserRepository userRepository, EmployeeService employeeService,
                               BlockerConversationService conversationService) {
        this.userRepository  = userRepository;
        this.employeeService = employeeService;
        this.conversationService = conversationService;
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

    @PostMapping("/blockers/{taskId}/replies")
    public BlockerReplyDto postBlockerReply(@PathVariable Long taskId, @RequestBody ReplyRequest body) {
        return conversationService.postReplyAsEmployee(taskId, actingEmail(), body.message());
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
