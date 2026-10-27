package com.nforceone.sync.eod;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The one place that knows a blocker is either an eod_task (Submit EOD) or an eod_log_line (Daily Log): it
 * resolves an API id (see {@link BlockerKey}) to the right row, saves it, loads its reply thread, and lists the
 * blockers a reporting manager or a member set sees from both sources. Everything else in the Blockers module
 * works against {@link BlockerSubject} and never branches on the kind.
 *
 * <p>The line repository may be absent (older wiring / unit tests that only exercise tasks); a line id then
 * simply does not resolve.
 */
@Component
public class BlockerSubjects {

    private final EodTaskRepository taskRepository;
    private final EodLogLineRepository logLineRepository;
    private final BlockerReplyRepository replyRepository;

    public BlockerSubjects(EodTaskRepository taskRepository,
                           EodLogLineRepository logLineRepository,
                           BlockerReplyRepository replyRepository) {
        this.taskRepository = taskRepository;
        this.logLineRepository = logLineRepository;
        this.replyRepository = replyRepository;
    }

    /** The blocker behind an API id, or 404 "Blocker not found". */
    public BlockerSubject require(Long key) {
        BlockerSubject found = BlockerKey.isLine(key)
                ? (logLineRepository == null ? null : logLineRepository.findById(BlockerKey.lineId(key)).orElse(null))
                : taskRepository.findById(BlockerKey.taskId(key)).orElse(null);
        if (found == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found");
        }
        return found;
    }

    public BlockerSubject save(BlockerSubject subject) {
        return subject instanceof EodLogLine line ? logLineRepository.save(line) : taskRepository.save((EodTask) subject);
    }

    /** One blocker's thread, oldest first. */
    public List<BlockerReply> thread(Long key) {
        return BlockerKey.isLine(key)
                ? replyRepository.findByLogLineIdOrderByCreatedAtAsc(BlockerKey.lineId(key))
                : replyRepository.findByTaskIdOrderByCreatedAtAsc(BlockerKey.taskId(key));
    }

    /** Threads for a whole list in two queries, keyed by blocker id. */
    public Map<Long, List<BlockerReply>> threads(Collection<? extends BlockerSubject> subjects) {
        List<Long> taskIds = new ArrayList<>();
        List<Long> lineIds = new ArrayList<>();
        for (BlockerSubject s : subjects) {
            if (s instanceof EodLogLine) lineIds.add(((EodLogLine) s).getId());
            else taskIds.add(((EodTask) s).getId());
        }
        Map<Long, List<BlockerReply>> byKey = new HashMap<>();
        if (!taskIds.isEmpty()) {
            for (BlockerReply r : replyRepository.findByTaskIdInOrderByCreatedAtAsc(taskIds)) {
                byKey.computeIfAbsent(r.getSubjectKey(), k -> new ArrayList<>()).add(r);
            }
        }
        if (!lineIds.isEmpty()) {
            for (BlockerReply r : replyRepository.findByLogLineIdInOrderByCreatedAtAsc(lineIds)) {
                byKey.computeIfAbsent(r.getSubjectKey(), k -> new ArrayList<>()).add(r);
            }
        }
        return byKey;
    }

    // ── Reporting manager / member scopes: tasks and Daily Log lines together ─────────────────────────

    /** Every blocker raised by someone who reports to {@code managerId} (frozen manager), Submit EOD and Daily Log. */
    public List<BlockerSubject> blockedForReportingManager(Long managerId, LocalDate from, LocalDate to,
                                                           OffsetDateTime fromTs, OffsetDateTime toTs) {
        List<BlockerSubject> all = new ArrayList<>(taskRepository.findBlockedForReportingManager(managerId, from, to, fromTs, toTs));
        if (logLineRepository != null) {
            all.addAll(logLineRepository.findBlockedForReportingManager(managerId, from, to, fromTs, toTs));
        }
        return byEntryDateDesc(all);
    }

    /** Blockers of a member set within an entry-date window (the reporting team's dashboard figures). */
    public List<BlockerSubject> blockedByEmployeeIds(List<Long> memberIds, LocalDate from, LocalDate to) {
        List<BlockerSubject> all = new ArrayList<>(taskRepository.findBlockedByEmployeeIdsInAndDateRange(memberIds, from, to));
        if (logLineRepository != null) {
            all.addAll(logLineRepository.findBlockedByEmployeeIdsInAndDateRange(memberIds, from, to));
        }
        return byEntryDateDesc(all);
    }

    private static List<BlockerSubject> byEntryDateDesc(List<BlockerSubject> subjects) {
        subjects.sort(Comparator.comparing((BlockerSubject s) -> s.getBlockerEntry().getEntryDate()).reversed());
        return subjects;
    }
}
