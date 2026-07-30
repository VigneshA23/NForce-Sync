package com.nforceone.sync.businessrules;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import tools.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Business Rules are forward-only: saving a new value here only ever changes
 * what this row (or, for shifts/holidays, this row's flag) reads as of now.
 * Nothing in this service touches historical EOD/utilization/approval records —
 * consumers that read these values apply whatever is current at read time.
 */
@Service
@Transactional
public class BusinessRuleService {

    private static final long CONFIG_ID = 1L;

    private final BusinessRuleConfigRepository configRepository;
    private final ShiftDefinitionRepository shiftRepository;
    private final HolidayRepository holidayRepository;
    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    public BusinessRuleService(BusinessRuleConfigRepository configRepository,
                               ShiftDefinitionRepository shiftRepository,
                               HolidayRepository holidayRepository,
                               AppUserRepository userRepository,
                               AuditLogRepository auditLogRepository,
                               ObjectMapper objectMapper) {
        this.configRepository = configRepository;
        this.shiftRepository = shiftRepository;
        this.holidayRepository = holidayRepository;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper;
    }

    // ── Config (singleton row) ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public BusinessRuleConfigDto getConfig() {
        return BusinessRuleConfigDto.from(requireConfig());
    }

    public BusinessRuleConfigDto updateWorkingHours(BigDecimal hoursPerDay, String actingEmail) {
        BusinessRuleConfig config = requireConfig();
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot("Working Hours Per Day", config.getWorkingHoursPerDay());
        config.setWorkingHoursPerDay(hoursPerDay);
        touch(config, actor);
        Map<String, Object> after = ruleSnapshot("Working Hours Per Day", config.getWorkingHoursPerDay());
        writeAudit(CONFIG_ID, "UPDATE", before, after, actor);
        return BusinessRuleConfigDto.from(config);
    }

    public BusinessRuleConfigDto updateWeekendRule(BusinessRuleConfig.WeekendRule rule, String actingEmail) {
        BusinessRuleConfig config = requireConfig();
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot("Weekend Rule", config.getWeekendRule());
        config.setWeekendRule(rule);
        touch(config, actor);
        Map<String, Object> after = ruleSnapshot("Weekend Rule", config.getWeekendRule());
        writeAudit(CONFIG_ID, "UPDATE", before, after, actor);
        return BusinessRuleConfigDto.from(config);
    }

    public BusinessRuleConfigDto updateEodCutoff(java.time.LocalTime cutoffTime, String actingEmail) {
        BusinessRuleConfig config = requireConfig();
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot("EOD Cutoff Time", config.getEodCutoffTime());
        config.setEodCutoffTime(cutoffTime);
        touch(config, actor);
        Map<String, Object> after = ruleSnapshot("EOD Cutoff Time", config.getEodCutoffTime());
        writeAudit(CONFIG_ID, "UPDATE", before, after, actor);
        return BusinessRuleConfigDto.from(config);
    }

    public BusinessRuleConfigDto updateReminderLeadTime(Integer leadMinutes, String actingEmail) {
        BusinessRuleConfig config = requireConfig();
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot("Reminder Lead Time", config.getReminderLeadMinutes());
        config.setReminderLeadMinutes(leadMinutes);
        touch(config, actor);
        Map<String, Object> after = ruleSnapshot("Reminder Lead Time", config.getReminderLeadMinutes());
        writeAudit(CONFIG_ID, "UPDATE", before, after, actor);
        return BusinessRuleConfigDto.from(config);
    }

    public BusinessRuleConfigDto updateEscalationSla(Integer slaHours, String actingEmail) {
        BusinessRuleConfig config = requireConfig();
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot("Escalation SLA", config.getEscalationSlaHours());
        config.setEscalationSlaHours(slaHours);
        touch(config, actor);
        Map<String, Object> after = ruleSnapshot("Escalation SLA", config.getEscalationSlaHours());
        writeAudit(CONFIG_ID, "UPDATE", before, after, actor);
        return BusinessRuleConfigDto.from(config);
    }

    private void touch(BusinessRuleConfig config, AppUser actor) {
        config.setUpdatedAt(OffsetDateTime.now());
        config.setUpdatedBy(actor);
        configRepository.save(config);
    }

    private BusinessRuleConfig requireConfig() {
        return configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Business rule config row missing"));
    }

    // ── Shift timings ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ShiftDefinitionDto> listShifts() {
        return shiftRepository.findAllByOrderByStartTimeAsc().stream()
                .map(s -> ShiftDefinitionDto.from(s, shiftRepository.countEmployeesAssigned(s.getName())))
                .toList();
    }

    public ShiftDefinitionDto createShift(CreateShiftRequest req, String actingEmail) {
        if (shiftRepository.existsByName(req.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A shift with this name already exists");
        }
        validateShiftTimes(req.startTime(), req.endTime());
        AppUser actor = requireActorByEmail(actingEmail);
        ShiftDefinition shift = ShiftDefinition.builder()
                .name(req.name())
                .startTime(req.startTime())
                .endTime(req.endTime())
                .active(true)
                .build();
        shift = shiftRepository.save(shift);
        writeAudit(shift.getId(), "CREATE", null, ruleSnapshot(shift.getName(), shift.getStartTime() + "-" + shift.getEndTime()), actor);
        return ShiftDefinitionDto.from(shift);
    }

    public ShiftDefinitionDto updateShift(Long id, UpdateShiftRequest req, String actingEmail) {
        ShiftDefinition shift = requireShift(id);
        if (!shift.getName().equals(req.name()) && shiftRepository.existsByName(req.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A shift with this name already exists");
        }
        validateShiftTimes(req.startTime(), req.endTime());
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot(shift.getName(), shift.getStartTime() + "-" + shift.getEndTime());
        shift.setName(req.name());
        shift.setStartTime(req.startTime());
        shift.setEndTime(req.endTime());
        shift = shiftRepository.save(shift);
        Map<String, Object> after = ruleSnapshot(shift.getName(), shift.getStartTime() + "-" + shift.getEndTime());
        writeAudit(shift.getId(), "UPDATE", before, after, actor);
        return ShiftDefinitionDto.from(shift);
    }

    public ShiftDefinitionDto toggleShift(Long id, String actingEmail) {
        ShiftDefinition shift = requireShift(id);
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot(shift.getName(), shift.isActive());
        shift.setActive(!shift.isActive());
        shift = shiftRepository.save(shift);
        Map<String, Object> after = ruleSnapshot(shift.getName(), shift.isActive());
        writeAudit(shift.getId(), "STATUS_CHANGE", before, after, actor);
        return ShiftDefinitionDto.from(shift);
    }

    public void deleteShift(Long id, String actingEmail) {
        ShiftDefinition shift = requireShift(id);
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot(shift.getName(), shift.getStartTime() + "-" + shift.getEndTime());
        shiftRepository.deleteById(id);
        writeAudit(id, "DELETE", before, null, actor);
    }

    private void validateShiftTimes(java.time.LocalTime start, java.time.LocalTime end) {
        if (start.equals(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Start and end time cannot be the same");
        }
    }

    private ShiftDefinition requireShift(Long id) {
        return shiftRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shift not found"));
    }

    // ── Holiday calendar ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<HolidayDto> listHolidays() {
        return holidayRepository.findAllByOrderByHolidayDateAsc().stream().map(HolidayDto::from).toList();
    }

    public HolidayDto createHoliday(CreateHolidayRequest req, String actingEmail) {
        if (holidayRepository.existsByHolidayDate(req.holidayDate())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A holiday is already defined on this date");
        }
        AppUser actor = requireActorByEmail(actingEmail);
        Holiday holiday = Holiday.builder()
                .name(req.name())
                .holidayDate(req.holidayDate())
                .build();
        holiday = holidayRepository.save(holiday);
        writeAudit(holiday.getId(), "CREATE", null, ruleSnapshot(holiday.getName(), holiday.getHolidayDate()), actor);
        return HolidayDto.from(holiday);
    }

    public void deleteHoliday(Long id, String actingEmail) {
        Holiday holiday = holidayRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Holiday not found"));
        AppUser actor = requireActorByEmail(actingEmail);
        Map<String, Object> before = ruleSnapshot(holiday.getName(), holiday.getHolidayDate());
        holidayRepository.deleteById(id);
        writeAudit(id, "DELETE", before, null, actor);
    }

    // ── shared helpers ──────────────────────────────────────────────────────────

    private Map<String, Object> ruleSnapshot(String name, Object value) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("value", value);
        return map;
    }

    private AppUser requireActorByEmail(String email) {
        // Deleted-aware: see the note on AppUserRepository. A reused email matches multiple
        // rows and would throw IncorrectResultSizeDataAccessException here.
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private void writeAudit(Long entityId, String action, Map<String, Object> before, Map<String, Object> after, AppUser actor) {
        AuditLog log = new AuditLog();
        log.setEntityType("BUSINESS_RULE");
        log.setEntityId(entityId);
        log.setAction(action);
        log.setActor(actor);
        log.setBeforeValue(before == null ? null : toJson(before));
        log.setAfterValue(after == null ? null : toJson(after));
        log.setOccurredAt(OffsetDateTime.now());
        auditLogRepository.save(log);
    }

    private String toJson(Object obj) {
        // JacksonException is RuntimeException in Jackson 3 — no checked catch needed
        return objectMapper.writeValueAsString(obj);
    }
}
