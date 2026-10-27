package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** Per (blocker, viewing user): when the user last opened the blocker's reply thread. The employee-side
 *  unread badge counts blockers with a reviewer reply newer than this. One row per user per blocker
 *  (unique index), upserted on open — see BlockerReadService#markRead. Exactly one of {@code task} (Submit EOD) /
 *  {@code logLine} (Daily Log) is set. */
@Entity
@Table(name = "blocker_read_state")
@Getter
@Setter
public class BlockerReadState {

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
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(name = "last_read_at", nullable = false)
    private OffsetDateTime lastReadAt;

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
