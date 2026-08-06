package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.notification.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Single shared thread per blocker (EodTask), readable/writable by both the reporting
 * employee and their Team Lead — there is no separate per-role copy of this data.
 *
 * Status rule ("last responder wins"): EodTask.acknowledgedAt/acknowledgedBy is
 * repurposed from a one-time flag into "timestamp/author of the most recent Team Lead
 * reply". A Team Lead reply sets it; a subsequent employee reply clears it back to null,
 * which re-flags the blocker as "Needs Response" on the Team Lead's Blockers page and KPIs.
 */
@Service
@Transactional
public class BlockerConversationService {

    private final BlockerReplyRepository replyRepository;
    private final EodTaskRepository taskRepository;
    private final AppUserRepository userRepository;
    private final NotificationService notificationService;

    public BlockerConversationService(BlockerReplyRepository replyRepository,
                                       EodTaskRepository taskRepository,
                                       AppUserRepository userRepository,
                                       NotificationService notificationService) {
        this.replyRepository = replyRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    @Transactional(readOnly = true)
    public List<BlockerReplyDto> getThreadForLead(Long taskId, String actingEmail) {
        AppUser lead = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireLeadOwnsTask(task, lead);
        return loadThread(task);
    }

    public BlockerReplyDto postReplyAsLead(Long taskId, String actingEmail, String message) {
        AppUser lead = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireLeadOwnsTask(task, lead);

        BlockerReply saved = saveReply(task, lead, message);

        task.setAcknowledgedAt(OffsetDateTime.now());
        task.setAcknowledgedBy(lead);
        taskRepository.save(task);

        AppUser employee = task.getEodEntry().getEmployee();
        notificationService.send(employee.getId(), "BLOCKER_REPLY",
                "Your Team Lead replied to your blocker",
                lead.getFullName() + " replied to your blocker: \"" + task.getDescription() + "\"",
                "/blockers?highlight=" + task.getId());

        return BlockerReplyDto.from(saved, task);
    }

    @Transactional(readOnly = true)
    public List<BlockerReplyDto> getThreadForEmployee(Long taskId, String actingEmail) {
        AppUser employee = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireEmployeeOwnsTask(task, employee);
        return loadThread(task);
    }

    public BlockerReplyDto postReplyAsEmployee(Long taskId, String actingEmail, String message) {
        AppUser employee = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireEmployeeOwnsTask(task, employee);

        BlockerReply saved = saveReply(task, employee, message);

        // Last-responder-wins: an employee follow-up re-opens the blocker for the Team Lead.
        task.setAcknowledgedAt(null);
        task.setAcknowledgedBy(null);
        taskRepository.save(task);

        AppUser lead = task.getEodEntry().getEmployee().getManager();
        notificationService.send(lead.getId(), "BLOCKER_REPLY",
                "New reply on a blocker",
                employee.getFullName() + " replied to their blocker: \"" + task.getDescription() + "\"",
                "/team/blockers?highlight=" + task.getId());

        return BlockerReplyDto.from(saved, task);
    }

    // ── shared helpers ────────────────────────────────────────────────────────

    private List<BlockerReplyDto> loadThread(EodTask task) {
        return replyRepository.findByTaskIdOrderByCreatedAtAsc(task.getId())
                .stream()
                .map(r -> BlockerReplyDto.from(r, task))
                .toList();
    }

    private BlockerReply saveReply(EodTask task, AppUser sender, String message) {
        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message must not be blank");
        }
        BlockerReply reply = new BlockerReply();
        reply.setTask(task);
        reply.setSender(sender);
        reply.setMessage(message.trim());
        reply.setCreatedAt(OffsetDateTime.now());
        return replyRepository.save(reply);
    }

    private EodTask requireTask(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));
    }

    private void requireLeadOwnsTask(EodTask task, AppUser lead) {
        if (!task.getEodEntry().getEmployee().getManager().getId().equals(lead.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }

    private void requireEmployeeOwnsTask(EodTask task, AppUser employee) {
        if (!task.getEodEntry().getEmployee().getId().equals(employee.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }

    private AppUser requireUser(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
