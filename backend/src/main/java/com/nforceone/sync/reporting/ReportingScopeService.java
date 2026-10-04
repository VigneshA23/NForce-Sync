package com.nforceone.sync.reporting;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ReportingScopeService {

    private final JdbcTemplate jdbc;

    public ReportingScopeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** All user IDs in the actor's reporting scope (subtree + allocated project members). Excludes actor. */
    @Transactional(readOnly = true)
    public List<Long> reportingScopeUserIds(Long actorId) {
        return jdbc.queryForList(
                "SELECT user_id FROM reporting_scope_member_ids(?)",
                Long.class, actorId);
    }

    /** Only the direct-report subtree (no project member expansion). */
    @Transactional(readOnly = true)
    public List<Long> subtreeUserIds(Long actorId) {
        return jdbc.queryForList(
                """
                WITH RECURSIVE subtree(id, depth) AS (
                  SELECT u.id, 0 FROM app_user u
                  WHERE u.manager_id = ? AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
                  UNION ALL
                  SELECT u.id, st.depth + 1 FROM app_user u
                  JOIN subtree st ON u.manager_id = st.id
                  WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND st.depth < 20
                )
                SELECT id FROM subtree
                """,
                Long.class, actorId);
    }

    @Transactional(readOnly = true)
    public boolean hasDirectReports(Long actorId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM app_user WHERE manager_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL",
                Integer.class, actorId);
        return count != null && count > 0;
    }
}
