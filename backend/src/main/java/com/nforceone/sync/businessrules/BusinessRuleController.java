package com.nforceone.sync.businessrules;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

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

    @PutMapping("/working-hours")
    public BusinessRuleConfigDto updateWorkingHours(@Valid @RequestBody UpdateWorkingHoursRequest request) {
        return businessRuleService.updateWorkingHours(request.hoursPerDay(), actingEmail());
    }

    @PutMapping("/weekend-rule")
    public BusinessRuleConfigDto updateWeekendRule(@Valid @RequestBody UpdateWeekendRuleRequest request) {
        return businessRuleService.updateWeekendRule(request.weekendRule(), actingEmail());
    }

    @PutMapping("/eod-cutoff")
    public BusinessRuleConfigDto updateEodCutoff(@Valid @RequestBody UpdateEodCutoffRequest request) {
        return businessRuleService.updateEodCutoff(request.cutoffTime(), actingEmail());
    }

    @PutMapping("/reminder-lead-time")
    public BusinessRuleConfigDto updateReminderLeadTime(@Valid @RequestBody UpdateReminderLeadTimeRequest request) {
        return businessRuleService.updateReminderLeadTime(request.leadMinutes(), actingEmail());
    }

    @PutMapping("/escalation-sla")
    public BusinessRuleConfigDto updateEscalationSla(@Valid @RequestBody UpdateEscalationSlaRequest request) {
        return businessRuleService.updateEscalationSla(request.slaHours(), actingEmail());
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
