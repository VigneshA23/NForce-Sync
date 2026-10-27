package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;

/**
 * The employee-side unread state of "My Blockers". A blocker counts as UNREAD when a reviewer (anyone but the
 * employee who raised it) replied after the employee last opened that blocker's thread. The sidebar badge is
 * the number of such blockers; opening the thread (markRead) clears it. Role-agnostic: it works for anyone who
 * has raised a blocker, whatever their account role — and for both kinds of blocker, a Submit EOD task and a
 * Daily Log line.
 */
@Service
public class BlockerReadService {

    private final BlockerReadStateRepository readStateRepository;
    private final AppUserRepository userRepository;
    private final BlockerSubjects subjects;

    @Autowired
    public BlockerReadService(BlockerReadStateRepository readStateRepository,
                              AppUserRepository userRepository,
                              BlockerSubjects subjects) {
        this.readStateRepository = readStateRepository;
        this.userRepository = userRepository;
        this.subjects = subjects;
    }

    /** Task-only wiring (Submit EOD blockers) — kept for callers and tests that predate the Daily Log blockers. */
    public BlockerReadService(BlockerReadStateRepository readStateRepository,
                              EodTaskRepository taskRepository,
                              AppUserRepository userRepository) {
        this(readStateRepository, userRepository, new BlockerSubjects(taskRepository, null, null));
    }

    @Transactional(readOnly = true)
    public long unreadCount(String actingEmail) {
        Long userId = requireUser(actingEmail).getId();
        return readStateRepository.countUnreadBlockersForEmployee(userId)
                + readStateRepository.countUnreadLineBlockersForEmployee(userId);
    }

    /** Opening a blocker's thread: only the employee who raised it has an unread state for it. */
    @Transactional
    public void markRead(Long blockerKey, String actingEmail) {
        AppUser user = requireUser(actingEmail);
        BlockerSubject subject = subjects.require(blockerKey);
        if (!subject.getBlockerEntry().getEmployee().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
        BlockerReadState state = (BlockerKey.isLine(blockerKey)
                ? readStateRepository.findByLogLineIdAndUserId(BlockerKey.lineId(blockerKey), user.getId())
                : readStateRepository.findByTaskIdAndUserId(BlockerKey.taskId(blockerKey), user.getId()))
                .orElseGet(() -> {
                    BlockerReadState s = new BlockerReadState();
                    s.setSubject(subject);
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
