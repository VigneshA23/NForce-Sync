package com.nforceone.sync.eod;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

/** Mirrors BlockerReplyAttachment field-for-field — same BYTEA/VARBINARY mapping rationale
 *  (see that class's comment on the `data` column). */
@Entity
@Table(name = "eod_clarification_reply_attachment")
@Getter
@Setter
public class EodClarificationReplyAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_id", nullable = false)
    private EodClarificationReply reply;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @JdbcTypeCode(SqlTypes.VARBINARY)
    @Column(nullable = false)
    private byte[] data;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
