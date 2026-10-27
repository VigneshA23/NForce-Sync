package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** One message in a blocker's thread. Exactly one of {@code task} (Submit EOD) / {@code logLine} (Daily Log) is set. */
@Entity
@Table(name = "blocker_reply")
@Getter
@Setter
public class BlockerReply {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id")
    private EodTask task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "log_line_id")
    private EodLogLine logLine;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", nullable = false)
    private AppUser sender;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    /** The blocker this message belongs to, whichever kind it is. */
    public BlockerSubject getSubject() {
        return task != null ? task : logLine;
    }

    /** The API id of that blocker (see {@link BlockerKey}). */
    public Long getSubjectKey() {
        return getSubject().getBlockerKey();
    }

    public void setSubject(BlockerSubject subject) {
        if (subject instanceof EodLogLine line) {
            this.logLine = line;
            this.task = null;
        } else {
            this.task = (EodTask) subject;
            this.logLine = null;
        }
    }
}
