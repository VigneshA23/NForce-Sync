package com.nforceone.sync.notification;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "notification")
@Getter
@Setter
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(nullable = false, length = 50)
    private String type;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Column(length = 500)
    private String link;

    /** Structured pointers for an "Open related page" action; null on types/rows that have none. */
    @Column(name = "related_employee_id")
    private Long relatedEmployeeId;

    @Column(name = "related_piece_id")
    private Long relatedPieceId;

    @Column(name = "related_eod_id")
    private Long relatedEodId;

    @Column(name = "related_eod_date")
    private LocalDate relatedEodDate;

    @Column(name = "is_read", nullable = false)
    private boolean read = false;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
