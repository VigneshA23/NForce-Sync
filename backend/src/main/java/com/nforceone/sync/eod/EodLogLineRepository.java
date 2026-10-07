package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EodLogLineRepository extends JpaRepository<EodLogLine, Long> {

    List<EodLogLine> findByEntryIdOrderBySortOrderAscIdAsc(Long entryId);

    // Batch load for multiple entries — avoids N+1 in mapWithBatchedComments.
    @Query("SELECT l FROM EodLogLine l WHERE l.entry.id IN :entryIds ORDER BY l.entry.id, l.sortOrder ASC, l.id ASC")
    List<EodLogLine> findByEntryIdInOrderBySortOrderAscIdAsc(@Param("entryIds") List<Long> entryIds);

    @Modifying
    @Query("DELETE FROM EodLogLine l WHERE l.entry.id = :entryId")
    void deleteByEntryId(@Param("entryId") Long entryId);
}
