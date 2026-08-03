package com.nforceone.sync.eod;

import com.nforceone.sync.approval.ApprovalAction;
import com.nforceone.sync.approval.ApprovalActionRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class EodService {

    private static final String LEAVE_HOLIDAY = "Leave / Holiday";

    private static final java.util.Set<EodEntry.Status> NEEDS_COMMENT = java.util.Set.of(
            EodEntry.Status.REJECTED, EodEntry.Status.CHANGES_REQUESTED);

    private final EodEntryRepository      entryRepository;
    private final EodTaskRepository       taskRepository;
    private final AppUserRepository       userRepository;
    private final ProjectRepository       projectRepository;
    private final TaskCategoryRepository  categoryRepository;
    private final ApprovalActionRepository actionRepository;

    public EodService(EodEntryRepository entryRepository,
                      EodTaskRepository taskRepository,
                      AppUserRepository userRepository,
                      ProjectRepository projectRepository,
                      TaskCategoryRepository categoryRepository,
                      ApprovalActionRepository actionRepository) {
        this.entryRepository   = entryRepository;
        this.taskRepository    = taskRepository;
        this.userRepository    = userRepository;
        this.projectRepository = projectRepository;
        this.categoryRepository = categoryRepository;
        this.actionRepository  = actionRepository;
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

        entry.setWorkLocation(request.workLocation());
        entry.setNextDayPlan(request.nextDayPlan());
        entry.setRemarks(request.remarks());
        entry.setUpdatedAt(now);

        // Replace tasks
        entry.getTasks().clear();
        if (request.tasks() != null) {
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
        if (entry.getTasks().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At least one task is required before submitting");
        }

        for (EodTask task : entry.getTasks()) {
            if (task.getProject() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "All tasks must have a project assigned");
            }
            if (task.getTaskCategory() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "All tasks must have a category assigned");
            }
            if (task.getHours() == null || task.getHours().compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "All tasks must have a non-negative hours value");
            }
            if (LEAVE_HOLIDAY.equals(task.getTaskCategory().getName())
                    && task.getHours().compareTo(BigDecimal.ZERO) != 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Leave / Holiday tasks must have 0 hours");
            }
            if (task.getTaskStatus() == EodTask.TaskStatus.BLOCKED
                    && (task.getBlockerReason() == null || task.getBlockerReason().isBlank())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Blocked tasks must include a blocker reason");
            }
        }

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

        Map<Long, String> commentMap = needsComment.isEmpty()
                ? Map.of()
                : actionRepository.findReviewerCommentsByEntryIds(needsComment)
                        .stream()
                        // already ordered DESC per entry; toMap keeps the first (most recent)
                        .collect(Collectors.toMap(
                                a -> a.getEodEntry().getId(),
                                ApprovalAction::getComment,
                                (existing, ignored) -> existing));

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
