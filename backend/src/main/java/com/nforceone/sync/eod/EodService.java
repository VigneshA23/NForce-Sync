package com.nforceone.sync.eod;

import com.nforceone.sync.approval.ApprovalAction;
import com.nforceone.sync.approval.ApprovalActionRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.eod.dto.TimeAdjustmentContextDto;
import com.nforceone.sync.eod.dto.BlockedTaskDto;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.eod.dto.SaveEodTaskRequest;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.project.TaskCategoryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class EodService {

    /** Renamed from "Leave / Holiday" in V35 — Holiday is a day type now, not a category. */
    private static final String LEAVE = "Leave";

    /** business_rule_config is a singleton row; same id BusinessRuleService uses as CONFIG_ID. */
    private static final long BUSINESS_RULE_CONFIG_ID = 1L;

    /** Only used if the config row is somehow absent — the seeded value is 8. */
    private static final BigDecimal FALLBACK_HOURS_PER_DAY = BigDecimal.valueOf(8);

    /** Per-use duration limits for a time adjustment. Distinct from the monthly allowance. */
    private static final int MIN_ADJUSTMENT_MINUTES = 30;
    private static final int MAX_ADJUSTMENT_MINUTES = 120;

    private static final int MINUTES_PER_DAY = 24 * 60;

    private static final java.util.Set<EodEntry.Status> NEEDS_COMMENT = java.util.Set.of(
            EodEntry.Status.REJECTED, EodEntry.Status.CHANGES_REQUESTED);

    private final EodEntryRepository      entryRepository;
    private final EodTaskRepository       taskRepository;
    private final AppUserRepository       userRepository;
    private final ProjectRepository       projectRepository;
    private final TaskCategoryRepository  categoryRepository;
    private final ApprovalActionRepository actionRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final ShiftDefinitionRepository shiftRepository;

    public EodService(EodEntryRepository entryRepository,
                      EodTaskRepository taskRepository,
                      AppUserRepository userRepository,
                      ProjectRepository projectRepository,
                      TaskCategoryRepository categoryRepository,
                      ApprovalActionRepository actionRepository,
                      BusinessRuleConfigRepository configRepository,
                      ShiftDefinitionRepository shiftRepository) {
        this.entryRepository   = entryRepository;
        this.taskRepository    = taskRepository;
        this.userRepository    = userRepository;
        this.projectRepository = projectRepository;
        this.categoryRepository = categoryRepository;
        this.actionRepository  = actionRepository;
        this.configRepository  = configRepository;
        this.shiftRepository   = shiftRepository;
    }

    public EodEntryDto saveDraft(SaveEodRequest request, String actingEmail) {
        AppUser employee = requireUserByEmail(actingEmail);

        EodEntry entry = entryRepository
                .findByEmployeeIdAndEntryDate(employee.getId(), request.entryDate())
                .orElse(null);

        OffsetDateTime now = OffsetDateTime.now();

        if (entry == null) {
            entry = new EodEntry();
            entry.setEmployee(employee);
            entry.setEntryDate(request.entryDate());
            entry.setStatus(EodEntry.Status.DRAFT);
            entry.setCreatedAt(now);
        } else {
            if (!entry.isEditable()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Entry in status " + entry.getStatus() + " cannot be edited");
            }
            // Re-open as DRAFT when coming from REJECTED or CHANGES_REQUESTED
            entry.setStatus(EodEntry.Status.DRAFT);
        }

        EodEntry.DayType dayType = request.dayType() != null
                ? request.dayType()
                : EodEntry.DayType.WORKING_DAY;
        entry.setDayType(dayType);

        boolean isHoliday = dayType == EodEntry.DayType.HOLIDAY;

        // A holiday has nothing to log, so it carries no work location and no task rows.
        // Forced here rather than trusted from the request: this is the only path rows reach
        // the database, so a direct API call cannot smuggle them in.
        entry.setWorkLocation(isHoliday ? null : request.workLocation());
        entry.setNextDayPlan(request.nextDayPlan());
        entry.setRemarks(request.remarks());
        entry.setUpdatedAt(now);

        // A time adjustment is a shift on a working day, so switching day type must not leave a
        // stale one behind. Cleared unconditionally for LEAVE and HOLIDAY.
        boolean adjustmentAllowed = dayType == EodEntry.DayType.WORKING_DAY;
        entry.setTimeAdjustmentType(adjustmentAllowed ? request.timeAdjustmentType() : null);
        entry.setTimeAdjustmentMinutes(adjustmentAllowed ? request.timeAdjustmentMinutes() : null);

        // Replace tasks
        entry.getTasks().clear();
        if (!isHoliday && request.tasks() != null) {
            for (SaveEodTaskRequest taskReq : request.tasks()) {
                entry.getTasks().add(buildTask(taskReq, entry));
            }
        }

        return EodEntryDto.from(entryRepository.save(entry));
    }

    public EodEntryDto submit(Long entryId, String actingEmail) {
        AppUser employee = requireUserByEmail(actingEmail);
        EodEntry entry = requireEntryById(entryId);

        if (!entry.getEmployee().getId().equals(employee.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Cannot submit another employee's EOD entry");
        }
        if (!entry.isEditable()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Entry in status " + entry.getStatus() + " cannot be submitted");
        }
        // A holiday has nothing to log, so every task-level and hours check is skipped
        // outright — not satisfied with empty rows or 0 hours, simply not run.
        if (entry.getDayType() != EodEntry.DayType.HOLIDAY) {
            validateLoggedDay(entry);
        }

        validateTimeAdjustment(entry, employee);
        applyOvertime(entry, employee);

        OffsetDateTime now = OffsetDateTime.now();
        entry.setStatus(EodEntry.Status.SUBMITTED);
        entry.setSubmittedAt(now);
        entry.setUpdatedAt(now);

        return EodEntryDto.from(entryRepository.save(entry));
    }

    @Transactional(readOnly = true)
    public List<EodEntryDto> listEntries(Long employeeId, LocalDate from, LocalDate to,
                                          String actingEmail) {
        AppUser actor = requireUserByEmail(actingEmail);
        Long targetId = resolveTargetEmployee(actor, employeeId);

        List<EodEntry> entries = (from != null && to != null)
                ? entryRepository.findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(targetId, from, to)
                : entryRepository.findByEmployeeIdOrderByEntryDateDesc(targetId);

        return mapWithBatchedComments(entries);
    }

    @Transactional(readOnly = true)
    public EodEntryDto getEntry(Long entryId, String actingEmail) {
        AppUser actor = requireUserByEmail(actingEmail);
        EodEntry entry = requireEntryById(entryId);

        if (!canReadEntry(actor, entry)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied to this EOD entry");
        }
        return EodEntryDto.from(entry, latestReviewerComment(entry));
    }

    @Transactional(readOnly = true)
    public List<BlockedTaskDto> getBlockedTasks(Long managerId, String actingEmail) {
        AppUser actor = requireUserByEmail(actingEmail);
        if (actor.getRole() != AppUser.Role.SUPERADMIN && !actor.getId().equals(managerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return taskRepository.findBlockedByManagerId(managerId)
                .stream()
                .map(BlockedTaskDto::from)
                .toList();
    }

    // ── private helpers ─────────────────────────────────────────────

    /** True for a leave row. Category name is the only marker; see LEAVE. */
    private boolean isLeaveRow(EodTask task) {
        return task.getTaskCategory() != null
                && LEAVE.equals(task.getTaskCategory().getName());
    }

    /**
     * Daily hours cap, read from the admin-managed business_rule_config singleton rather
     * than hardcoded, so changing Working Hours Per Day takes effect here too.
     */
    private BigDecimal dailyHoursCap() {
        return configRepository.findById(BUSINESS_RULE_CONFIG_ID)
                .map(BusinessRuleConfig::getWorkingHoursPerDay)
                .orElse(FALLBACK_HOURS_PER_DAY);
    }

    /**
     * Task and hours validation for a day that actually logs work — WORKING_DAY or LEAVE.
     * Never called for HOLIDAY.
     */
    private void validateLoggedDay(EodEntry entry) {
        if (entry.getTasks().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At least one task row is required for a working/leave day.");
        }

        BigDecimal total = BigDecimal.ZERO;
        int rowNumber = 0;

        for (EodTask task : entry.getTasks()) {
            rowNumber++;
            if (task.getTaskCategory() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "All tasks must have a category assigned");
            }

            boolean leaveRow = isLeaveRow(task);

            // Leave is not project work, so a project is required only on real work rows.
            if (!leaveRow && task.getProject() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "All tasks must have a project assigned");
            }
            // Defence in depth: buildTask already strips these, so reaching here means a row
            // was written by some other path.
            if (leaveRow && (task.getProject() != null
                    || Boolean.TRUE.equals(task.getIsBillable())
                    || task.getTaskStatus() != EodTask.TaskStatus.COMPLETED)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Row #" + rowNumber + ": Leave rows cannot have a project or billable flag set.");
            }
            if (task.getHours() == null || task.getHours().compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "All tasks must have a non-negative hours value");
            }
            if (task.getTaskStatus() == EodTask.TaskStatus.BLOCKED
                    && (task.getBlockerReason() == null || task.getBlockerReason().isBlank())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Blocked tasks must include a blocker reason");
            }
            total = total.add(task.getHours());
        }
        // NOTE: total hours are deliberately NOT capped here. Exceeding the day's reference is
        // overtime, flagged for the manager in applyOvertime — never a rejection.
    }

    private BigDecimal totalHours(EodEntry entry) {
        return entry.getTasks().stream()
                .map(t -> t.getHours() != null ? t.getHours() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** The employee's shift, or null when none is assigned. */
    private ShiftDefinition shiftFor(AppUser employee) {
        return employee.getShiftId() == null
                ? null
                : shiftRepository.findById(employee.getShiftId()).orElse(null);
    }

    /**
     * Shift length in minutes. An end at or before the start means the shift crosses midnight
     * (e.g. 15:30-00:30), so a day is added rather than yielding a negative duration.
     */
    private int shiftDurationMinutes(ShiftDefinition shift) {
        int start = shift.getStartTime().getHour() * 60 + shift.getStartTime().getMinute();
        int end   = shift.getEndTime().getHour()   * 60 + shift.getEndTime().getMinute();
        if (end <= start) end += MINUTES_PER_DAY;
        return end - start;
    }

    private int allowanceFor(BusinessRuleConfig config, EodEntry.TimeAdjustmentType type) {
        return switch (type) {
            case LATE_ARRIVAL -> config.getLateArrivalAllowance();
            case EARLY_LEAVE  -> config.getEarlyLeaveAllowance();
            case INTERVENING  -> config.getInterveningAllowance();
        };
    }

    private static String label(EodEntry.TimeAdjustmentType type) {
        return switch (type) {
            case LATE_ARRIVAL -> "Late arrival";
            case EARLY_LEAVE  -> "Leaving early";
            case INTERVENING  -> "Intervening time-off";
        };
    }

    /**
     * Monthly uses already recorded for a type, excluding drafts and the entry being submitted.
     * The calendar-month window is derived from the entry date, so the allowance resets on its
     * own with no reset job.
     */
    private long usedThisMonth(Long employeeId, EodEntry.TimeAdjustmentType type,
                               LocalDate anyDateInMonth, Long excludeEntryId) {
        LocalDate from = anyDateInMonth.withDayOfMonth(1);
        LocalDate to   = anyDateInMonth.withDayOfMonth(anyDateInMonth.lengthOfMonth());
        return entryRepository.countAdjustmentsInPeriod(employeeId, type, from, to, excludeEntryId);
    }

    /** No-op when the entry carries no adjustment. */
    private void validateTimeAdjustment(EodEntry entry, AppUser employee) {
        EodEntry.TimeAdjustmentType type = entry.getTimeAdjustmentType();
        Integer minutes = entry.getTimeAdjustmentMinutes();

        // Minutes without a type means the form was submitted with the box ticked but nothing
        // chosen — worth an explicit message rather than silently dropping the request.
        if (type == null) {
            if (minutes != null && minutes > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Select a time adjustment type (Late arrival, Intervening time-off, or Leaving early).");
            }
            return;
        }

        if (minutes == null || minutes <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter a valid duration for this time adjustment.");
        }
        // Applies to ALL three types, not just late arrival. Re-checked here because the UI
        // constraint is a convenience, not a guarantee.
        if (minutes < MIN_ADJUSTMENT_MINUTES || minutes > MAX_ADJUSTMENT_MINUTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    label(type) + " must be between 30 minutes and 2 hours (got " + minutes + " minutes).");
        }

        ShiftDefinition shift = shiftFor(employee);
        if (shift == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A time adjustment needs an assigned shift. Contact your administrator.");
        }
        int shiftMinutes = shiftDurationMinutes(shift);
        if (minutes > shiftMinutes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Time adjustment minutes (" + minutes + ") cannot exceed the shift length ("
                            + shiftMinutes + " minutes).");
        }

        BusinessRuleConfig config = configRepository.findById(BUSINESS_RULE_CONFIG_ID).orElse(null);
        if (config != null) {
            int allowance = allowanceFor(config, type);
            long used = usedThisMonth(employee.getId(), type, entry.getEntryDate(), entry.getId());
            if (used >= allowance) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        label(type) + ": monthly limit reached (" + used + " of " + allowance + " used).");
            }
        }
    }

    /**
     * Flags hours beyond the day's reference as overtime. Applies to EVERY day. Never rejects —
     * employees may log additional hours independently of any adjustment.
     *
     * The reference is the PAID WORKING DAY (standard_hours_per_day), not the shift span. A shift
     * spans longer than it pays: 15:30-00:30 is 540 minutes but 480 of those are work, the other
     * 60 being an unpaid break that shift_definition does not model. Deducting the adjustment from
     * the 540 span would credit that break as work — a 2-hour early leave would expect 7 hours
     * instead of 6. The span is still used for the banner and the "not longer than your shift"
     * check, just not as the hours basis.
     */
    private void applyOvertime(EodEntry entry, AppUser employee) {
        if (entry.getDayType() == EodEntry.DayType.HOLIDAY) {
            entry.setIsOvertime(Boolean.FALSE);
            entry.setOvertimeHours(null);
            return;
        }

        BigDecimal reference = dailyHoursCap();

        Integer minutes = entry.getTimeAdjustmentMinutes();
        if (entry.getTimeAdjustmentType() != null && minutes != null) {
            BigDecimal adjustmentHours = BigDecimal.valueOf(minutes)
                    .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
            reference = reference.subtract(adjustmentHours).max(BigDecimal.ZERO);
        }

        BigDecimal excess = totalHours(entry).subtract(reference);
        boolean overtime = excess.compareTo(BigDecimal.ZERO) > 0;
        entry.setIsOvertime(overtime);
        entry.setOvertimeHours(overtime ? excess.setScale(2, RoundingMode.HALF_UP) : null);
    }

    /** Shift timings, allowances and current-month usage for the Submit EOD form. */
    @Transactional(readOnly = true)
    public TimeAdjustmentContextDto getTimeAdjustmentContext(LocalDate date, String actingEmail) {
        AppUser employee = requireUserByEmail(actingEmail);
        ShiftDefinition shift = shiftFor(employee);
        if (shift == null) return TimeAdjustmentContextDto.unassigned();

        BusinessRuleConfig config = configRepository.findById(BUSINESS_RULE_CONFIG_ID).orElse(null);
        LocalDate month = date != null ? date : LocalDate.now();

        return new TimeAdjustmentContextDto(
                true,
                shift.getName(),
                shift.getStartTime(),
                shift.getEndTime(),
                shiftDurationMinutes(shift),
                config != null ? config.getLateArrivalAllowance() : 0,
                config != null ? config.getEarlyLeaveAllowance()  : 0,
                config != null ? config.getInterveningAllowance() : 0,
                usedThisMonth(employee.getId(), EodEntry.TimeAdjustmentType.LATE_ARRIVAL, month, null),
                usedThisMonth(employee.getId(), EodEntry.TimeAdjustmentType.EARLY_LEAVE,  month, null),
                usedThisMonth(employee.getId(), EodEntry.TimeAdjustmentType.INTERVENING,  month, null)
        );
    }

    private EodTask buildTask(SaveEodTaskRequest req, EodEntry entry) {
        EodTask task = new EodTask();
        task.setEodEntry(entry);

        if (req.projectId() != null) {
            Project project = projectRepository.findById(req.projectId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "Project not found: " + req.projectId()));
            task.setProject(project);
        }
        if (req.taskCategoryId() != null) {
            TaskCategory category = categoryRepository.findById(req.taskCategoryId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "Task category not found: " + req.taskCategoryId()));
            task.setTaskCategory(category);
        }

        task.setDescription(req.description());
        task.setHours(req.hours());
        task.setTaskStatus(req.taskStatus() != null ? req.taskStatus() : EodTask.TaskStatus.COMPLETED);
        task.setIsBillable(req.isBillable() != null ? req.isBillable() : Boolean.TRUE);
        task.setBlockerReason(req.blockerReason());
        task.setSupportNeeded(req.supportNeeded());

        // A leave row is not work on a project: no project, never billable, always complete.
        // Overridden after assignment so the request body cannot set these regardless of what
        // it contains — the UI disables the fields, but this is what actually enforces it.
        if (isLeaveRow(task)) {
            task.setProject(null);
            task.setIsBillable(Boolean.FALSE);
            task.setTaskStatus(EodTask.TaskStatus.COMPLETED);
        }
        return task;
    }

    private Long resolveTargetEmployee(AppUser actor, Long requestedId) {
        boolean isPrivileged = actor.getRole() == AppUser.Role.MANAGER
                || actor.getRole() == AppUser.Role.SUPERADMIN
                || actor.getRole() == AppUser.Role.HR;
        if (!isPrivileged) {
            return actor.getId();
        }
        return requestedId != null ? requestedId : actor.getId();
    }

    private boolean canReadEntry(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return true;
        return actor.getRole() == AppUser.Role.MANAGER
            || actor.getRole() == AppUser.Role.SUPERADMIN
            || actor.getRole() == AppUser.Role.HR
            || actor.getRole() == AppUser.Role.DM
            || actor.getRole() == AppUser.Role.LEADERSHIP;
    }

    // Single-entry path: still used by getEntry()
    private String latestReviewerComment(EodEntry entry) {
        if (!NEEDS_COMMENT.contains(entry.getStatus())) return null;
        return actionRepository.findByEodEntryIdOrderByActedAtDesc(entry.getId())
                .stream()
                .filter(a -> a.getAction() == ApprovalAction.Action.REJECT
                          || a.getAction() == ApprovalAction.Action.REQUEST_CHANGES)
                .findFirst()
                .map(ApprovalAction::getComment)
                .orElse(null);
    }

    // Batch path: replaces N per-entry queries with a single IN query
    private List<EodEntryDto> mapWithBatchedComments(List<EodEntry> entries) {
        List<Long> needsComment = entries.stream()
                .filter(e -> NEEDS_COMMENT.contains(e.getStatus()))
                .map(EodEntry::getId)
                .toList();

        // Explicit loop rather than Collectors.toMap: comment is nullable, and toMap throws NPE on
        // a null VALUE — one reject recorded without a comment would 500 the whole EOD list.
        // containsKey (not putIfAbsent, which treats a null value as absent) keeps the same
        // "first wins = most recent" semantics, since the query is ordered actedAt DESC per entry.
        Map<Long, String> commentMap = new HashMap<>();
        if (!needsComment.isEmpty()) {
            for (ApprovalAction action : actionRepository.findReviewerCommentsByEntryIds(needsComment)) {
                Long entryId = action.getEodEntry().getId();
                if (!commentMap.containsKey(entryId)) {
                    commentMap.put(entryId, action.getComment());
                }
            }
        }

        return entries.stream()
                .map(e -> EodEntryDto.from(e, commentMap.get(e.getId())))
                .toList();
    }

    private AppUser requireUserByEmail(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private EodEntry requireEntryById(Long id) {
        return entryRepository.findWithDetailsById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "EOD entry not found"));
    }
}
