package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** One message in an EodClarification round. Mirrors BlockerReply's shape — no attachments
 *  (not requested for this feature; the same pattern as blocker_reply_attachment could be added
 *  later identically if needed). */
@Entity
@Table(name = "eod_clarification_reply")
@Getter
@Setter
public class EodClarificationReply {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "clarification_id", nullable = false)
    private EodClarification clarification;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", nullable = false)
    private AppUser sender;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
