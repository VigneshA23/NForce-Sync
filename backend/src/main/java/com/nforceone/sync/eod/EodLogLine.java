package com.nforceone.sync.eod;

import com.nforceone.sync.project.TaskCategory;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

// One category line inside a PLAIN_LOG EOD entry — V110.
// Legacy PLAIN_LOG entries (before V110) have no rows here.
@Entity
@Table(name = "eod_log_line")
@Getter
@Setter
public class EodLogLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id", nullable = false)
    private EodEntry entry;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id", nullable = false)
    private TaskCategory category;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal hours;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
