package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;

/**
 * The employee-side unread state of "My Blockers". A blocker counts as UNREAD when a reviewer (anyone but the
 * employee who raised it) replied after the employee last opened that blocker's thread. The sidebar badge is
 * the number of such blockers; opening the thread (markRead) clears it. Role-agnostic: it works for anyone who
 * has raised a blocker, whatever their account role.
 */
@Service
public class BlockerReadService {

    private final BlockerReadStateRepository readStateRepository;
    private final EodTaskRepository taskRepository;
    private final AppUserRepository userRepository;

    public BlockerReadService(BlockerReadStateRepository readStateRepository,
                              EodTaskRepository taskRepository,
                              AppUserRepository userRepository) {
        this.readStateRepository = readStateRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public long unreadCount(String actingEmail) {
        return readStateRepository.countUnreadBlockersForEmployee(requireUser(actingEmail).getId());
    }

    /** Opening a blocker's thread: only the employee who raised it has an unread state for it. */
    @Transactional
    public void markRead(Long taskId, String actingEmail) {
        AppUser user = requireUser(actingEmail);
        EodTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));
        if (!task.getEodEntry().getEmployee().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
        BlockerReadState state = readStateRepository.findByTaskIdAndUserId(taskId, user.getId())
                .orElseGet(() -> {
                    BlockerReadState s = new BlockerReadState();
                    s.setTask(task);
                    s.setUser(user);
                    return s;
                });
        state.setLastReadAt(OffsetDateTime.now());
        readStateRepository.save(state);
    }

    private AppUser requireUser(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
