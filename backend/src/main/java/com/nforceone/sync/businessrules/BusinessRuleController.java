package com.nforceone.sync.businessrules;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/business-rules")
@PreAuthorize("hasRole('SUPERADMIN')")
public class BusinessRuleController {

    private final BusinessRuleService businessRuleService;

    public BusinessRuleController(BusinessRuleService businessRuleService) {
        this.businessRuleService = businessRuleService;
    }

    // ── Config ──────────────────────────────────────────────────────────────────

    @GetMapping("/config")
    public BusinessRuleConfigDto getConfig() {
        return businessRuleService.getConfig();
    }

    // One endpoint per CARD, not per field. business_rule_config is a single row and every update
    // rewrites all of it, so several single-field requests fired by one Save button raced each
    // other and the last commit reverted the rest.

    @PutMapping("/time-attendance")
    public BusinessRuleConfigDto updateTimeAttendance(@Valid @RequestBody UpdateTimeAttendanceRequest request) {
        BusinessRuleConfig.WeekendRule rule;
        try {
            rule = BusinessRuleConfig.WeekendRule.valueOf(request.weekendRule());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid weekend rule: " + request.weekendRule());
        }
        return businessRuleService.updateTimeAttendance(request.hoursPerDay(), rule, actingEmail());
    }

    // PUT /eod-cutoff removed: the EOD deadline is now per shift (shift_definition.eod_cutoff_hours,
    // set through the shift endpoints below) rather than one global time-of-day.

    @PutMapping("/notifications")
    public BusinessRuleConfigDto updateNotifications(@Valid @RequestBody UpdateNotificationsRequest request) {
        return businessRuleService.updateNotifications(
                request.reminderLeadMinutes(),
                request.escalationSlaHours(),
                request.lockoutAttemptThreshold(),
                request.lockoutDurationMinutes(),
                actingEmail());
    }

    @PutMapping("/allowances")
    public BusinessRuleConfigDto updateAllowances(@Valid @RequestBody UpdateAllowancesRequest request) {
        return businessRuleService.updateAllowances(
                request.lateArrivalAllowance(),
                request.earlyLeaveAllowance(),
                request.interveningAllowance(),
                actingEmail());
    }

    // ── Shift timings ───────────────────────────────────────────────────────────

    @GetMapping("/shifts")
    public List<ShiftDefinitionDto> listShifts() {
        return businessRuleService.listShifts();
    }

    @PostMapping("/shifts")
    @ResponseStatus(HttpStatus.CREATED)
    public ShiftDefinitionDto createShift(@Valid @RequestBody CreateShiftRequest request) {
        return businessRuleService.createShift(request, actingEmail());
    }

    @PutMapping("/shifts/{id}")
    public ShiftDefinitionDto updateShift(@PathVariable Long id, @Valid @RequestBody UpdateShiftRequest request) {
        return businessRuleService.updateShift(id, request, actingEmail());
    }

    @PatchMapping("/shifts/{id}/toggle")
    public ShiftDefinitionDto toggleShift(@PathVariable Long id) {
        return businessRuleService.toggleShift(id, actingEmail());
    }

    @DeleteMapping("/shifts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteShift(@PathVariable Long id) {
        businessRuleService.deleteShift(id, actingEmail());
    }

    // ── Holiday calendar ────────────────────────────────────────────────────────

    @GetMapping("/holidays")
    public List<HolidayDto> listHolidays() {
        return businessRuleService.listHolidays();
    }

    @PostMapping("/holidays")
    @ResponseStatus(HttpStatus.CREATED)
    public HolidayDto createHoliday(@Valid @RequestBody CreateHolidayRequest request) {
        return businessRuleService.createHoliday(request, actingEmail());
    }

    @DeleteMapping("/holidays/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteHoliday(@PathVariable Long id) {
        businessRuleService.deleteHoliday(id, actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
